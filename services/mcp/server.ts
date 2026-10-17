import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import {
  fetchCHII2,
  fetchCHII2History,
  fetchPurdueBuoy,
  fetchPurdueBuoyHistory,
  isPurdueSeason,
} from '@/services/buoys/ndbc'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { readRace } from '@/services/races/readRace'
import { readRaces } from '@/services/races/readRaces'
import { currentConditions } from './current-conditions'
import { buoyHistory } from './buoy-history'
import { raceList, raceSummary } from './races'

/**
 * What the dashboard's own copy tells a sailor about these numbers, told to Claude instead.
 * It is the tool's contract with the model as much as the output shape is (ADR 0042).
 */
const CURRENT_CONDITIONS_DESCRIPTION = `What the wind is doing right now at Layline's two stations off Chicago, exactly as the Layline dashboard shows it.

- Harrison Dever Crib (CHII2) measures wind from an anemometer 85 ft above the water. Report its speed as the 85 ft reading it is, with its note that wind at this height typically reads 20-30% higher than at the surface; never present a surface figure of your own as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is the best on-water speed when deployed. It is seasonal, May through October; out of season it reports no wind at all, which is not a fault.
- Speeds are knots, directions are degrees true the wind blows FROM.
- Every station carries its Data Status (online, recent, stale, offline, or error if the read failed), the dashboard's own judgement of how fresh it is, and its Staleness: the age of the observation, as the dashboard prints it. Say how old a reading is when it is not online. A null wind means no reading; never fill one in.`

/** The station page's own caveats, told to Claude. Prose, so it is updated by hand (ADR 0042). */
const BUOY_HISTORY_DESCRIPTION = `How the wind has been at one of Layline's two stations off Chicago over a recent stretch, exactly as the Layline station page shows it: every reading in the window, newest first, and the page's Stats panel for that window.

- Harrison Dever Crib (CHII2) measures from an anemometer 85 ft above the water, and its gusts come off the same anemometer. Report its readings as the 85 ft figures they are, with its note that wind at this height typically reads 20-30% higher than at the surface; never present a surface figure of your own as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is seasonal, May through October; out of season it has no history at all, which is not a fault.
- Readings are as recorded, every ten minutes or so. Speeds and gusts are knots, directions degrees true the wind blows FROM, wave height feet. Gust and wave height appear only where the station page shows them; a null one is a moment the station reported none, so never fill it in from a neighbour.
- windowStats is derived by Layline from those readings, the figures the Stats panel prints: mean direction (vector-averaged), mean speed, the speed range, and the veer/back spread (twice the largest swing of any reading either side of that mean direction). It is null when the window holds fewer than three readings, where the page says "No data in window."
- Every answer carries its Data Status (online, recent, stale, offline, or error if the read failed) and its Staleness, the age of the newest reading as the dashboard prints it. Say how old the readings are when the station is not online.`

const LIST_RACES_DESCRIPTION = `Every Race in Layline's archive of this boat's recorded races, newest first, with what identifies each and how well it was recorded.

- A Race is named by the title the sailor gave it, which may be null: an untitled Race is normal, so call it by its day rather than inventing a name. The archive records no separate occasion; anything like "weeknight series" or "distance race" is only ever in the title.
- Times are the recording's own clock, exactly as logged, with no time zone. day and weekday are read from the window's start.
- Coverage is time, never rows, each as seconds with the screens' own wording: window is the race the sailor set, logged the part the recording's rows span (a dead, frozen feed included), and countable the part every performance figure reads (not frozen, not below the speed gate, not mid-maneuver). A Race whose countable time is a small share of its window is a thin one; say so when you use it.
- Pass a Race's id to race_summary for its figures.`

const RACE_SUMMARY_DESCRIPTION = `One Race as its page in Layline states it, computed by the same functions from the same read: aggregates only, never the recording's rows.

- boatSetup is the Polar, Crossover Chart, Rig Tune and Instrument Calibration Versions the Race was sailed under, frozen when it was recorded. Null means not recorded, which many older Races legitimately are; never assume the boat's current Version.
- coverage is time, never rows, as the page's coverage readout states it. recorded is live, measured sailing; frozen is a dead instrument feed repeating its last row, not a boat sitting still; beforeFirstRow and afterLastRow are parts of the window the recording never reached. list_races' logged spans live and frozen rows alike, so it is larger than recorded on a Race with a dropout. findings are the page's own notes about the recording; pass them on.
- maneuvers are TWA sign flips the detector classified as tacks, gybes and roundings. A recording at roughly thirty-second resolution holds a maneuver in one or two rows: count them, but do not state what one cost.
- performance is Polar Efficiency (speed over the ground against the Race's own Polar) and VMG Efficiency, over countable time only. fillerAnchoredShare is how much of each figure is compared against a cell the Polar manufactured rather than measured: state it beside the figure whenever it is above zero, never drop the figure for it. Target VMG is estimated, per its caveat. Where there is no figure, note says why.`

/**
 * A tool's answer as both forms MCP carries: JSON text for a client that reads only text, and the
 * same object as structured content.
 */
function answer(value: object): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: { ...value } }
}

/** A refusal Claude reads as a failed call, never as an answer about the archive. */
function refusal(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/**
 * A fresh server per request: the endpoint is stateless (ADR 0042), so nothing a server holds
 * outlives the one request it answers.
 *
 * Every tool is read-only, and the buoy services are the dashboard's own, cache included, so a
 * tool call adds no upstream request the screen would not have made.
 *
 * The archive tools read through `supabase`, the client built from the caller's own token, so
 * row-level security decides what they see exactly as it does for a screen. Never the service role.
 */
export function createLaylineMcpServer({ supabase }: { supabase: SupabaseClient }): McpServer {
  const server = new McpServer({ name: 'layline', version: '0.1.0' })

  server.registerTool(
    'current_conditions',
    {
      title: 'Current Conditions',
      description: CURRENT_CONDITIONS_DESCRIPTION,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [chii2, purdue] = await Promise.all([fetchCHII2(), fetchPurdueBuoy()])
      return answer(currentConditions({ chii2, purdue, now: new Date(), purdueInSeason: isPurdueSeason() }))
    }
  )

  server.registerTool(
    'buoy_history',
    {
      title: 'Buoy History',
      description: BUOY_HISTORY_DESCRIPTION,
      inputSchema: {
        station: z
          .enum(['CHII2', '45198'])
          .describe('CHII2 for the Harrison Dever Crib, 45198 for the Purdue Buoy.'),
        window: z
          .enum(Object.keys(TIME_SCALES) as [TimeScale, ...TimeScale[]])
          .default('1h')
          .describe(
            `How far back from now, as the station page's time scales: ${Object.entries(TIME_SCALES)
              .map(([id, scale]) => `${id} (${scale.label})`)
              .join(', ')}. The page opens on 1h.`
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ station, window }) => {
      const history = station === 'CHII2' ? await fetchCHII2History() : await fetchPurdueBuoyHistory()
      return answer(
        buoyHistory({ station, history, window, now: new Date(), purdueInSeason: isPurdueSeason() })
      )
    }
  )

  server.registerTool(
    'list_races',
    {
      title: 'Races',
      description: LIST_RACES_DESCRIPTION,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [races, archive] = await Promise.all([readRaces(supabase), readAnalysisArchive(supabase)])
      const list = raceList(races, archive)

      return list.ok
        ? answer({ races: list.races })
        : refusal('The race archive could not be read in full, so no list is given. Try again shortly.')
    }
  )

  server.registerTool(
    'race_summary',
    {
      title: 'Race summary',
      description: RACE_SUMMARY_DESCRIPTION,
      inputSchema: { race: z.string().describe("The Race's id, as list_races gives it.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ race: raceId }) => {
      const race = await readRace(raceId, supabase)

      // A missing Race, one RLS hides and one that could not be read whole are one answer, as on
      // the page: there is no Race here to summarise, and never part of one.
      return race === null
        ? refusal(
            `No Race with id ${raceId} could be read. Check the id against list_races; if it is listed, the read failed and may be retried.`
          )
        : answer(raceSummary(race))
    }
  )

  return server
}

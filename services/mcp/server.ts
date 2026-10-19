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
import { readRaceSailChart } from '@/services/races/race-sail-chart'
import { TRACK_OVERLAYS, TRACK_SCALES } from '@/services/analysis/track-overlays'
import type { TrackOverlay } from '@/types'
import { currentConditions } from './current-conditions'
import { buoyHistory } from './buoy-history'
import { raceList, raceSummary } from './races'
import { raceTrack } from './race-track'

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
- testimony is what the sailor recorded: each sail change and each sea state, with its time, in the race page's own words. A sail is named in the Crossover Chart Version the Race was sailed under; an entry with no sail named is only its note, so never put a chart sail to it. An empty list means nobody wrote that down, not that nothing changed: say "not recorded". Sea state is the sailor's own reading of the water, not a buoy measurement.
- maneuvers are TWA sign flips the detector classified as tacks, gybes and roundings. A recording at roughly thirty-second resolution holds a maneuver in one or two rows: count them, but do not state what one cost.
- performance is Polar Efficiency (speed over the ground against the Race's own Polar) and VMG Efficiency, over countable time only. fillerAnchoredShare is how much of each figure is compared against a cell the Polar manufactured rather than measured: state it beside the figure whenever it is above zero, never drop the figure for it. Target VMG is estimated, per its caveat. Where there is no figure, note says why.`

const RACE_TRACK_DESCRIPTION = `Where in one Race the figures came from, as its page in Layline draws it: the Race Track Heatmap's overlays, the Polar Plot and the Sail selection vs. chart tile, put as time. Use it for "where did we lose it: upwind or downwind?", "were we on the wrong sail on the second beat?" or "when did the feed drop out?". Aggregates and time spans only, never the recording's rows.

- track.overlays are the map's six: percent of Target Speed and of Target VMG (ratios against the Race's own Polar), sails vs. the Crossover Chart, and SOG, TWS and TWA (readings). Each gives the time in every band of its own scale with the band's words; TWS uses the wind bands and TWA is split by tack. Pass overlay to get one.
- gate says which sailing an overlay may colour. The ratios and the sail overlay read only countable time: not frozen, not below the speed gate, not mid-manoeuvre. The readings colour any live reading, so a parked boat still has a speed over the ground. Do not compare an overlay's coloured time with another's as if they were over the same sailing.
- coverage is time, never rows. Band time plus uncoloured time is the whole Race Window. uncolouredBy keeps each reason apart, including the window's edges before the first reading and after the last; for the sail overlay, no sail written down, a sail the chart has no word for and an angle below the chart's axes are each their own reason, never a difference from the chart. fillerAnchored is the part of a ratio's time compared against a cell the Polar manufactured rather than measured: say so beside the figure, never drop it.
- runs are the race as a timeline: consecutive stretches in one band or one uncoloured reason, merged, in time order, each with from, to and its time. A run never bridges a dropout; the frozen stretch is a run of its own. Times are the recording's own clock, exactly as logged, with no time zone.
- dropouts are each dead stretch of the instrument feed, as the map bridges it. A frozen feed is the last reading repeated, not a boat sitting still.
- testimony is what the sailor said about sails and sea state, placed is where the map could put it on the track, and unplaced is still what the sailor said, about a moment no position is near.
- polarPlot.patches bin the Race's countable sailing by |TWA| and SOG (binWidth gives the bin sizes; twaDeg and sogKnots are each bin's lower edge), with each patch's Polar and VMG Efficiency and the time behind it. Low |TWA| is upwind, high is downwind: this is what answers upwind against downwind. undrawn is the sailing on no patch, by reason.
- sailChart is the race page's tile, against the Crossover Chart Version the Race names, never the current chart. composition is every verdict as a share of the Race's sailing on the chart. following and differing are each side's own percent of target, side by side; never subtract them into a verdict. Where there is no figure, note says why.
- A difference from the chart is something to look at, not a fault: the crew may have had a good reason. Never call the sailing or the chart wrong.
- Every wind figure (TWS, TWA, and so each target) was computed by qtVlm from the recording, not measured at the masthead. Target VMG is estimated, per the overlay's caveat.`

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

  server.registerTool(
    'race_track',
    {
      title: 'Race track',
      description: RACE_TRACK_DESCRIPTION,
      inputSchema: {
        race: z.string().describe("The Race's id, as list_races gives it."),
        overlay: z
          .enum(TRACK_OVERLAYS as [TrackOverlay, ...TrackOverlay[]])
          .optional()
          .describe(
            `One of the map's overlays: ${TRACK_OVERLAYS.map(
              (overlay) => `${overlay} (${TRACK_SCALES[overlay].title})`
            ).join(', ')}. Every overlay without it.`
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ race: raceId, overlay }) => {
      // The page's two reads, together, as the caller: the Race, and the archive its sail tile is
      // folded from. No second read of the Transcription.
      const [race, archive] = await Promise.all([
        readRace(raceId, supabase),
        readAnalysisArchive(supabase),
      ])

      if (race === null) {
        // Never a partial track. The Races there are, so the id can be checked.
        const races = await readRaces(supabase)
        const known = races.map((each) => `${each.id} (${each.title ?? `untitled, ${each.window_start}`})`)
        return refusal(
          `No Race with id ${raceId} could be read.${
            known.length > 0 ? ` The Races this account can read are: ${known.join('; ')}.` : ''
          } If the id is among them, the read failed and may be retried.`
        )
      }

      return answer(raceTrack(race, await readRaceSailChart(race, archive, supabase), overlay))
    }
  )

  return server
}

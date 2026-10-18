import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { BOAT_SETUP_LABEL, BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import { readBoatSetup } from '@/services/boat/readBoatSetup'
import { readCrossoverChartVersionsWithCharts } from '@/services/boat/readCrossoverChartVersions'
import { readInstrumentCalibration } from '@/services/boat/readInstrumentCalibration'
import { readPolarVersions } from '@/services/boat/readPolarVersions'
import { readRigTune } from '@/services/boat/readRigTune'
import {
  fetchCHII2,
  fetchCHII2History,
  fetchPurdueBuoy,
  fetchPurdueBuoyHistory,
  isPurdueSeason,
} from '@/services/buoys/ndbc'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { currentConditions } from './current-conditions'
import { buoyHistory } from './buoy-history'
import {
  boatSetupOverview,
  crossoverChartVersions,
  instrumentCalibrationVersions,
  polarVersions,
  rigTuneVersions,
  type BoatSetupResult,
} from './boat-setup'
import type { BoatSetupKind } from '@/types'

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

/** The Boat Management screens' own caveats, told to Claude. Prose, so it is updated by hand (ADR 0042). */
const BOAT_SETUP_DESCRIPTION = `The boat's Boat Setup exactly as Layline's Boat Management screens state it: the four artifacts a Race is sailed under (Polar, Crossover Chart, Rig Tune, Instrument Calibration), and every Version of each.

- With no arguments: the boat and each artifact's Version in force. current null means not recorded, which is a real answer about the boat, not a fault.
- With an artifact: every Version of it, newest first, or with version the one Version of that number. race_summary names the Versions a Race was sailed under by number: pass that number here to open the Version the Race holds, which is often not the one in force now. Never answer for a Race from the current Version.
- Every Version carries its effectiveFrom (the calendar date the sailor says it took effect), its note, and inForce.
- rig_tune: each Version's change reason and its Wind Bands up the wind axis. A band's range, label and note are the tuning guide's words; label is never the dashboard's light/medium/heavy wind classification. Every shroud position is stated port and starboard, both as the Turnbuckle Gap in mm and as Turns From Base (signed half turns, counted from the Base Tune). Neither derives from the other, since no thread pitch is recorded, so never convert one to the other. gapsStale means the Base Tune was re-measured after that band was, so its Gaps describe a rig that no longer exists while its Turns still hold; say so, and never recompute a Gap.
- instrument_calibration: each Version's figures per channel in the TL-25 display's own encoding, exactly as transcribed: a multiplier reads 1.02, not +2%, and each channel corrects a reading as multiplier × reading + offset. AWA and HDG take an offset alone ("no multiplier"), which is not a missing figure. changes is what that Version moved against the one before it. With every Version, calibrationLog is the dated history, newest first, of Version changes and Calibration Events (acts such as an autocompensation that changed no programmed figure). That log answers when a channel was last recalibrated.
- crossover_chart: each Version's Sail Definitions by number and label, and how many chart cells call for each; a sail no cell calls for is "never recommended", which is legal. sailDefinitions null means that Version's stored chart can no longer be read.
- polar: each Version's number, date, note and file, but never the grid. For a target or an efficiency, use polar_performance, which states them as the screens do.`

/**
 * A tool's answer as both forms MCP carries: JSON text for a client that reads only text, and the
 * same object as structured content.
 */
function answer(value: object): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: { ...value } }
}

/** A refusal Claude reads as a failed call, never as an answer about the boat. */
function refusal(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function stated<Answer extends object>(result: BoatSetupResult<Answer>): CallToolResult {
  return result.ok ? answer(result.answer) : refusal(result.refusal)
}

/** One artifact's screen, read through the caller's client and shaped by `boat-setup`. */
async function artifactVersions(
  artifact: BoatSetupKind,
  version: number | undefined,
  supabase: SupabaseClient
): Promise<CallToolResult> {
  switch (artifact) {
    case 'polar':
      return stated(polarVersions(await readPolarVersions(supabase), version))
    case 'crossover_chart':
      return stated(crossoverChartVersions(await readCrossoverChartVersionsWithCharts(supabase), version))
    case 'rig_tune':
      return stated(rigTuneVersions(await readRigTune(supabase), version))
    case 'instrument_calibration':
      return stated(instrumentCalibrationVersions(await readInstrumentCalibration(supabase), version))
  }
}

/**
 * A fresh server per request: the endpoint is stateless (ADR 0042), so nothing a server holds
 * outlives the one request it answers.
 *
 * Every tool is read-only, and the buoy services are the dashboard's own, cache included, so a
 * tool call adds no upstream request the screen would not have made.
 *
 * The boat tools read through `supabase`, the client built from the caller's own token, so
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
      const answer = currentConditions({ chii2, purdue, now: new Date(), purdueInSeason: isPurdueSeason() })

      return {
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        structuredContent: { ...answer },
      }
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
      const answer = buoyHistory({ station, history, window, now: new Date(), purdueInSeason: isPurdueSeason() })

      return {
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        structuredContent: { ...answer },
      }
    }
  )

  const artifacts = BOAT_SETUP_ORDER.join(', ')

  server.registerTool(
    'boat_setup',
    {
      title: 'Boat Setup',
      description: BOAT_SETUP_DESCRIPTION,
      inputSchema: {
        artifact: z
          .enum(BOAT_SETUP_ORDER)
          .optional()
          .describe(
            `Which artifact: ${BOAT_SETUP_ORDER.map((kind) => `${kind} (${BOAT_SETUP_LABEL[kind]})`).join(
              ', '
            )}. Omit it for the boat and every artifact's Version in force.`
          ),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "One Version of the artifact, by its number, as race_summary names it. Omit it for every Version."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ artifact, version }) => {
      if (artifact === undefined) {
        return version === undefined
          ? stated(boatSetupOverview(await readBoatSetup(supabase)))
          : refusal(`A Version is a Version of one artifact. Name it as well: one of ${artifacts}.`)
      }

      return artifactVersions(artifact, version, supabase)
    }
  )

  return server
}

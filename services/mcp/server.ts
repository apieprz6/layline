import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
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

/**
 * A fresh server per request: the endpoint is stateless (ADR 0042), so nothing a server holds
 * outlives the one request it answers.
 *
 * Every tool is read-only, and the buoy services are the dashboard's own, cache included, so a
 * tool call adds no upstream request the screen would not have made.
 */
export function createLaylineMcpServer(): McpServer {
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

  return server
}

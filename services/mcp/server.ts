import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fetchCHII2, fetchPurdueBuoy, isPurdueSeason } from '@/services/buoys/ndbc'
import { currentConditions } from './current-conditions'

/**
 * What the dashboard's own copy tells a sailor about these numbers, told to Claude instead.
 * It is the tool's contract with the model as much as the output shape is (ADR 0042).
 */
const CURRENT_CONDITIONS_DESCRIPTION = `What the wind is doing right now at Layline's two stations off Chicago, exactly as the Layline dashboard shows it.

- Harrison Dever Crib (CHII2) measures wind from an anemometer 85 ft above the water. Report its speed as the 85 ft reading it is; surface wind is typically 20-30% lower, so say so rather than presenting a surface figure as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is the best on-water speed when deployed. It is seasonal, May through October; out of season it reports no wind at all, which is not a fault.
- Speeds are knots, directions are degrees true the wind blows FROM.
- Every station carries its Data Status (online < 30 min old, recent < 60, stale < 150, offline beyond, error if the read failed) and Staleness, the age of the observation. Say how old a reading is when it is not online. A null wind means no reading; never fill one in.`

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

  return server
}

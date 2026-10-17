import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { fetchCHII2, fetchPurdueBuoy, isPurdueSeason } from '@/services/buoys/ndbc'
import { analysisFilterSchema, readAnalysisFilterArgument } from './analysis-filter'
import { currentConditions } from './current-conditions'
import { polarPerformanceAnswer } from './polar-performance'

/**
 * What the dashboard's own copy tells a sailor about these numbers, told to Claude instead.
 * It is the tool's contract with the model as much as the output shape is (ADR 0042).
 */
const CURRENT_CONDITIONS_DESCRIPTION = `What the wind is doing right now at Layline's two stations off Chicago, exactly as the Layline dashboard shows it.

- Harrison Dever Crib (CHII2) measures wind from an anemometer 85 ft above the water. Report its speed as the 85 ft reading it is, with its note that wind at this height typically reads 20-30% higher than at the surface; never present a surface figure of your own as measured. It is best for direction and trend.
- The Purdue Buoy (45198) measures at the surface and is the best on-water speed when deployed. It is seasonal, May through October; out of season it reports no wind at all, which is not a fault.
- Speeds are knots, directions are degrees true the wind blows FROM.
- Every station carries its Data Status (online, recent, stale, offline, or error if the read failed), the dashboard's own judgement of how fresh it is, and its Staleness: the age of the observation, as the dashboard prints it. Say how old a reading is when it is not online. A null wind means no reading; never fill one in.`

const POLAR_PERFORMANCE_DESCRIPTION = `Season Polar Efficiency and VMG Efficiency over the boat's race archive, narrowed by the Analysis Filter, exactly as Layline's Polar performance screen states them.

- Polar Efficiency is total distance sailed over the distance the Polar's Target Speed implies, across all the scored sailing the filter matches; VMG Efficiency is the same for VMG against Target VMG. Each row is scored against the Polar its own race was sailed under. Report them as the percentages given.
- The filter offers the screen's five dimensions: point of sail, sail used, sea state, time of day and when. There is no wind-speed dimension: on the screen the Polar Plot owns the wind axis, and the figures are over every wind speed the filter matches. If asked about a wind band, say these figures span all wind speeds; never present them as a band's.
- A dimension left out includes everything, Not recorded included. Naming buckets narrows to exactly those. Sails are named by their Sail Definition label, never a number; every answer lists each dimension's valid buckets.
- Every answer carries its Coverage Ledger: how much sailing time matched, how much of it was scored, what was excluded and why, and how much has no Sea State or Sail Configuration recorded. State how much sailing is behind a figure, especially when it is little.
- A figure may be Filler-Anchored: part of it is compared against Polar cells the Polar manufactured rather than measured. Give the figure and say what share is Filler-Anchored; do not withhold it.
- Target VMG is estimated from the Polar's grid, not the certificate's own optimum.
- A null figure means nothing in the match could be scored; never fill one in.`

/** What a tool answers when the archive could not be read whole: an error, never a figure. */
const ARCHIVE_UNREADABLE =
  'The race archive could not be read, so there is no figure to give. This is not the same as having no races.'

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

/**
 * A fresh server per request: the endpoint is stateless (ADR 0042), so nothing a server holds
 * outlives the one request it answers.
 *
 * Every tool is read-only, and the buoy services are the dashboard's own, cache included, so a
 * tool call adds no upstream request the screen would not have made.
 *
 * `supabase` is the caller's own client, built from their token: every archive read goes out on
 * it, so row-level security decides what a tool sees exactly as it does for a screen.
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
    'polar_performance',
    {
      title: 'Polar performance',
      description: POLAR_PERFORMANCE_DESCRIPTION,
      inputSchema: { filter: analysisFilterSchema(POLAR_PERFORMANCE_DIMENSIONS) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ filter }) => {
      // All or nothing (ADR 0026): a short archive would make the Coverage Ledger the wrong part.
      const archive = await readAnalysisArchive(supabase)
      if (archive === null) return toolError(ARCHIVE_UNREADABLE)

      const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, archive.vocabulary)
      const reading = readAnalysisFilterArgument(filter, dimensions)
      if (!reading.ok) return toolError(reading.message)

      const answer = polarPerformanceAnswer(archive.rows, reading.filter, dimensions)
      return {
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        structuredContent: { ...answer },
      }
    }
  )

  return server
}

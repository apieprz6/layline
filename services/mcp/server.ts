import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import {
  fetchCHII2,
  fetchCHII2History,
  fetchPurdueBuoy,
  fetchPurdueBuoyHistory,
  isPurdueSeason,
} from '@/services/buoys/ndbc'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { analysisFilterSchema, filterFromArgument } from './analysis-filter'
import { buoyHistory } from './buoy-history'
import { currentConditions } from './current-conditions'
import { polarPerformanceAnswer, windWindowFromArgument } from './polar-performance'

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

const POLAR_PERFORMANCE_DESCRIPTION = `Season Polar Efficiency and VMG Efficiency over the boat's race archive, narrowed by the Analysis Filter, exactly as Layline's Polar performance screen states them.

- Polar Efficiency is total distance sailed over the distance the Polar's Target Speed implies, across all the scored sailing the filter matches; VMG Efficiency is the same for VMG against Target VMG. Each race's sailing is scored against the Polar that race was sailed under. Report them as the percentages given.
- The two headline figures blend every wind speed the filter matches. Each moment is scored against its own wind's target, but one percentage over all winds can hide that the boat is 110% of target at 4 knots and 50% at 12. Never present the headline figures as any wind band's.
- To answer about a wind range, pass windWindow: the Polar performance screen's own wind window, a centre in whole knots and a width of 2, 4 or 6 (windWindowOptions in every answer says which centres the Polar allows). 10-14 knots is { centre: 12, width: 4 }. The window has its own Polar Efficiency over the sailing inside it (the screen prints it under the window, as reading; there is no VMG figure for a window, because VMG collapses at the beam by definition), the Polar columns that sailing was scored against, and its patches: 5 degrees of |TWA| by half a knot of SOG, each with its own percent of target, time, races and Filler-Anchored share. Compare patches only within one window, and call again for another band rather than merging windows. Port and starboard are not told apart.
- The filter offers the screen's five dimensions: point of sail, sail used, sea state, time of day and when. Wind speed is not one of them; on the screen the wind window owns that axis.
- A dimension left out includes everything, Not recorded included. Naming buckets narrows to exactly those. Sails are named by their Sail Definition label, never a number; every answer lists each dimension's valid buckets.
- Every answer carries its Coverage Ledger: how much sailing time matched, how much of it was scored, what was excluded and why, and how much has no Sea State or Sail Configuration recorded. Each figure also states its own scored time; VMG Efficiency can rest on less than Polar Efficiency. State how much sailing is behind a figure, especially when it is little.
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

  server.registerTool(
    'polar_performance',
    {
      title: 'Polar performance',
      description: POLAR_PERFORMANCE_DESCRIPTION,
      inputSchema: {
        filter: analysisFilterSchema(POLAR_PERFORMANCE_DIMENSIONS),
        windWindow: z
          .object({
            centre: z.number().describe('Centre of the wind window, in whole knots of TWS.'),
            width: z.number().describe('Width of the window in knots: 2, 4 or 6.'),
          })
          .optional()
          .describe(
            "The screen's wind window. TWS from centre - width/2 inclusive to centre + width/2 exclusive."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ filter, windWindow }) => {
      // All or nothing (ADR 0026): a short archive would make the Coverage Ledger the wrong part.
      const archive = await readAnalysisArchive(supabase)
      if (archive === null) return toolError(ARCHIVE_UNREADABLE)

      const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, archive.vocabulary)
      const reading = filterFromArgument(filter, dimensions)
      if (!reading.ok) return toolError(reading.message)

      const window = windWindow === undefined ? null : windWindowFromArgument(windWindow, archive.polars)
      if (window !== null && !window.ok) return toolError(window.message)

      const answer = polarPerformanceAnswer(
        archive.rows,
        reading.filter,
        dimensions,
        archive.polars,
        window?.window ?? null
      )
      return {
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        structuredContent: { ...answer },
      }
    }
  )

  return server
}

/**
 * Reading the **Crossover Chart**'s Versions.
 *
 * The queries live in `readFileBackedVersions`, which both file-backed kinds share. What is here is
 * this artifact's own three answers to that reader: which kind, what to call itself in a log line,
 * and which schema decides whether a stored payload is still a chart.
 *
 * That last one is the **structure** and not the write gate. A stored Version is asked only whether
 * it can still be drawn — the rectangle, and every cell resolving to a definition. The
 * corrected-name rule is Layline policy on the way in, and a table of renames that grows must not
 * reach back and make a chart the boat really sailed with unreadable (see `crossoverPayload`).
 *
 * One Version carries both halves — the grid and its Sail Definitions — because two artifacts with
 * separate version histories would let a Race freeze a pairing that never existed aboard the boat
 * (ADR 0012). So there is nothing here to read the definitions with: they are in the payload the
 * schema has just validated.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateCrossoverChartStructure } from '@/services/boat/crossoverPayload'
import { fileBackedVersionReader } from '@/services/boat/readFileBackedVersions'
import type {
  CrossoverChartPayload,
  CrossoverChartScreen,
  CrossoverChartVersionDetail,
  FileBackedVersionDetailList,
  FileBackedVersionList,
} from '@/types'

const crossoverChart = fileBackedVersionReader({
  kind: 'crossover_chart',
  label: 'Crossover Chart',
  payloadIs: 'a chart',
  validate: validateCrossoverChartStructure,
})

/**
 * Every Crossover Chart Version, newest first, or `null` when the read failed.
 *
 * `null` is not an empty archive. An empty archive is `versions: []`, which is the state the app
 * ships in and which the screen says *not recorded* to; a failed read is reported as one.
 */
export function readCrossoverChartVersions(
  client?: SupabaseClient
): Promise<FileBackedVersionList | null> {
  return crossoverChart.readVersions(client)
}

/** One Version with its grid and definitions, or `null` when there is no such Version to read. */
export function readCrossoverChartVersion(
  versionId: string,
  client?: SupabaseClient
): Promise<CrossoverChartVersionDetail | null> {
  return crossoverChart.readVersion(versionId, client)
}

/** The list and the chart in force together, for the screen that shows both. */
export function readCrossoverChartScreen(
  client?: SupabaseClient
): Promise<CrossoverChartScreen | null> {
  return crossoverChart.readScreen(client)
}

/**
 * Every Version with its chart, newest first, or `null` when the read failed — for the MCP server,
 * which states each Version's Sail Definitions. A Version whose stored chart is unreadable is listed
 * with `payload: null`.
 */
export function readCrossoverChartVersionsWithCharts(
  client?: SupabaseClient
): Promise<FileBackedVersionDetailList<CrossoverChartPayload> | null> {
  return crossoverChart.readVersionsWithPayloads(client)
}

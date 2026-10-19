/**
 * A Race's sails against the **Crossover Chart Version** the Race itself names: the read, and the
 * words the race page's *Sail selection vs. chart* tile states it in.
 *
 * Out of the page file because two callers state it — the tile, and the MCP's `race_track` — and
 * the wording is part of the figure (ADR 0042, *A tool inherits every rule and owns none*): a tool
 * composing its own sentence for "no chart Version" or its own share of "no sail recorded" would be
 * a second place for the two to drift.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { polarDomain } from '@/services/analysis/polar-targets'
import type { AnalysisArchive } from '@/services/analysis/readArchive'
import {
  raceChartAgreement,
  verdictShares,
  type CellVerdict,
  type RaceChartAgreement,
  type RaceSailChartRead,
} from '@/services/analysis/sail-selection'
import { readCrossoverChartVersion } from '@/services/boat/readCrossoverChartVersions'
import type { RaceDetail } from '@/types'

/**
 * This race's sails against the Crossover Chart Version the race itself names.
 *
 * The Version its map's sail overlay reads (ADR 0012), so the tile and the map beside it judge the
 * same sailing against the same vocabulary — never the chart in force now, which would re-judge an
 * older race against a chart written after it. The rows are the archive's own for this race, judged
 * by the Sail Selection Screen's fold, so on a race sailed under the Version that screen draws the
 * two agree exactly.
 *
 * `client` is the one the Race was read as, so the chart is read as the same caller.
 */
export async function readRaceSailChart(
  race: Pick<RaceDetail, 'id' | 'boat_setup'>,
  archive: AnalysisArchive | null,
  client?: SupabaseClient
): Promise<RaceSailChartRead> {
  const named = race.boat_setup.crossover_chart
  if (named === null) return { ok: false, reason: 'no-chart-version' }
  if (archive === null) return { ok: false, reason: 'archive-unreadable' }

  const chart = await readCrossoverChartVersion(named.version_id, client)
  if (chart === null) return { ok: false, reason: 'chart-unreadable' }

  // The race's own Polar, as the archive already read it, for the legend's words about the cells it
  // cannot score; it moves no figure.
  const polar =
    race.boat_setup.polar === null ? undefined : archive.polars[race.boat_setup.polar.version_id]

  return {
    ok: true,
    agreement: raceChartAgreement(
      archive.rows,
      race.id,
      chart.payload,
      polar === undefined ? null : polarDomain(polar),
      named.version_id
    ),
    chart_version_number: named.version_number,
  }
}

type NoChartReason = Extract<RaceSailChartRead, { ok: false }>['reason']

/** Why there is no slice, in words — the map's sail overlay says the same of the same race. */
const NO_CHART_WORDS: Readonly<Record<NoChartReason, string>> = {
  'no-chart-version':
    'This race names no Crossover Chart Version, so there is nothing to lay its sails over.',
  'chart-unreadable':
    'The Crossover Chart Version this race names could not be read, so its sails cannot be laid over it.',
  'archive-unreadable':
    'The archive could not be read, so this race’s sailing cannot be laid over the chart.',
}

export function noChartNote(reason: NoChartReason): string {
  return NO_CHART_WORDS[reason]
}

/**
 * Why the tile has no share to print, in its words, or null where it has one.
 *
 * Two different absences: sailing that reached no cell of the chart at all, and sailing on the
 * chart none of which could be judged — and of that, sailing whose sail nobody wrote down.
 */
export function tileNote({ verdicts, placed_rows, agreement }: RaceChartAgreement): string | null {
  if (placed_rows === 0) {
    return 'This race’s Countable sailing falls on no cell of the chart, so there is nothing to compare.'
  }
  if (agreement !== null) return null
  if (verdicts['not-recorded'] === placed_rows) {
    return 'This race recorded no sail for any of its sailing on the chart, so none of it can be judged.'
  }
  return 'Nothing this race carried can be judged against the chart.'
}

/** Each verdict a row can take, in words that read after a share: "20% no sail recorded". */
const VERDICT_WORDS: Readonly<Record<CellVerdict, string>> = {
  agrees: 'the chart’s sail',
  differs: 'another sail',
  'not-recorded': 'no sail recorded',
  'off-chart': 'a sail the chart has no word for',
  'other-version': 'under another chart Version',
}

/**
 * The Race's sailing on the chart by verdict, as shares of all of it: the tile's composition line.
 *
 * `verdictShares` — the cell sheet's own proportions — over every placed row of the Race, so **Not
 * recorded** and **Off-chart** stand beside Agrees and Differs as proportions of their own, never
 * folded into Differs (ADR 0023, ADR 0030). A verdict nothing carried is not listed. Empty where
 * nothing was placed.
 */
export function raceComposition(
  agreement: RaceChartAgreement
): { verdict: CellVerdict; share: number; words: string }[] {
  return verdictShares({ rows: agreement.placed_rows, verdicts: agreement.verdicts }).map(
    ({ verdict, share }) => ({ verdict, share, words: VERDICT_WORDS[verdict] })
  )
}

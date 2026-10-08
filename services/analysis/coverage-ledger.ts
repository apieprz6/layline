/**
 * The **Coverage Ledger**: the permanent line under an **Analysis Filter**.
 *
 * It says what is matched — rows, and how many **Races** they come from — and then how much of
 * that rests on rows nobody annotated. Always, never only on narrowing (ADR 0029): half this
 * archive carries no **Sea State** and no **Sail Configuration**, and a figure that surfaced only
 * when something looked wrong would teach a sailor nothing about the archive they are reasoning
 * about. This is ADR 0008's provenance rule applied to absence — state what the record does not
 * say, in place, every time.
 *
 * Isomorphic for the same reason `filter.ts` is: the ledger has to move with the filter, and the
 * filter moves without a navigation.
 *
 * ## Why the counts and the words are both here
 *
 * The sentence is part of the decision. "Of those, 1,593 (49%) have no Sea state recorded" is what
 * ADR 0029 settled on, and three screens will print it; a renderer composing it from the pieces
 * would be three chances for one of them to say "N/A" or "49% missing" instead. So the phrasing
 * lives beside the arithmetic and is tested with it.
 */

import { countOf } from '@/services/analysis/figures'
import { NOT_RECORDED, bucketOf, matchesFilter } from '@/services/analysis/filter'
import type {
  AnalysisDimension,
  AnalysisDimensionSpec,
  AnalysisFilter,
  CoverageLedger,
  CoverageLedgerGap,
  MatchableRow,
} from '@/types'

/**
 * What is missing when a dimension's value was never recorded — the thing, not the chip.
 *
 * "Have no Sail used recorded" is not English and "have no Sail Configuration recorded" is what
 * ADR 0029 wrote, because the chip is named for the question the sailor asks and the ledger states
 * what the record lacks. Two different sentences, so two different words.
 *
 * The three that are not **Testimony** read as channels, which is what they are: a row with no
 * `TWS` is a gap in the recording, not something the sailor forgot to say.
 */
const MISSING: Record<AnalysisDimension, string> = {
  wind: 'true wind speed recorded in the row',
  pos: 'TWA recorded in the row',
  sail: 'Sail Configuration',
  sea: 'Sea state',
  time: 'time of day',
  when: 'date',
}

/**
 * The ledger over one row set and one filter.
 *
 * The totals are over every row given — the whole archive the screen shipped — and the matched
 * counts over the ones this filter admits. Both, because "3,251 rows" says nothing on its own:
 * what a sailor reads is how much of the archive they are looking at.
 *
 * Races are counted by **grouping matched rows**, never by filtering at the Race (ADR 0026): one
 * Race can hold two **Sail Configurations** and two Sea States across its duration, so asking a
 * Race whether it matches would need a second resolution rule nobody wrote.
 */
export function coverageLedger(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): CoverageLedger {
  const matched = rows.filter((row) => matchesFilter(row, filter, dimensions))
  const missing = new Map<AnalysisDimension, number>()

  for (const row of matched) {
    for (const dimension of dimensions) {
      if (bucketOf(row, dimension.id) !== NOT_RECORDED) continue
      missing.set(dimension.id, (missing.get(dimension.id) ?? 0) + 1)
    }
  }

  const gaps: CoverageLedgerGap[] = dimensions
    .flatMap((dimension) => {
      const gapRows = missing.get(dimension.id) ?? 0
      if (gapRows === 0) return []

      return [
        {
          dimension: dimension.id,
          label: MISSING[dimension.id],
          rows: gapRows,
          // Null and not zero where nothing matched: there is no share of nothing, and a 0%
          // would read as "none of these rows is missing anything".
          share: matched.length === 0 ? null : gapRows / matched.length,
        },
      ]
    })
    // Biggest first. ADR 0029's whole argument against the mockup's trailing chip is that the
    // largest gap is the one a sailor most needs to see, and a registry-ordered list would bury
    // it behind whichever dimension the rail happens to draw first.
    .sort((left, right) => right.rows - left.rows)

  return {
    matched_rows: matched.length,
    total_rows: rows.length,
    matched_races: new Set(matched.map((row) => row.race_id)).size,
    total_races: new Set(rows.map((row) => row.race_id)).size,
    countable_rows: matched.filter((row) => row.countable).length,
    gaps,
  }
}

/** `3,251 rows · 13 of 13 races` — the ledger's first line. */
export function ledgerHeadline(ledger: CoverageLedger): string {
  const rows = `${countOf(ledger.matched_rows)} row${ledger.matched_rows === 1 ? '' : 's'}`
  return `${rows} · ${ledger.matched_races} of ${ledger.total_races} races`
}

/** `Of those, 1,593 (49%) have no Sea state recorded.` — one gap, in ADR 0029's own words. */
export function gapSentence(gap: CoverageLedgerGap): string {
  const share = gap.share === null ? '' : ` (${Math.round(gap.share * 100)}%)`
  return `Of those, ${countOf(gap.rows)}${share} have no ${gap.label} recorded.`
}

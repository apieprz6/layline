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
 * ## Why the figures and the words are both here
 *
 * The sentence is part of the decision. "Of that, 49% has no Sea state recorded" is ADR 0029's own
 * shape, and three screens will print it; a renderer composing it from the pieces would be three
 * chances for one of them to say "N/A" or "49% missing" instead. So the phrasing lives beside the
 * arithmetic and is tested with it.
 */

import { sharePercent } from '@/services/analysis/figures'
import { NOT_RECORDED, bucketOf, matchesFilter } from '@/services/analysis/filter'
import { describeDuration } from '@/services/recordings/coverage'
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

/** A row's own measured span, or nothing where none could be measured. */
const seconds = (row: MatchableRow): number => row.interval_seconds ?? 0

/**
 * The ledger over one row set and one filter.
 *
 * The totals are over every row given — the whole archive the screen shipped — and the matched
 * figures over the ones this filter admits. Both, because "4h 12m" says nothing on its own: what a
 * sailor reads is how much of the archive they are looking at.
 *
 * **Measured in time, not in rows.** The Race list already refuses to print a row count, because a
 * duration can be held against a sailor's memory of the afternoon and a count cannot (ADR 0009);
 * here the count is worse than unhelpful, since qtVlm logs on events rather than on a clock and so
 * the same number of rows is twenty minutes on one recording and four hours on another. Each row's
 * own measured interval is also exactly what weights every figure beside this (ADR 0036), so the
 * ledger and the figures are now counting in the same unit.
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
      missing.set(dimension.id, (missing.get(dimension.id) ?? 0) + seconds(row))
    }
  }

  const matchedSeconds = matched.reduce((total, row) => total + seconds(row), 0)

  const gaps: CoverageLedgerGap[] = dimensions
    .flatMap((dimension) => {
      const gapSeconds = missing.get(dimension.id) ?? 0
      if (gapSeconds === 0) return []

      return [
        {
          dimension: dimension.id,
          label: MISSING[dimension.id],
          seconds: gapSeconds,
          // Null and not zero where nothing was measured: there is no share of nothing, and a 0%
          // would read as "none of this is missing anything".
          share: matchedSeconds === 0 ? null : gapSeconds / matchedSeconds,
        },
      ]
    })
    // Biggest first. ADR 0029's whole argument against the mockup's trailing chip is that the
    // largest gap is the one a sailor most needs to see, and a registry-ordered list would bury
    // it behind whichever dimension the rail happens to draw first.
    .sort((left, right) => right.seconds - left.seconds)

  return {
    matched_seconds: matchedSeconds,
    total_seconds: rows.reduce((total, row) => total + seconds(row), 0),
    countable_seconds: matched
      .filter((row) => row.countable)
      .reduce((total, row) => total + seconds(row), 0),
    matched_rows: matched.length,
    matched_races: new Set(matched.map((row) => row.race_id)).size,
    total_races: new Set(rows.map((row) => row.race_id)).size,
    gaps,
  }
}

/**
 * `13 of 13 races · 4h 12m recorded` — the ledger's first line.
 *
 * The races lead, because that is the thing a sailor holds in their head: thirteen afternoons, of
 * which this is some. The duration follows as the size of the evidence.
 */
export function ledgerHeadline(ledger: CoverageLedger): string {
  return (
    `${ledger.matched_races} of ${ledger.total_races} races · ` +
    `${describeDuration(ledger.matched_seconds)} recorded`
  )
}

/**
 * `3h 1m of it can be scored; 1h 11m is frozen, low-speed or mid-maneuver.`
 *
 * Matching and counting are independent questions (ADR 0026), and the figures above the ledger are
 * over the **Countable** part alone — so the part and the whole are both stated rather than the
 * ledger quietly reporting one of them. The second clause is dropped when nothing was excluded,
 * because "0s is frozen" is a sentence about nothing.
 */
export function countableSentence(ledger: CoverageLedger): string {
  const excluded = ledger.matched_seconds - ledger.countable_seconds
  const scored = `${describeDuration(ledger.countable_seconds)} of it can be scored`

  return excluded <= 0
    ? `${scored}.`
    : `${scored}; ${describeDuration(excluded)} is frozen, low-speed or mid-maneuver.`
}

/** `Of that, 49% has no Sea state recorded.` — one gap, in ADR 0029's own shape. */
export function gapSentence(gap: CoverageLedgerGap): string {
  const share = gap.share === null ? describeDuration(gap.seconds) : sharePercent(gap.share)
  return `Of that, ${share} has no ${gap.label} recorded.`
}

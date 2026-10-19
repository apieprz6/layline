/**
 * The Polar performance screen's aggregation: ADR 0026's `getPolarPerformanceData`.
 *
 * Composes the two layers under it and adds nothing of its own — the **Analysis Filter** decides
 * which rows (`filter.ts`), **Countable** decides which of those may be read (ADR 0025), and the
 * ratio of sums decides what the figure is (`efficiency.ts`). What is here is the screen's shape:
 * one figure over the whole matched set, and the **Coverage Ledger** beside it. The per-wind-band
 * list that used to sit under them is the **Polar Plot** now (ADR 0040, `polar-plot.ts`), drawn
 * over the same matched rows.
 *
 * Isomorphic, like the two layers it composes: ADR 0029 runs this in the browser on every chip
 * tap.
 *
 * ## Why the aggregate is additive across races, with no per-race pass
 *
 * `efficiency.ts` warns that a season figure must add races' sums rather than average their
 * ratios, and that the rows of two races are not one sequence. Both hazards are about *measuring*
 * — an interval differenced across a race boundary, a percentage averaged across races. Neither
 * survives here, because a `MatchableRow` arrives with its interval already measured over its own
 * race's window and its target already read from the **Polar** its own race was sailed under (ADR
 * 0012). So summing the archive's rows in one pass and summing thirteen races' sums give the same
 * number, and this does the first.
 *
 * ## No recent-N default
 *
 * The screen defaults to the **whole archive**. A recent window is something the sailor asks for
 * through the `when` chip, never something the screen quietly applied — thirteen races is the
 * entire evidence base, and a default that hid most of it would make the **Coverage Ledger**'s own
 * totals a lie. The Overall tab's teaser is the one place a recent window appears, it says so in
 * as many words, and it gets there by reading five races rather than by slicing thirteen
 * (`readRecentRaceRows`).
 */

import { coverageLedger, notCountableSeconds } from '@/services/analysis/coverage-ledger'
import { matchedRows } from '@/services/analysis/filter'
import { sumEfficiency } from '@/services/analysis/efficiency'
import { describeDuration } from '@/services/recordings/coverage'
import type {
  AnalysisDimensionSpec,
  AnalysisFilter,
  CoverageLedger,
  EfficiencyAggregate,
  MatchableRow,
} from '@/types'

/** What the Polar performance screen draws. Typed here and not centrally: nothing else names it. */
export interface PolarPerformance {
  /** Always present, narrowed or not (ADR 0029). */
  ledger: CoverageLedger
  /** **Polar Efficiency** and **VMG Efficiency** over every matched, Countable row. */
  overall: EfficiencyAggregate
}

/** Where a figure has no number: nothing in the match could be scored. */
export const NOTHING_SCORED = 'Nothing in this match could be scored against the Polar.'

/**
 * The screen's figures over one filter.
 *
 * The ledger is computed from the same rows and the same filter rather than from the matched set,
 * so its totals are the archive's and its matched counts cannot drift from the figure beside them.
 */
export function getPolarPerformanceData(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): PolarPerformance {
  return {
    ledger: coverageLedger(rows, filter, dimensions),
    overall: sumEfficiency(matchedRows(rows, filter, dimensions)),
  }
}

/**
 * Why a Race has no Polar or VMG Efficiency, in the words its page and the MCP Server both use.
 *
 * Takes the track's `scoring` whole, so the one place that decides which sentence a Race gets is
 * here rather than a ternary in each caller.
 */
export function noFigureNote(scoring: 'no-polar-version' | 'polar-unreadable' | 'polar'): string {
  return scoring === 'polar-unreadable'
    ? 'The Polar this race names could not be read, so neither figure can be computed.'
    : 'This race records no Polar Version, so neither figure can be computed.'
}

/**
 * How much of **Polar Efficiency** rests on the Polar's own filler, or null where no row was summed.
 *
 * A share and not a boolean, because a flag that fired on one row in three thousand would say the
 * same thing as a flag over a figure built entirely out of ramp cells. ADR 0036's rule is that the
 * figure is shown with the doubt attached, which means the doubt has to be sized.
 */
export function fillerAnchoredShare(aggregate: EfficiencyAggregate): number | null {
  return aggregate.rows === 0 ? null : aggregate.filler_anchored_rows / aggregate.rows
}

/**
 * The same, for **VMG Efficiency**, over **its own** rows.
 *
 * A separate function rather than a second reading of the one above, because the two figures are
 * over different subsets: a row can carry a **Target Speed** and no **Target VMG**. Sharing the
 * denominator would print a caveat about rows that are not in the number it sits beside — which is
 * worse than no caveat, because it reads as having been checked.
 */
export function vmgFillerAnchoredShare(aggregate: EfficiencyAggregate): number | null {
  return aggregate.vmg_rows === 0
    ? null
    : aggregate.vmg_filler_anchored_rows / aggregate.vmg_rows
}


/**
 * Whether a figure carries the **Filler-Anchored** flag at all: some of it, however little.
 *
 * One rule for every place the flag is drawn or stated — the figure, the teaser, the MCP tool —
 * so a figure is never flagged in one and clean in another.
 */
export function isFillerFlagged(share: number | null): boolean {
  return share !== null && share > 0
}

/**
 * `Both figures are total distance over total target distance across 3h 1m of scored sailing.`
 *
 * A ratio of sums, said out loud: a sailor comparing this against an averaged percentage somewhere
 * else has to be able to see why they differ (ADR 0036). Stating the evidence as *time* is what
 * makes that nearly self-evident — the weighting is the denominator.
 */
export function scoredSailingSentence(overall: EfficiencyAggregate): string {
  return (
    'Both figures are total distance over total target distance across ' +
    `${describeDuration(overall.elapsed_seconds)} of scored sailing.`
  )
}

/** Matched sailing left out of a figure, and why. */
/** Matched sailing every figure leaves out, said the same way on every screen that states it. */
export const NOT_COUNTABLE_REASON = 'Not Countable: frozen, low-speed or mid-maneuver'

export interface FigureExclusion {
  reason: string
  seconds: number
}

/**
 * Everything the filter matched that a figure is not over, in time, with the reason.
 *
 * The three tallies `sumEfficiency` keeps, turned into the seconds they stand for. A **Countable**
 * row with no measured interval adds no time to the ledger, so what is Countable and not summed
 * lacked a SOG or a Target Speed; and VMG sums its own subset of the summed rows, so it can rest on
 * less. A reason with no time behind it is left out — "0s is frozen" is a sentence about nothing.
 */
export function excludedFromFigures({ ledger, overall }: PolarPerformance): FigureExclusion[] {
  return [
    { reason: NOT_COUNTABLE_REASON, seconds: notCountableSeconds(ledger) },
    {
      reason:
        'Countable, but not scored: no SOG, or no Target Speed (outside the Polar, or no Polar ' +
        'for the race)',
      seconds: ledger.countable_seconds - overall.elapsed_seconds,
    },
    {
      reason: 'Scored for Polar Efficiency, but no Target VMG: left out of VMG Efficiency only',
      seconds: overall.elapsed_seconds - overall.vmg_elapsed_seconds,
    },
  ].filter((each) => each.seconds > 0)
}

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

import { coverageLedger } from '@/services/analysis/coverage-ledger'
import { matchedRows } from '@/services/analysis/filter'
import { sumEfficiency } from '@/services/analysis/efficiency'
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


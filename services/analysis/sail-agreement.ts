/**
 * What the boat flew against what its **Crossover Chart** called for, row by row.
 *
 * **Cell Agreement** already exists as a figure — the same comparison counted over one chart cell's
 * **Countable** rows (ADR 0030) — and this is that comparison at the grain the map draws: one row,
 * one verdict. The two must not disagree, so both read the chart through `crossoverLookup` and both
 * compare the same two things.
 *
 * ## What is being compared, and what is not
 *
 * A **Sail Configuration** is what the sailor says was up; the chart says what was *suggested*. The
 * two are compared and never conflated (CONTEXT.md), and this module states a disagreement without
 * making it a fault: a boat carrying the A2 through a lull the chart would have reefed for is a
 * decision somebody made on the water, often a good one.
 *
 * Both sides must speak the same vocabulary, and there is only one: the **Crossover Chart Version**
 * the Race points at owns it (ADR 0023). A Configuration names a **Sail Definition** *number* of
 * that Version, so agreement is an integer comparison against the number the chart's own cell
 * holds — never a match on names, which would make "Main + A2" and "Main+A2" two different sails.
 *
 * ## Four ways there is no verdict, and each says which
 *
 * They are kept apart because they are different facts about different things, and a single "no"
 * would flatten a decision the sailor made, a gap in the archive, and the edge of the chart into
 * one shrug:
 *
 * - **The Race records no Crossover Chart Version.** Then it has no sail vocabulary at all, and it
 *   can hold no Sail Configurations either (ADR 0023) — there is nothing on either side.
 * - **Nothing was written down as flying here.** An empty list is legal and ordinary: it means the
 *   race is not remembered, not that the boat sailed bare-headed (ADR 0010).
 * - **What was flying has no name in the chart.** A Configuration may be a note instead of a
 *   Definition, because the boat flew something the chart does not name. There is no integer to
 *   compare, and inventing the nearest Definition would be Layline deciding what was up.
 * - **The chart has no cell at this angle and wind speed.** Below either axis a floor lookup has no
 *   floor, which is missing rather than zero — four rows of this archive sit under the chart's own
 *   first column (ADR 0028).
 */

import type { CrossoverLookup } from '@/services/analysis/crossover-lookup'
import { annotationInForce } from '@/services/races/annotations'
import type { SailAgreement } from '@/types'

/**
 * One **Sail Configuration** as this comparison reads it: when, which Definition, in whose words.
 *
 * The label arrives already resolved against the Race's own chart Version and is carried for the
 * readout only — the comparison is on `definition_number` (ADR 0023).
 */
export interface FlownSail {
  at: string
  definition_number: number | null
  label: string | null
}

/** The chart to compare against, and the Testimony to compare with it. */
export interface SailChartContext {
  lookup: CrossoverLookup
  entries: readonly FlownSail[]
}

export interface SailComparison {
  agreement: SailAgreement
  /** What the sailor said was up, in the chart Version's own words. Null where none was named. */
  flown: string | null
  /** What the chart calls for here. Null where it cannot answer. */
  recommended: string | null
}

/**
 * The chart's verdict on one row, or which of the four reasons there is none.
 *
 * `chart` is null for a race that records no Crossover Chart Version, which is a property of the
 * Race rather than of the row — passed in rather than inferred, because "no chart was recorded" and
 * "the chart has no cell out here" are different sentences on screen.
 */
export function compareSailToChart(
  row: { row_time: string; twa: number | null; tws: number | null },
  chart: SailChartContext | null
): SailComparison {
  const nothing = (agreement: SailAgreement): SailComparison => ({
    agreement,
    flown: null,
    recommended: null,
  })

  if (chart === null) return nothing('no_chart_version')

  // What was flying *at this moment*: the Configuration in force, through ADR 0010's own rule
  // rather than a second copy of it — including its load-bearing half, that the earliest testimony
  // carries *backwards*, because the sails were up before the sailor got round to saying so. The
  // amend flow's charts resolve through the same function, so one race cannot read two ways.
  // Null therefore means only one thing: nobody wrote anything down.
  const flying = annotationInForce(chart.entries, row.row_time)
  if (flying === null) return nothing('no_sail_recorded')

  if (flying.definition_number === null) {
    // A note instead of a Definition: the boat flew something the chart does not name. Its words
    // still travel, because the readout can show them even where no verdict exists.
    return { agreement: 'sail_unnamed', flown: flying.label, recommended: null }
  }

  if (row.twa === null || row.tws === null) {
    return { agreement: 'no_reading', flown: flying.label, recommended: null }
  }

  const suggested = chart.lookup.recommend(row.twa, row.tws)
  if (suggested === null) {
    return { agreement: 'no_chart_cell', flown: flying.label, recommended: null }
  }

  return {
    agreement:
      flying.definition_number === suggested.definition.number ? 'agrees' : 'differs',
    flown: flying.label,
    recommended: suggested.definition.label,
  }
}

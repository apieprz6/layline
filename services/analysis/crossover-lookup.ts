/**
 * Reading a **Crossover Chart** at a point the boat actually sailed.
 *
 * The other half of ADR 0028, and deliberately not the same half. A **Polar** holds boat speed,
 * which is continuous, so it is interpolated; a Crossover Chart holds a **Sail Definition** number,
 * which is categorical, so it is *floored*. There is no such thing as "35% Sail 6, 65% Sail 8", and
 * the chart's columns are crossover thresholds rather than samples: the answer at a point is the
 * largest defined column at or below it, taken as written.
 *
 * Floor and not nearest-neighbour, on both axes. This boat's chart has a 25-knot column sitting
 * between 24 and 30 — genuine, and where the A2 is retired for the A3 at deep angles — so
 * nearest-neighbour would put a boat at 24.6 knots on the 25-knot recommendation, and one at 27.5
 * on 30's, both before the boat is actually there.
 *
 * And no resampling, in either direction. The chart is read on its own thirteen columns and the
 * Polar on its own nine; translating one axis onto the other would either invent chart rows at
 * wind speeds no certificate measures or throw away the thresholds the sailor's own chart records
 * (ADR 0028). Each grid answers at the row's real `(TWA, TWS)` and nothing else.
 *
 * **Below either axis there is no recommendation.** A floor lookup with no floor is missing, the
 * same state as a Target Speed outside the Polar's range — and a real one: four rows of this
 * archive sit at 3.0–3.6 knots, under the chart's own first column, so they have no recommendation
 * to have agreed or disagreed with (ADR 0030).
 *
 * *Above* the top column the floor stands, because a threshold table's last column is a threshold
 * and not a ceiling: this chart's 30-knot entry is "everything has collapsed to Reef + Jib 3", and
 * that is still the answer at 35. It is the Polar whose domain genuinely ends — it is interpolated,
 * and above its last column there is no bracket to interpolate inside. ADR 0028's out-of-range
 * bullet writes "above or below the Crossover Chart's TWS range"; the rule it decided one section
 * earlier, and the one `CONTEXT.md` and this ticket both state, is the floor — so the floor is what
 * this implements.
 */

import type { CrossoverChartPayload, SailRecommendation } from '@/types'

/** One Crossover Chart, with its definitions resolved, ready to be asked about a row. */
export interface CrossoverLookup {
  /**
   * What the chart calls for at this angle and wind speed, or null below either of its axes.
   *
   * `twa` may be signed as the recording wrote it (ADR 0008); the chart's axis is one side of the
   * boat, so the magnitude is what is looked up.
   */
  recommend(twa: number, tws: number): SailRecommendation | null
}

/**
 * The index of the largest axis entry at or below `at`, or -1 when there is none.
 *
 * Ascending and never repeated (`gridPayloadAxis.ts`), so a walk down from the top finds it.
 */
function floorOn(axis: readonly number[], at: number): number {
  for (let index = axis.length - 1; index >= 0; index -= 1) {
    if (axis[index] <= at) return index
  }
  return -1
}

export function crossoverLookup(payload: CrossoverChartPayload): CrossoverLookup {
  const { twa_axis, tws_axis, cells, sail_definitions } = payload

  // Resolved once rather than per row: a race is thousands of rows against one chart. Every cell
  // resolves to a definition or the payload would not have been stored (`crossoverPayload.ts`), so
  // a miss here is a payload that was written before a rule existed — reported as missing rather
  // than as a sail number with no name, because a bare number names nothing.
  const labels = new Map(sail_definitions.map((sail) => [sail.number, sail.label]))

  return {
    recommend(twa, tws) {
      const row = floorOn(twa_axis, Math.abs(twa))
      const column = floorOn(tws_axis, tws)
      if (row === -1 || column === -1) return null

      const sail_number = cells[row]?.[column]
      if (sail_number === undefined) return null

      const label = labels.get(sail_number)
      if (label === undefined) return null

      return { sail_number, label, chart_twa: twa_axis[row], chart_tws: tws_axis[column] }
    },
  }
}

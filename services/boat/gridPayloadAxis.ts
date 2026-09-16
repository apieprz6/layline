/**
 * The axis rule both `TWA/TWS` payloads are held to.
 *
 * A Polar and a Crossover Chart hold different cells but the same two axes: wind angles down the
 * side, wind speeds across the top, each strictly ascending. The rule lives here once so that
 * adding the second file-backed kind reuses the Polar's machinery rather than restating it — and
 * so that a change to what an axis may hold cannot apply to one artifact and not the other.
 */

import { z } from 'zod'

/** Whole degrees of true wind angle, port side, bow to stern. */
export const MIN_TWA = 0
export const MAX_TWA = 180

/**
 * An axis: at least one value, every value a real non-negative number, strictly ascending.
 *
 * Strictly, so a repeated value is refused too. A duplicated axis entry gives two rows the same
 * coordinate, and neither a lookup nor an interpolation over that grid has an answer.
 *
 * Not required to be whole, and not required to step evenly: qtVlm is explicit that *"the steps
 * between TWAs and TWs is free of constraints"*, and the boat's own sail chart has a 25-knot
 * breakpoint sitting between 24 and 30 precisely because the coarser steps could not express it.
 */
export function ascendingAxis(label: string, max?: number): z.ZodType<number[]> {
  const value = max === undefined ? z.number().nonnegative() : z.number().min(MIN_TWA).max(max)

  return z
    .array(value)
    .min(1, `${label} must carry at least one value`)
    .refine(
      (values) => values.every((entry, index) => index === 0 || entry > values[index - 1]),
      `${label} must ascend, with no value repeated`
    )
}

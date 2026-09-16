/**
 * Which Crossover Chart Version a race was sailed under.
 *
 * A Race freezes the Version that was current when it was sailed, and the sails it names are read in
 * that Version's own words for ever after (ADR 0012, ADR 0023). So the answer is needed once — at
 * upload, to fill the wizard's picker in — and never again: nothing dereferences "the current chart"
 * at read, because a chart minted next winter would otherwise silently re-word what last summer's
 * race says was flying.
 *
 * Client-safe on purpose. The sails step needs this the moment the sailor lands on it, and the
 * default it chooses has to be visible and changeable there rather than decided on a server the
 * sailor cannot argue with.
 */

import type { CrossoverChartChoice } from '@/types'

/** A calendar day, optionally with a naive time after it. No offset, ever. */
const NAIVE_DAY = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/

/**
 * The Version in force on a day: the latest that had taken effect by then, or null.
 *
 * Null is a real answer and the reason this returns one. A recording from before the first chart was
 * entered was sailed under no chart Layline knows of, and backdating v1 onto it would assert a
 * vocabulary the boat did not have yet — so the Race records no chart Version, and holds no Sail
 * Configurations. ADR 0012: null means *not recorded*, never a guess.
 *
 * `on` is the recording's own start time, in its own naive frame — a stamp or a bare `YYYY-MM-DD`,
 * since only the day matters here. A stamp carrying an offset is refused rather than resolved: a `Z`
 * means somebody converted it, and the day it lands on may no longer be the day the boat sailed.
 *
 * Ties go to the higher Version number. Two Versions effective on one day is the sailor correcting a
 * chart the same day they entered it, and the correction is the later Version.
 */
export function chartInForceOn(
  charts: readonly CrossoverChartChoice[],
  on: string
): CrossoverChartChoice | null {
  const match = NAIVE_DAY.exec(on)
  if (!match) {
    throw new TypeError(`not a day in the recording's own clock: ${JSON.stringify(on)}`)
  }
  const day = match[1]

  let inForce: CrossoverChartChoice | null = null
  for (const chart of charts) {
    // Both are `YYYY-MM-DD`, so string order is calendar order.
    if (chart.effective_from > day) continue
    if (
      inForce === null ||
      chart.effective_from > inForce.effective_from ||
      (chart.effective_from === inForce.effective_from &&
        chart.version_number > inForce.version_number)
    ) {
      inForce = chart
    }
  }

  return inForce
}

/**
 * Which Crossover Chart Version a race was sailed under.
 *
 * A Race freezes the Version that was current when it was sailed, and the sails it names are read in
 * that Version's own words for ever after (ADR 0012, ADR 0023). So the answer is needed once — at
 * upload, to fill the wizard's picker in — and never again: nothing dereferences "the current chart"
 * at read, because a chart minted next winter would otherwise silently re-word what last summer's
 * race says was flying.
 *
 * The rule itself lives in `versionInForceOn`, because all four Boat Setup pointers default by it
 * (ADR 0012). This name stays because the Sails step reads better for having it, and because a chart
 * choice carries a vocabulary the other three kinds have nothing like.
 *
 * Client-safe on purpose. The sails step needs this the moment the sailor lands on it, and the
 * default it chooses has to be visible and changeable there rather than decided on a server the
 * sailor cannot argue with.
 */

import { versionInForceOn } from '@/services/boat/versionInForce'
import type { CrossoverChartChoice } from '@/types'

/**
 * The Version in force on a day: the latest that had taken effect by then, or null.
 *
 * Null is a real answer. A recording from before the first chart was entered was sailed under no chart
 * Layline knows of, so the Race records no chart Version and holds no Sail Configurations. See
 * `versionInForceOn` for the tie-breaking and for why an offset-bearing stamp is refused.
 */
export function chartInForceOn(
  charts: readonly CrossoverChartChoice[],
  on: string
): CrossoverChartChoice | null {
  return versionInForceOn(charts, on)
}

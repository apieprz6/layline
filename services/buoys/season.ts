/**
 * When the Purdue buoy is in the water.
 *
 * Its own module, away from `ndbc.ts`, because the loading skeletons ask this
 * question and nothing else the buoy service holds. `ndbc.ts` reaches for Next's
 * Data Cache at import time, which drags the server's streaming internals in
 * behind it — more than a component drawing a placeholder should carry, and more
 * than jsdom can load.
 */

/**
 * Whether the Purdue Buoy (45198) is in its operational season, May–October.
 *
 * Local time on purpose: the season is a fact about a buoy in Lake Michigan
 * being lifted out for the winter, not about an instant on a clock.
 */
export function isPurdueSeason(): boolean {
  const now = new Date()
  const month = now.getMonth() // 0-indexed: 0=Jan, 4=May, 9=Oct
  return month >= 4 && month <= 9 // May (4) through October (9)
}

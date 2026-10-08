/**
 * How an efficiency figure is printed, in one place.
 *
 * Two screens show the same number — the Polar performance detail screen and the Overall tab's
 * teaser that links to it — and a sailor comparing them has to be able to see that they agree.
 * Two call sites each rounding their own way is how `94.3%` and `94%` come to describe the same
 * rows.
 *
 * Null is **null**, never `0%` and never `—`: no row could be summed, which is a different fact
 * from a boat that went nowhere, and it is the caller's job to say which in words.
 */

/** A ratio as a percentage to one decimal, or null where there is no ratio. */
export function efficiencyPercent(ratio: number | null): string | null {
  return ratio === null ? null : `${(ratio * 100).toFixed(1)}%`
}

/** A share as a whole percentage, for a caveat rather than for a measurement. */
export function sharePercent(share: number): string {
  return `${Math.round(share * 100)}%`
}

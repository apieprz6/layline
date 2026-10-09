/**
 * How an analysis figure is written down — the one place, for every screen that writes one.
 *
 * Three screens and a teaser print the same quantities, and a sailor comparing two of them has to
 * be able to see that they agree: two call sites each rounding their own way is how `94.3%` and
 * `94%` come to describe the same rows. The **Coverage Ledger**'s own sentences are built on
 * `countOf` from here too, so the ledger's counts and a card's counts cannot drift apart.
 *
 * In `services/analysis/` rather than beside the components, because the ledger's sentence builders
 * need them and a service may not import from `components/`. Isomorphic, like everything else here:
 * ADR 0029 runs it in the browser on every chip tap.
 *
 * Null is **null**, never `0%` and never `—`: no row could be summed, which is a different fact
 * from a boat that went nowhere, and it is the caller's job to say which in words (ADR 0012).
 */

/** A ratio as a percentage to one decimal, or null where there is no ratio. */
export function efficiencyPercent(ratio: number | null): string | null {
  return ratio === null ? null : `${(ratio * 100).toFixed(1)}%`
}

/** A share as a whole percentage, for a caveat rather than for a measurement. */
export function sharePercent(share: number): string {
  return `${Math.round(share * 100)}%`
}

/**
 * A count with thousands separators, which is what makes 3251 read as a number of rows.
 *
 * `en-US` explicitly and never the reader's locale, for the reason `wall-clock.ts` writes its own
 * month names: a figure about this boat's season is read in the language it was logged in, and a
 * separator that moved with the browser would make two screenshots of the same archive disagree.
 */
export function countOf(value: number): string {
  return value.toLocaleString('en-US')
}

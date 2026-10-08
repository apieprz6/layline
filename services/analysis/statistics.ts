/**
 * The two averages the Instrument Tuning checks take, with `NaN` kept off every boundary.
 *
 * pandas, which the prior art used, returns `NaN` from a mean or a standard deviation over nothing,
 * and a naive port gets the same value by accident out of `0 / 0`. `NaN` is a worse null than null:
 * it is `typeof 'number'`, so a field typed `number` holding one is a live lie; it does not equal
 * itself; and `JSON.stringify` turns it into `null` on the way to a browser, so the lie only
 * becomes visible somewhere else. Both functions here return `number | null` off an explicit count
 * check instead, which is AGENTS.md's "a missing value is stored as missing, never as a plausible
 * number" one level up from a channel.
 */

/** The mean, or null over nothing. */
export function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * The mean of a population the caller's own gate has already established is not empty.
 *
 * Throws rather than returning null: a figure that exists by construction is not a missing value,
 * and a `number | null` here would put a dead branch — or worse, a fabricated fallback — in front
 * of every caller that had already checked.
 */
export function meanOfSome(values: readonly number[]): number {
  const mean = meanOf(values)
  if (mean === null) throw new TypeError('asked for the mean of no values')
  return mean
}

/**
 * The sample standard deviation (`n − 1`), or null under two values.
 *
 * `n − 1` because these are samples of an instrument's behaviour and not its whole population, and
 * because it is what pandas' own `.std()` took — the figures the prior art measured and the
 * research reports are this one, so a switch to `n` here would quietly move them.
 */
export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null

  const mean = meanOfSome(values)
  const squares = values.reduce((total, value) => total + (value - mean) ** 2, 0)

  return Math.sqrt(squares / (values.length - 1))
}

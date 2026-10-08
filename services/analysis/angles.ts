/**
 * Angle arithmetic for the Instrument Tuning checks, written out rather than transliterated.
 *
 * Both functions here exist in the prior art's Python, and one of them cannot be ported line for
 * line: Python's `%` is a modulo and JavaScript's is a remainder, so the same source text means two
 * different things in the two languages. The difference is silent — no error, no `NaN`, just a
 * wrong number on a subset of headings — which is why the wrap lives in its own named function with
 * its own test rather than inline in the check that needs it.
 */

/**
 * An angle difference wrapped to [−180, 180).
 *
 * The double mod is the whole point. `(d + 180) % 360 - 180` is the Python, and in JavaScript it is
 * only correct while `d + 180 >= 0`: `%` keeps the sign of its dividend, so a `CTW` of 5° against a
 * `COG` of 355° — a raw difference of −350°, which both channels' 0..360 range makes routine near
 * north — comes out as −350 rather than +10. Adding 360 and taking the remainder again puts the
 * value in 0..360 first, from where the shift down is unconditional.
 */
export function normalizeAngle(angleDeg: number): number {
  const wrapped = (((angleDeg + 180) % 360) + 360) % 360
  return wrapped - 180
}

/**
 * An unsigned 0..360 apparent wind angle as a signed one: positive starboard, negative port.
 *
 * `AWA (calc)` is unsigned and clockwise from the bow, and no negative value appears in the archive
 * — but the qtVlm documentation does not promise that, so the wrap in front is defensive rather
 * than measured. Zero folds to starboard, which is arbitrary only dead ahead and dead astern, where
 * there is no side to get wrong.
 *
 * `services/recordings/chart-series.ts` folds the same column for a chart's *height*, which is a
 * different question — it takes the magnitude afterwards and keeps the sign only as a colour.
 */
export function awaToSigned(awaDeg: number): number {
  const unsigned = ((awaDeg % 360) + 360) % 360
  return unsigned > 180 ? unsigned - 360 : unsigned
}

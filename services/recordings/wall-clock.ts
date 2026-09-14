/**
 * A recording's own clock, as arithmetic.
 *
 * A recording is in the sailor's naive wall clock and is never converted out of it, so every
 * interval here is measured between two stamps in that frame. Shared by the provenance figures
 * and by Row Quality, because a cadence and a Gap Second have to be the same kind of second.
 */

/**
 * `YYYY-MM-DDTHH:MM:SS`, which is what the parser resolves — or the same stamp with a space, which
 * is what a `timestamp` column and a sailor's annotation both look like. Both are the one instant;
 * anything else, including a zone offset, is refused rather than guessed at.
 */
const NAIVE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/

/** How long a month is, which is what tells `2026-02-31` from a date. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * A naive stamp as seconds, for subtracting one from another.
 *
 * `Date.UTC` is the arithmetic and not a timezone claim: it is the one frame in which an hour
 * is always an hour, so an interval measured across a daylight-saving change is the interval
 * the sailor's own clock showed. Reading these stamps as local time would make a 30-second
 * cadence read as 3,630 seconds once a year.
 *
 * A stamp that is not a real date is refused rather than rolled over. `Date.UTC` would take
 * `2026-06-31 19:00:00` for 1 July without complaint, and a Race Window is typed by a sailor: a
 * mistyped start would quietly select a different day's rows, or none, and report neither.
 */
export function wallClockSeconds(row_time: string): number {
  const match = NAIVE_TIMESTAMP.exec(row_time)
  if (!match) {
    throw new TypeError(`not a naive timestamp: ${JSON.stringify(row_time)}`)
  }
  const [, year, month, day, hour, minute, second] = match.map(Number)

  const real =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  if (!real) {
    throw new TypeError(`not a real date and time: ${JSON.stringify(row_time)}`)
  }

  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000
}

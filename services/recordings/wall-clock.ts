/**
 * A recording's own clock, as arithmetic — and as digits on a screen.
 *
 * A recording is in the sailor's naive wall clock and is never converted out of it, so every
 * interval here is measured between two stamps in that frame. Shared by the provenance figures
 * and by Row Quality, because a cadence and a Gap Second have to be the same kind of second.
 *
 * The renderers at the bottom are in this module for the same reason: showing one of these stamps
 * is *slicing* it, never formatting it through a locale. `toLocaleString` would apply the reader's
 * offset to digits that carry none, so a race sailed at 18:05 in Chicago would read 23:05 in
 * London — which is why nothing here constructs a `Date` for display and nothing takes a timezone
 * argument. Chicago-local is what the file already says.
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

/**
 * The inverse: seconds back to the stamp they came from, in the same frame.
 *
 * A scrubber and a nudge both work in seconds and then have to say what time they landed on, and
 * the answer has to be a stamp `wallClockSeconds` reads back to the same number — otherwise a
 * window would drift a second every time it was dragged. `getUTC*` is the exact inverse of the
 * `Date.UTC` above and, like it, is arithmetic rather than a timezone claim: no host offset
 * touches either direction, which is the whole reason a Race Window survives being dragged in
 * Chicago and read in London.
 *
 * A fractional second is refused rather than rounded. Every stamp in the frame is a whole second,
 * so a fraction means the caller did arithmetic Layline has no rule for, and rounding it would
 * pick a row silently.
 */
export function wallClockStamp(seconds: number): string {
  if (!Number.isInteger(seconds)) {
    throw new TypeError(`not a whole second in the recording's clock: ${seconds}`)
  }

  const at = new Date(seconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')

  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`
  )
}

// ---------------------------------------------------------------------------
// The same digits, on a screen
// ---------------------------------------------------------------------------

/**
 * Month names, written out rather than taken from `Intl`.
 *
 * A locale would put the reader between the file and the screen: `Intl` needs a `Date`, a `Date`
 * needs an offset, and the recording has none. English abbreviations are what every other screen
 * in Layline already shows, and a race sailed on Lake Michigan is read in the same language it was
 * logged in.
 */
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * `HH:MM` — the clock the boat's own instruments showed.
 *
 * Seconds are dropped because a sailor states a start to the minute; where the second matters the
 * stamp itself is shown. The stamp is validated first, so a malformed one is a thrown error rather
 * than four sliced characters that happen to look like a time.
 */
export function wallClockTime(stamp: string): string {
  wallClockSeconds(stamp)
  return stamp.slice(11, 16)
}

/** `Sep 4` — the day, in the recording's own frame. */
export function wallClockDay(stamp: string): string {
  wallClockSeconds(stamp)
  const month = Number(stamp.slice(5, 7))
  return `${MONTH_NAMES[month - 1]} ${Number(stamp.slice(8, 10))}`
}

/**
 * A window as one line: `Sep 4 · 11:05 – 13:20`, or both days where it crosses midnight.
 *
 * No same-day assumption. 09-04-2026-chicago-st-joe is a Chicago–St Joseph crossing that runs
 * overnight, and rendering its finish as a bare `01:10` would put the end of the race twenty-two
 * hours before its start.
 */
export function wallClockWindow(start: string, finish: string): string {
  const sameDay = start.slice(0, 10) === finish.slice(0, 10)

  return sameDay
    ? `${wallClockDay(start)} · ${wallClockTime(start)} – ${wallClockTime(finish)}`
    : `${wallClockDay(start)} ${wallClockTime(start)} – ${wallClockDay(finish)} ${wallClockTime(finish)}`
}

/**
 * A stamp as a `datetime-local` value, which is the same stamp to the minute.
 *
 * The widget has no seconds field, so the seconds are dropped here rather than shown and ignored.
 * What comes back is read by `wallClockSecondsFromInput`, which puts `:00` back — meaning a typed
 * time always lands on a whole minute, and the ±1 / ±5 nudges move it in whole minutes from there.
 */
export function wallClockInputValue(stamp: string): string {
  wallClockSeconds(stamp)
  return stamp.slice(0, 16)
}

/**
 * A `datetime-local` value as seconds, or null while it is not yet a time.
 *
 * Null rather than a throw, because this reads a form field mid-keystroke: an empty field and a
 * half-typed year are ordinary states of one, not errors. A value the browser has filled in with
 * seconds is accepted as it stands; anything else is null, and the caller keeps the window it had.
 */
export function wallClockSecondsFromInput(value: string): number | null {
  const stamp = value.length === 16 ? `${value}:00` : value

  try {
    return wallClockSeconds(stamp)
  } catch {
    return null
  }
}

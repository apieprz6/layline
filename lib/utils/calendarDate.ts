/**
 * Rendering for a **calendar date** — a Postgres `date`, arriving as `YYYY-MM-DD`.
 *
 * Separate from `timeFormatting.ts`, which formats moments. A calendar date is not
 * a moment: `effective_from` on a Boat Setup Version is the day a sailor says the
 * Version took effect, with no time in it and no zone it belongs to.
 *
 * That distinction is the whole reason this file exists. `new Date('2026-06-14')`
 * is parsed as UTC midnight, so `toLocaleDateString()` in Chicago renders it as
 * 13 June — the value silently loses the one thing it carries. Nothing here builds
 * a `Date`.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * `'2026-06-14'` → `'14 Jun 2026'`.
 *
 * @param date A calendar date as Postgres gives it: `YYYY-MM-DD`.
 */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * Whether a string is a calendar date that exists — `YYYY-MM-DD`, and a day the month has.
 *
 * The shape alone is not enough for anything that will be sent to a `date` column: `2026-02-30`
 * matches the shape, and Postgres refuses it far later than the sailor can be told about it.
 *
 * Counted rather than round-tripped through a `Date`, for this file's founding reason: a
 * calendar date that becomes a `Date` has acquired a moment and a zone, and `new Date(...)`
 * rolls February 30th forward to March 2nd instead of objecting to it.
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) return false

  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1]

  return day >= 1 && day <= days
}

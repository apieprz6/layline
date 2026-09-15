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

/** Days in each month, February aside. */
const MONTH_LENGTHS = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * Whether a submitted string is a calendar date Postgres would accept as a `date`.
 *
 * Written by hand rather than through `Date`, for the reason this whole file exists:
 * `new Date('2026-02-30')` rolls forward to 2 March instead of reporting a day that
 * does not exist, so round-tripping through a `Date` to validate would accept the
 * value and change it. `<input type="date">` submits this format, but a Server
 * Action is a public endpoint and receives whatever the caller sends.
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12 || day < 1) return false

  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return day <= (leap ? 29 : 28)
  }

  return day <= MONTH_LENGTHS[month - 1]
}

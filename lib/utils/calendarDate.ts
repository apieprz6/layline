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

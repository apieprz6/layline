import { formatCalendarDate } from '../calendarDate'

/**
 * A Boat Setup Version's `effective_from` is a Postgres `date` — a calendar day a
 * sailor named, with no time and no zone. The trap this suite exists for is that
 * `new Date('2026-06-14')` is parsed as UTC midnight, so any local rendering west
 * of Greenwich — which is every Lake Michigan reader — reports the day before.
 */
describe('formatCalendarDate', () => {
  it('renders a calendar date as day, short month and year', () => {
    expect(formatCalendarDate('2026-06-14')).toBe('14 Jun 2026')
  })

  it('drops the leading zero from a single-digit day', () => {
    expect(formatCalendarDate('2026-07-04')).toBe('4 Jul 2026')
  })

  it('keeps the day the sailor named, whatever zone the reader is in', () => {
    // Chicago is UTC-5 in June, so a date read through UTC midnight lands on the
    // 13th. The day is the whole content of the value and must survive.
    const original = process.env.TZ
    process.env.TZ = 'America/Chicago'
    try {
      expect(formatCalendarDate('2026-06-14')).toBe('14 Jun 2026')
    } finally {
      process.env.TZ = original
    }
  })

  it('handles both ends of the year without an off-by-one month', () => {
    expect(formatCalendarDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatCalendarDate('2026-12-31')).toBe('31 Dec 2026')
  })
})

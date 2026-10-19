import { formatTimeHHMM, formatOffset, observationAgeMinutes, formatMoment } from '../timeFormatting'

describe('formatTimeHHMM', () => {
  it('formats afternoon time correctly', () => {
    const date = new Date('2026-05-13T14:30:00')
    expect(formatTimeHHMM(date)).toBe('14:30')
  })

  it('formats midnight correctly', () => {
    const date = new Date('2026-05-13T00:00:00')
    const result = formatTimeHHMM(date)
    // Accept either 00:00 or 24:00 depending on locale
    expect(['00:00', '24:00']).toContain(result)
  })

  it('formats early morning correctly', () => {
    const date = new Date('2026-05-13T09:05:00')
    expect(formatTimeHHMM(date)).toBe('09:05')
  })
})

describe('formatOffset', () => {
  it('formats zero offset as "now"', () => {
    expect(formatOffset(0)).toBe('now')
  })

  it('formats minutes correctly', () => {
    expect(formatOffset(30)).toBe('30m ago')
  })

  it('formats hours correctly with decimal', () => {
    expect(formatOffset(150)).toBe('2.5h ago')
  })

  it('formats whole hours without decimal', () => {
    expect(formatOffset(120)).toBe('2h ago')
  })

  it('formats large offsets as days', () => {
    expect(formatOffset(1440)).toBe('1.0d ago') // 24 hours
  })
})

describe('observationAgeMinutes', () => {
  const NOW = new Date('2026-07-15T23:12:00Z').getTime()

  it('counts whole minutes, floored, as the Station Row does', () => {
    expect(observationAgeMinutes('2026-07-15T23:00:00.000Z', NOW)).toBe(12)
    expect(observationAgeMinutes('2026-07-15T23:11:01.000Z', NOW)).toBe(0)
    expect(observationAgeMinutes('2026-07-15T21:40:00.000Z', NOW)).toBe(92)
  })
})

describe('formatMoment', () => {
  it('states a moment as day, month, year and 24-hour time in the zone it is read in', () => {
    // Chicago is UTC-5 in October: 21:04Z is 16:04 on the lake.
    expect(formatMoment('2026-10-17T21:04:00Z', 'America/Chicago')).toBe('17 Oct 2026, 16:04')
    expect(formatMoment('2026-10-17T21:04:00Z', 'UTC')).toBe('17 Oct 2026, 21:04')
  })

  it('moves to the reader’s day when the zone crosses midnight', () => {
    expect(formatMoment('2026-01-03T02:15:00Z', 'America/Chicago')).toBe('2 Jan 2026, 20:15')
  })

  it('names the month as formatCalendarDate does, Sep and not Sept', () => {
    expect(formatMoment('2026-09-10T12:00:00Z', 'UTC')).toBe('10 Sep 2026, 12:00')
  })
})

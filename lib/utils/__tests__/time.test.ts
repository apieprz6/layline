import { formatTimeOffset, formatDateTimeRange, getMinutesAgo } from '../time'

describe('getMinutesAgo', () => {
  it('calculates correct minutes for timestamp 30 minutes ago', () => {
    const now = new Date('2026-05-19T18:00:00Z')
    const timestamp = '2026-05-19T17:30:00Z'

    expect(getMinutesAgo(timestamp, now)).toBe(30)
  })

  it('calculates correct minutes for timestamp 1 hour ago', () => {
    const now = new Date('2026-05-19T18:00:00Z')
    const timestamp = '2026-05-19T17:00:00Z'

    expect(getMinutesAgo(timestamp, now)).toBe(60)
  })

  it('calculates correct minutes for timestamp 72 hours ago', () => {
    const now = new Date('2026-05-19T18:00:00Z')
    const timestamp = '2026-05-16T18:00:00Z'

    expect(getMinutesAgo(timestamp, now)).toBe(4320)
  })

  it('returns 0 for current time', () => {
    const now = new Date('2026-05-19T18:00:00Z')
    const timestamp = '2026-05-19T18:00:00Z'

    expect(getMinutesAgo(timestamp, now)).toBe(0)
  })

  it('uses current Date when referenceTime is not provided', () => {
    const recentTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const result = getMinutesAgo(recentTimestamp)

    // Should be approximately 5 minutes (allow small tolerance for test execution time)
    expect(result).toBeGreaterThanOrEqual(4.9)
    expect(result).toBeLessThanOrEqual(5.1)
  })

  it('handles fractional minutes correctly', () => {
    const now = new Date('2026-05-19T18:00:00Z')
    const timestamp = '2026-05-19T17:57:30Z' // 2.5 minutes ago

    expect(getMinutesAgo(timestamp, now)).toBeCloseTo(2.5, 1)
  })
})

describe('formatTimeOffset', () => {
  it('formats zero minutes as now', () => {
    expect(formatTimeOffset(0)).toBe('now')
  })

  it('formats minutes with m suffix', () => {
    expect(formatTimeOffset(5)).toContain('5m')
    expect(formatTimeOffset(30)).toContain('30m')
  })

  it('formats exact hours without decimals', () => {
    const result = formatTimeOffset(60)
    expect(result).toContain('1h')
    expect(result).not.toContain('.')
  })

  it('formats fractional hours with decimal', () => {
    expect(formatTimeOffset(90)).toContain('1.5h')
  })

  it('treats near-whole hours as whole hours', () => {
    const result = formatTimeOffset(60.01)
    expect(result).toContain('1h')
    expect(result).not.toContain('.')
  })
})

describe('formatDateTimeRange', () => {
  it('formats date with abbreviated weekday and 24-hour time', () => {
    // Wednesday, May 13, 2026 at 19:30
    const date = new Date('2026-05-13T19:30:00')
    const result = formatDateTimeRange(date)

    expect(result).toContain('Wed')
    expect(result).toContain('19:30')
    expect(result).not.toContain(',') // No comma separator
  })

  it('formats different weekdays correctly', () => {
    const monday = new Date('2026-05-11T14:00:00')
    const sunday = new Date('2026-05-17T08:15:00')

    expect(formatDateTimeRange(monday)).toContain('Mon')
    expect(formatDateTimeRange(sunday)).toContain('Sun')
  })

  it('formats midnight correctly', () => {
    const midnight = new Date('2026-05-13T00:00:00')
    const result = formatDateTimeRange(midnight)

    // Accept both 00:00 and 24:00 (locale-specific midnight representations)
    expect(result).toMatch(/00:00|24:00/)
  })

  it('formats times with leading zeros', () => {
    const early = new Date('2026-05-13T09:05:00')
    const result = formatDateTimeRange(early)

    expect(result).toContain('09:05')
  })
})

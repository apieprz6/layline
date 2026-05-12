import { formatTimeOffset, formatDateTimeRange } from '../time'

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

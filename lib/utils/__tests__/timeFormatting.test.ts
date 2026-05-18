import { formatTimeHHMM, formatFetchAge, formatOffset } from '../timeFormatting'

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

describe('formatFetchAge', () => {
  it('formats "just now" for very recent fetch', () => {
    const now = new Date('2026-05-13T14:30:00')
    const lastFetch = new Date('2026-05-13T14:29:58') // 2 seconds ago
    expect(formatFetchAge(lastFetch, now)).toBe('just now')
  })

  it('formats seconds correctly', () => {
    const now = new Date('2026-05-13T14:30:00')
    const lastFetch = new Date('2026-05-13T14:29:48') // 12 seconds ago
    expect(formatFetchAge(lastFetch, now)).toBe('12 sec ago')
  })

  it('formats minutes correctly', () => {
    const now = new Date('2026-05-13T14:30:00')
    const lastFetch = new Date('2026-05-13T14:25:00') // 5 minutes ago
    expect(formatFetchAge(lastFetch, now)).toBe('5 min ago')
  })

  it('formats hours correctly', () => {
    const now = new Date('2026-05-13T14:30:00')
    const lastFetch = new Date('2026-05-13T12:12:00') // 2.3 hours ago
    expect(formatFetchAge(lastFetch, now)).toBe('2.3 h ago')
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

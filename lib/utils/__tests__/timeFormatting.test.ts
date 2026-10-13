import { formatTimeHHMM, formatOffset } from '../timeFormatting'

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

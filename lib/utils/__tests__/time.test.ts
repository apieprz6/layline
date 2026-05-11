import { formatTimeOffset } from '../time'

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

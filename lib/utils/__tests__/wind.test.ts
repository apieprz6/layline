import { getWindColor, getWindCondition } from '../wind'

describe('getWindColor', () => {
  // The token, never its daylight hex: a literal can't follow `.theme-nightvision`.
  it.each([
    [0, 'var(--wind-light)'],
    [8, 'var(--wind-light)'],
    [9, 'var(--wind-medium)'],
    [15, 'var(--wind-medium)'],
    [16, 'var(--wind-heavy)'],
    [22, 'var(--wind-heavy)'],
    [23, 'var(--wind-storm)'],
    [40, 'var(--wind-storm)'],
  ])('%s kts is %s', (kts, token) => {
    expect(getWindColor(kts)).toBe(token)
  })
})

describe('getWindCondition', () => {
  it('tints the band token for its background and border rather than restating its hex', () => {
    expect(getWindCondition(12)).toEqual({
      color: 'var(--wind-medium)',
      bg: 'color-mix(in srgb, var(--wind-medium) 10%, transparent)',
      border: 'color-mix(in srgb, var(--wind-medium) 40%, transparent)',
      label: 'Medium',
    })
  })
})

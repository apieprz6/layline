/**
 * The recording's own clock, which two projections now share.
 *
 * These are the rules a cadence, a Gap Second and a Race Window bound are all measured under, so
 * they are tested once here rather than through each caller.
 */

import { daysInMonth, wallClockSeconds } from '@/services/recordings/wall-clock'

describe('a naive wall-clock stamp', () => {
  it('subtracts to the interval the sailor’s own clock showed', () => {
    expect(
      wallClockSeconds('2026-06-03T19:00:30') - wallClockSeconds('2026-06-03T19:00:00')
    ).toBe(30)
  })

  it('is an hour an hour across a daylight-saving change, because it is in no timezone', () => {
    // 1 November 2026, 02:00 back to 01:00 in US Central. Read as local time this pair would
    // measure 7,200 seconds and a 30-second cadence would read as 3,630 once a year.
    expect(
      wallClockSeconds('2026-11-01T02:00:00') - wallClockSeconds('2026-11-01T01:00:00')
    ).toBe(3600)
  })

  it('reads the resolved form and the annotated form as the same instant', () => {
    // The parser writes `T`; a `timestamp` column and a sailor's typed Race Window write a space.
    expect(wallClockSeconds('2026-06-03 19:00:00')).toBe(wallClockSeconds('2026-06-03T19:00:00'))
  })

  it('refuses a stamp that is not a real date, rather than rolling it over', () => {
    expect(() => wallClockSeconds('2026-06-31T19:00:00')).toThrow('not a real date and time')
    expect(() => wallClockSeconds('2026-13-01T19:00:00')).toThrow('not a real date and time')
    expect(() => wallClockSeconds('2026-06-03T24:00:00')).toThrow('not a real date and time')
    expect(() => wallClockSeconds('2026-06-03T19:60:00')).toThrow('not a real date and time')
  })

  it('refuses anything that is not a stamp of that shape at all, zone offsets included', () => {
    // A zone offset is not this frame, and guessing at one is how an hour goes missing.
    expect(() => wallClockSeconds('2026-06-03T19:00:00Z')).toThrow('not a naive timestamp')
    expect(() => wallClockSeconds('2026-06-03T19:00:00-05:00')).toThrow('not a naive timestamp')
    expect(() => wallClockSeconds('06/03/2026 19:00:00')).toThrow('not a naive timestamp')
  })

  it('knows February in a leap year from February in an ordinary one', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(wallClockSeconds('2028-02-29T19:00:00')).toBeGreaterThan(0)
    expect(() => wallClockSeconds('2026-02-29T19:00:00')).toThrow('not a real date and time')
  })
})

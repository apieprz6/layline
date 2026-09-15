/**
 * The recording's own clock, which two projections now share.
 *
 * These are the rules a cadence, a Gap Second and a Race Window bound are all measured under, so
 * they are tested once here rather than through each caller.
 */

import {
  daysInMonth,
  wallClockDay,
  wallClockInputValue,
  wallClockSeconds,
  wallClockSecondsFromInput,
  wallClockStamp,
  wallClockTime,
  wallClockWindow,
} from '@/services/recordings/wall-clock'

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

describe('seconds back to a stamp', () => {
  it('round-trips every stamp the parser can resolve', () => {
    for (const stamp of [
      '2026-06-03T19:00:00',
      '2026-06-26T22:16:37',
      '2026-09-05T08:30:30',
      '2026-01-01T00:00:00',
      '2028-02-29T23:59:59',
    ]) {
      expect(wallClockStamp(wallClockSeconds(stamp))).toBe(stamp)
    }
  })

  it('writes `T` and no zone, so its output is a stamp of the same frame', () => {
    // Not a formatting preference: `wallClockSeconds` refuses a zone offset, so a scrubber whose
    // output carried one would produce a window nothing downstream could read.
    const stamp = wallClockStamp(wallClockSeconds('2026-08-22T11:05:00') + 90)
    expect(stamp).toBe('2026-08-22T11:06:30')
    expect(() => wallClockSeconds(stamp)).not.toThrow()
  })

  it('crosses midnight rather than wrapping inside the day', () => {
    // 09-04-2026-chicago-st-joe's window does exactly this, so a same-day assumption here would
    // put a distance race's finish before its start.
    expect(wallClockStamp(wallClockSeconds('2026-09-04T23:59:30') + 60)).toBe('2026-09-05T00:00:30')
  })

  it('refuses a fraction of a second rather than picking a row by rounding', () => {
    expect(() => wallClockStamp(wallClockSeconds('2026-06-03T19:00:00') + 0.5)).toThrow(
      'not a whole second'
    )
  })
})

describe('the same digits, on a screen', () => {
  it('shows the clock the boat’s own instruments showed, to the minute', () => {
    expect(wallClockTime('2026-08-22T11:05:37')).toBe('11:05')
    expect(wallClockDay('2026-08-22T11:05:37')).toBe('Aug 22')
    // Not `Sep 04`: a leading zero on a day is a filename, not how anyone says a date.
    expect(wallClockDay('2026-09-04T18:00:00')).toBe('Sep 4')
  })

  it('names both days when a window crosses midnight', () => {
    // 09-04-2026-chicago-st-joe is an overnight crossing. Rendered same-day, its finish would read
    // as twenty-two hours before its start.
    expect(wallClockWindow('2026-09-04T23:50:00', '2026-09-05T01:10:00')).toBe(
      'Sep 4 23:50 – Sep 5 01:10'
    )
    expect(wallClockWindow('2026-08-22T11:05:00', '2026-08-22T13:20:00')).toBe(
      'Aug 22 · 11:05 – 13:20'
    )
  })

  it('refuses to slice a stamp that is not one', () => {
    // A slice of a malformed stamp is four characters that look like a time, which is the failure
    // that would reach a sailor as a plausible wrong answer.
    expect(() => wallClockTime('22/08/2026 11:05:37')).toThrow('not a naive timestamp')
    expect(() => wallClockDay('2026-02-30T11:05:37')).toThrow('not a real date and time')
  })

  it('round-trips through a datetime-local field on a whole minute', () => {
    const value = wallClockInputValue('2026-08-22T11:05:37')
    expect(value).toBe('2026-08-22T11:05')
    // The widget has no seconds field, so a typed time lands on the minute — and the ±1 and ±5
    // nudges move it in whole minutes from there.
    expect(wallClockSecondsFromInput(value)).toBe(wallClockSeconds('2026-08-22T11:05:00'))
  })

  it('reads a half-typed field as no time rather than as an error', () => {
    // These are ordinary states of a field being filled in, not failures.
    expect(wallClockSecondsFromInput('')).toBeNull()
    expect(wallClockSecondsFromInput('2026-08-2')).toBeNull()
    expect(wallClockSecondsFromInput('2026-02-30T11:05')).toBeNull()
    // A browser that fills in seconds is taken at its word rather than truncated.
    expect(wallClockSecondsFromInput('2026-08-22T11:05:37')).toBe(
      wallClockSeconds('2026-08-22T11:05:37')
    )
  })
})

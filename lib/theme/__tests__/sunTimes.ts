import * as suncalc from 'suncalc'

const mockedSuncalc = suncalc as jest.Mocked<typeof suncalc>

/**
 * Freezes the clock either side of civil twilight at Navy Pier, with `suncalc`
 * answering the same two times whatever date it is asked about.
 *
 * Shared by the store's suite and the hook's rather than written twice: both turn
 * on `auto` resolving one way or the other, and a helper that drifted between them
 * would make one of the two suites quietly meaningless.
 *
 * Requires `jest.mock('suncalc')` in the importing suite.
 */
export function mockSunTimes({ isNight }: { isNight: boolean }): void {
  const now = new Date('2026-07-15T12:00:00')
  jest.useFakeTimers({ now })

  const civilTwilightEnd = new Date('2026-07-15T21:00:00')
  const civilTwilightStart = new Date('2026-07-15T05:30:00')

  if (isNight) {
    jest.setSystemTime(new Date('2026-07-15T22:00:00'))
  }

  mockedSuncalc.getTimes.mockReturnValue({
    dawn: civilTwilightStart,
    dusk: civilTwilightEnd,
  } as ReturnType<typeof suncalc.getTimes>)
}

/** Midnight, well past dusk on the frozen day. */
export const AFTER_DUSK = new Date('2026-07-15T22:00:00')

/** Mid-morning, well after dawn on the frozen day. */
export const AFTER_DAWN = new Date('2026-07-15T09:00:00')

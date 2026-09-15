/**
 * What a Race Window is allowed to be.
 *
 * These are the only two conditions that stop an upload (ADR 0009), and they are tested here
 * because three layers ask the same question: the wizard, which will not let Next through; the
 * Server Action, which will not write; and the database, whose CHECK and deferred trigger refuse
 * regardless. Only one of the three can be a test in this runner, so the rules live in one module
 * and this suite is the record of what all three mean.
 *
 * Everything else about a window — including a finish past the last row, which is legal and
 * ordinary for a distance race whose logger was stopped on the dock — is a note and appears in
 * `coverage.test.ts` instead.
 */

import {
  RACE_WINDOW_NUDGE_MINUTES,
  nearestRowIndex,
  raceWindowSeconds,
  raceWindowStamps,
  refuseRaceWindow,
  rowsInWindow,
  snapToRow,
} from '@/services/recordings/race-window'
import { wallClockSeconds } from '@/services/recordings/wall-clock'

/** 19:00:00 to 19:04:00 at a minute's cadence. */
const ROWS = [0, 1, 2, 3, 4].map((minute) => wallClockSeconds('2026-06-03T19:00:00') + minute * 60)

const at = (stamp: string): number => wallClockSeconds(stamp)

describe('the first refusal: a finish at or before the start', () => {
  it('refuses a finish before the start', () => {
    const refusal = refuseRaceWindow(
      { start: at('2026-06-03T19:03:00'), finish: at('2026-06-03T19:01:00') },
      ROWS
    )

    expect(refusal?.reason).toBe('finish-not-after-start')
    expect(refusal?.message).toContain('finish')
  })

  it('refuses a finish equal to the start, because a race is not an instant', () => {
    // The database says `window_finish > window_start`, strictly. A zero-length window would pass
    // a `>=` here and then fail at insert, after the bytes had already moved.
    const stamp = at('2026-06-03T19:02:00')

    expect(refuseRaceWindow({ start: stamp, finish: stamp }, ROWS)?.reason).toBe(
      'finish-not-after-start'
    )
  })

  it('reports the ordering before the emptiness, which is the reason worth fixing', () => {
    // A backwards window also contains no rows. Saying so would send the sailor looking for rows.
    const refusal = refuseRaceWindow(
      { start: at('2026-06-03T19:04:00'), finish: at('2026-06-03T19:00:00') },
      ROWS
    )

    expect(refusal?.reason).toBe('finish-not-after-start')
  })
})

describe('the second refusal: no rows inside', () => {
  it('refuses a window that falls between two recordings’ worth of nothing', () => {
    const refusal = refuseRaceWindow(
      { start: at('2026-06-03T21:00:00'), finish: at('2026-06-03T22:00:00') },
      ROWS
    )

    expect(refusal?.reason).toBe('no-rows-inside')
    expect(refusal?.message).toContain('no')
  })

  it('refuses a window that sits in the gap between two rows', () => {
    // Ordered, non-empty in time, and still nothing to draw: a 20-second window inside a
    // 30-second cadence. This is the case the row count catches and the ordering check cannot.
    expect(
      refuseRaceWindow(
        { start: at('2026-06-03T19:00:10'), finish: at('2026-06-03T19:00:50') },
        ROWS
      )?.reason
    ).toBe('no-rows-inside')
  })

  it('accepts a window holding a single row', () => {
    // One row is not much of a race, but it is not a refusal either — that judgement is the
    // sailor's, and the coverage figures are what tell them (ADR 0009).
    expect(
      refuseRaceWindow({ start: at('2026-06-03T19:01:30'), finish: at('2026-06-03T19:02:30') }, ROWS)
    ).toBeNull()
  })

  it('counts a row exactly on a bound as inside, at either end', () => {
    // Inclusive both ends, matching `withinRaceWindow`: a row at the gun is in the race.
    expect(
      refuseRaceWindow({ start: ROWS[0], finish: ROWS[0] + 1 }, ROWS)
    ).toBeNull()
    expect(refuseRaceWindow({ start: ROWS[4] - 1, finish: ROWS[4] }, ROWS)).toBeNull()
  })
})

describe('a window that outlives the recording', () => {
  it('is accepted, because the logger stopping is not the race ending', () => {
    // 08-22-26-glr's window finishes 1,155 seconds after its last row. Refusing that would refuse
    // a real race in the archive.
    expect(
      refuseRaceWindow({ start: ROWS[0], finish: ROWS[4] + 1155 }, ROWS)
    ).toBeNull()
  })

  it('is accepted where the recording starts late as well', () => {
    expect(refuseRaceWindow({ start: ROWS[0] - 600, finish: ROWS[4] + 600 }, ROWS)).toBeNull()
  })
})

describe('rows inside a window', () => {
  it('reports the first and last of them, and how many', () => {
    const inside = rowsInWindow(ROWS, { start: ROWS[1], finish: ROWS[3] })

    expect(inside).toEqual({ first: 1, last: 3, count: 3 })
  })

  it('says nothing is inside rather than pointing at row zero', () => {
    expect(rowsInWindow(ROWS, { start: ROWS[4] + 60, finish: ROWS[4] + 120 })).toEqual({
      first: -1,
      last: -1,
      count: 0,
    })
  })

  it('finds the earliest and latest by time, not by file position', () => {
    // A fall-back hour repeats, so the last row in the file is not the last in the window.
    const wrapped = [3000, 3600, 3000, 3600]
    expect(rowsInWindow(wrapped, { start: 2900, finish: 3700 })).toEqual({
      first: 0,
      last: 1,
      count: 4,
    })
  })
})

describe('seconds and stamps, both ways', () => {
  it('reads a stored window into the axis the charts share', () => {
    expect(
      raceWindowSeconds({
        window_start: '2026-06-03 19:00:00',
        window_finish: '2026-06-03 19:04:00',
      })
    ).toEqual({ start: ROWS[0], finish: ROWS[4] })
  })

  it('writes a dragged window back as naive stamps, with no zone and no conversion', () => {
    expect(raceWindowStamps({ start: ROWS[0], finish: ROWS[4] })).toEqual({
      window_start: '2026-06-03T19:00:00',
      window_finish: '2026-06-03T19:04:00',
    })
  })

  it('round-trips, so dragging a window and saving it does not move it a second', () => {
    const window = { window_start: '2026-09-04T18:50:00', window_finish: '2026-09-05T08:30:30' }

    expect(raceWindowStamps(raceWindowSeconds(window))).toEqual(window)
  })
})

describe('snapping a bound to the recording', () => {
  it('lands on a time the file actually has', () => {
    expect(snapToRow(ROWS, ROWS[2] + 8)).toBe(ROWS[2])
  })

  it('leaves the time alone where there are no rows to snap to', () => {
    // Nothing to snap to is not a reason to move a bound to zero, which is 1970.
    expect(snapToRow([], ROWS[2])).toBe(ROWS[2])
  })

  it('finds the row a tap is nearest, and clamps to the ends rather than reporting nothing', () => {
    const seconds = [0, 30, 60, 90, 120]

    expect(nearestRowIndex(seconds, 62)).toBe(2)
    expect(nearestRowIndex(seconds, 88)).toBe(3)
    expect(nearestRowIndex(seconds, -9999)).toBe(0)
    expect(nearestRowIndex(seconds, 9999)).toBe(4)
  })

  it('breaks a tie towards the earlier row, so a thumb on a pixel is stable', () => {
    expect(nearestRowIndex([0, 30, 60, 90, 120], 45)).toBe(1)
  })

  it('searches a clock that stepped backwards without bisecting it', () => {
    // A fall-back hour repeats: file order is no longer chronological, and a bisection would
    // return a row that is merely nearby while claiming to be the nearest.
    const wrapped = [3000, 3600, 3000, 3600]

    expect(nearestRowIndex(wrapped, 3599)).toBe(1)
    expect(nearestRowIndex(wrapped, 3001)).toBe(0)
  })

  it('says so when there is nothing to snap to at all', () => {
    expect(nearestRowIndex([], 60)).toBe(-1)
  })

  it('offers the nudges that reach between rows', () => {
    // A 30-second cadence leaves gaps a tap cannot reach, and a dropout leaves gaps of hours.
    expect(RACE_WINDOW_NUDGE_MINUTES).toEqual([-5, -1, 1, 5])
  })
})

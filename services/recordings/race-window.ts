/**
 * What a Race Window is allowed to be, in one place, because three layers ask.
 *
 * The wizard will not let Next through, the Server Action will not write, and the database refuses
 * regardless — `races.race_window_ordered` for the first rule and the deferred
 * `races_window_intersects_rows` trigger for the second. Three enforcements of two rules, and the
 * rules are written once here so the message the sailor reads and the constraint that would fire
 * cannot drift apart.
 *
 * These two are the *only* things that stop an upload (ADR 0009). Notably absent: a window
 * reaching past the last row, which is legal and ordinary — a distance race's logger is stopped
 * on the dock, and 08-22-26-glr's window finishes 1,155 seconds after its last row. That gap is
 * stated as a note, in `coverage.ts`.
 *
 * Everything here works in absolute seconds of the recording's own naive frame, because that is
 * the axis the map's rail and the chart's handles both drag along (ADR 0014).
 */

import type { RaceWindow } from '@/services/recordings/row-quality'
import { wallClockSeconds, wallClockStamp } from '@/services/recordings/wall-clock'

/** A window as the charts hold it while it is being dragged. */
export interface RaceWindowSeconds {
  start: number
  finish: number
}

/**
 * The nudges either side of a tap, in minutes.
 *
 * A tap snaps to a recorded row, which leaves every instant between two rows unreachable — half a
 * minute at the archive's cadence, and hours across a dropout. These reach them. One minute is the
 * fine adjustment and five is the coarse one; the datetime field covers anything further.
 */
export const RACE_WINDOW_NUDGE_MINUTES: readonly number[] = [-5, -1, 1, 5]

/**
 * The least a rail drag may leave between the two bounds, in seconds.
 *
 * An ergonomic and emphatically not a gate: it stops one thumb dragging the start past the finish
 * and inverting the window mid-gesture. The gate is `finish > start`, below, and it is what a typed
 * time is judged against.
 */
export const RACE_WINDOW_DRAG_MINIMUM_SECONDS = 60

export type RaceWindowRefusalReason =
  /** `window_finish > window_start`, which the database also states as a CHECK. */
  | 'finish-not-after-start'
  /** No Recording Row inside it, which the database also states as a deferred trigger. */
  | 'no-rows-inside'

export interface RaceWindowRefusal {
  reason: RaceWindowRefusalReason
  /** Addressed to the sailor: what is wrong, in the terms they set it in. */
  message: string
}

/** A stored window read onto the shared axis. */
export function raceWindowSeconds(window: RaceWindow): RaceWindowSeconds {
  return {
    start: wallClockSeconds(window.window_start),
    finish: wallClockSeconds(window.window_finish),
  }
}

/**
 * A dragged window back as the stamps that get stored.
 *
 * No conversion in either direction: these are the digits the recording's own clock showed, and
 * they are compared to the recording's rows in that same frame. Chicago-local is a label the UI
 * puts beside them.
 */
export function raceWindowStamps(seconds: RaceWindowSeconds): RaceWindow {
  return {
    window_start: wallClockStamp(seconds.start),
    window_finish: wallClockStamp(seconds.finish),
  }
}

/**
 * Whether a recorded time is inside a window.
 *
 * Both bounds inclusive — a row at the gun is in the race — and written once because four callers
 * ask: the coverage split, the map's ghosting, the chart's shading and the wizard's notes. Four
 * copies of `>=` and `<=` is four chances for one of them to disagree about the row on the boundary,
 * and the one that disagreed would be drawing a different race from the one being saved.
 */
export function insideRaceWindow(seconds: number, window: RaceWindowSeconds): boolean {
  return seconds >= window.start && seconds <= window.finish
}

/**
 * One bound of a window moved by a drag, with the other left alone.
 *
 * The minimum separation is applied here rather than in each chart, because both the map's rail and
 * the channel chart's handles drag the same window and a thumb that inverted it in one of them would
 * be a rule that existed in the other. Deliberately **not** snapped to a row: a finish past the last
 * row is legal (ADR 0009), and snapping the drag would put it out of reach.
 */
export function dragWindowBound(
  window: RaceWindowSeconds,
  which: 'start' | 'finish',
  seconds: number
): RaceWindowSeconds {
  return which === 'start'
    ? {
        start: Math.min(seconds, window.finish - RACE_WINDOW_DRAG_MINIMUM_SECONDS),
        finish: window.finish,
      }
    : {
        start: window.start,
        finish: Math.max(seconds, window.start + RACE_WINDOW_DRAG_MINIMUM_SECONDS),
      }
}

/**
 * Which rows a window holds: the earliest, the latest, and how many.
 *
 * Both bounds inclusive, matching `withinRaceWindow` — a row at the gun is in the race. Earliest
 * and latest are by *time* and not by file position, because a recording whose naive clock steps
 * back an hour has the two disagree, and every duration measured from these would then be
 * negative. A full scan for the same reason: file order is only chronological while the clock went
 * forwards.
 *
 * `first` and `last` are -1 where the window holds nothing.
 */
export function rowsInWindow(
  rowSeconds: readonly number[],
  window: RaceWindowSeconds
): { first: number; last: number; count: number } {
  let first = -1
  let last = -1
  let count = 0

  rowSeconds.forEach((seconds, index) => {
    if (!insideRaceWindow(seconds, window)) return

    count += 1
    if (first === -1 || seconds < rowSeconds[first]) first = index
    if (last === -1 || seconds > rowSeconds[last]) last = index
  })

  return { first, last, count }
}

/**
 * Why this window cannot be a race, or null.
 *
 * Ordering is checked first because a backwards window also holds no rows, and "no rows" would
 * send the sailor hunting for a recording problem they do not have.
 */
export function refuseRaceWindow(
  window: RaceWindowSeconds,
  rowSeconds: readonly number[]
): RaceWindowRefusal | null {
  if (!(window.finish > window.start)) {
    return {
      reason: 'finish-not-after-start',
      message:
        'The finish has to come after the start. Drag the right-hand handle later, or type a ' +
        'finish time further on.',
    }
  }

  if (rowsInWindow(rowSeconds, window).count === 0) {
    return {
      reason: 'no-rows-inside',
      message:
        'There are no recorded rows between those two times, so there is no race in there to ' +
        'save. Widen the window until the track lights up.',
    }
  }

  return null
}

/**
 * The row nearest a time, so a tap lands on a time the file actually has (ADR 0014).
 *
 * A linear scan, and deliberately not a bisection: `row_seconds` is in file order, and file order
 * is chronological only while the clock went forwards. A recording whose naive clock steps back an
 * hour would have a bisection return a row that is merely nearby, and "the nearest recorded row"
 * would be a claim rather than a fact. Thirteen recordings of a few thousand rows do not need the
 * log, and the charts hold the answer in state rather than recomputing it per frame.
 *
 * Ties go to the earlier row, so a thumb on the pixel between two samples is stable rather than
 * flickering with the sub-pixel. Returns -1 where there is nothing to snap to.
 */
export function nearestRowIndex(rowSeconds: readonly number[], seconds: number): number {
  let best = -1
  for (let at = 0; at < rowSeconds.length; at += 1) {
    if (best === -1 || Math.abs(rowSeconds[at] - seconds) < Math.abs(rowSeconds[best] - seconds)) {
      best = at
    }
  }
  return best
}

/**
 * A time moved onto the nearest row the recording actually has.
 *
 * A tap on the rail lands on a pixel and a pixel is a range of seconds; snapping means the window
 * a sailor sees selected is the window that gets stored. Where the recording has no rows at all
 * the time is returned untouched, because moving it to a default would put it in 1970.
 */
export function snapToRow(rowSeconds: readonly number[], seconds: number): number {
  const nearest = nearestRowIndex(rowSeconds, seconds)
  return nearest === -1 ? seconds : rowSeconds[nearest]
}

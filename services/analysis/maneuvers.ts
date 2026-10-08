/**
 * Maneuvers: what the boat was doing across a `TWA` sign flip, computed over a Transcription.
 *
 * A separate axis from Row Quality, and kept that way. The prior art wrote both into one `STATUS`
 * column and only overwrote a row still marked `valid`, so a Low-Speed row inside a tack kept its
 * speed label and silently lost the maneuver — 34 rows across 5 recordings, precisely the ones a
 * comparison of tack cost would want (ADR 0009). Here a row gets both facts, side by side.
 *
 * Nothing here is stored. The span and the boundary below come from measuring the archive
 * (`docs/research/lay-140-maneuver-detection.md`); moving either is a redeploy.
 */

import type {
  Maneuver,
  ManeuverFlip,
  RowManeuverWindow,
  TranscriptionManeuvers,
  TranscriptionQuality,
} from '@/types'

/**
 * Rows a Maneuver Window reaches before the flip.
 *
 * The turn itself is brief: one row out, the median boat is still at 94% of its earlier speed.
 * Nothing measured asks for more.
 */
export const MANEUVER_WINDOW_BEFORE = 1

/**
 * Rows a Maneuver Window reaches after the flip.
 *
 * Recovery is the slow half. Three rows after the flip, 94% of tacks and 92% of gybes are back to
 * 90% of their pre-maneuver `SOG`; one row after, only 78% and 77% are, which is the prior art's
 * span leaving a quarter of them mid-recovery. A fourth row buys four more points for 17% more
 * excluded rows.
 *
 * Measured in `__tests__/archive-maneuvers.test.ts`, which is where these figures are pinned.
 * LAY-140 reports 88%/73% for gybes, counting one event of 26 as recovering a row later than this
 * does; its tack figures match to the row, and the knee in the curve is in the same place either
 * way.
 */
export const MANEUVER_WINDOW_AFTER = 3

/**
 * `|TWA|` above this is downwind, at or below it upwind.
 *
 * Not a new number: it is the line the prior art already drew between a tack and a gybe, moved
 * from the average of the two sides of a flip onto each side on its own.
 */
export const ZONE_BOUNDARY_DEG = 90

/** Bump this whenever a constant above or a rule below changes. */
export const MANEUVER_DETECTOR_VERSION = 'maneuvers/1'

/** The fields maneuver detection reads. `TranscriptionRow` satisfies it. */
export interface ManeuverAssessableRow {
  row_index: number
  row_time: string
  /** Signed, −180..180, positive = starboard (ADR 0008). Text, exactly as the file wrote it. */
  twa: string | null
}

type Zone = 'upwind' | 'downwind'

function zone(twa: number): Zone {
  return Math.abs(twa) > ZONE_BOUNDARY_DEG ? 'downwind' : 'upwind'
}

/**
 * What a flip from `before` to `after` was, read on each side rather than averaged.
 *
 * Averaging is what broke the prior art: a beat-to-run rounding puts one side near 0° and the
 * other near 180°, and which side of 90° their mean lands on is arbitrary. A rounding is exactly
 * the case where the two sides disagree, so asking each side separately cannot mislabel one.
 */
export function classifyFlip(before: number, after: number): Maneuver {
  const from = zone(before)
  if (from !== zone(after)) return 'rounding'
  return from === 'upwind' ? 'tack' : 'gybe'
}

/** A `TWA` with a side to it: a number, and not dead ahead. */
function sided(twa: string): number | null {
  const value = Number(twa)
  return Number.isFinite(value) && value !== 0 ? value : null
}

/**
 * Whether two row lists are the same rows in the same order.
 *
 * Both of this module's entry points are handed two views of one recording and would hand a row's
 * figures to its neighbour if the views disagreed, so both ask this rather than trusting the
 * caller. Written once because a second copy of the comparison is a second chance to get the
 * off-by-one wrong in only one of them.
 */
export function sameRowOrder(
  left: readonly { row_index: number }[],
  right: readonly { row_index: number }[]
): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => row.row_index === right[index].row_index)
  )
}

/**
 * Every Maneuver in the rows given, and the Maneuver Window each row sits in.
 *
 * `quality` must be Row Quality over these same rows, because a **Frozen** row is the one Row
 * Quality state that gates this: its `TWA` is a repeated copy, not a heading, so no flip is read
 * across one and no window claims one. Low-Speed and Not Water-Referenced gate nothing here.
 *
 * Like Row Quality, hand this the whole Transcription and filter to the Race Window afterwards,
 * so a tack just before the gun still marks the rows it recovers into.
 */
export function detectManeuvers(
  rows: readonly ManeuverAssessableRow[],
  quality: TranscriptionQuality
): TranscriptionManeuvers {
  if (!sameRowOrder(quality.rows, rows)) {
    throw new Error('Row Quality was computed over different rows from the ones given')
  }

  const frozen = quality.rows.map((row) => row.frozen)
  const flips: ManeuverFlip[] = []
  const labels: (Maneuver | null)[] = rows.map(() => null)

  for (let index = 1; index < rows.length; index += 1) {
    if (frozen[index - 1] || frozen[index]) continue

    // Kept as the text the file wrote, so the flip can state what it read (ADR 0008).
    const twaBefore = rows[index - 1].twa
    const twaAfter = rows[index].twa
    if (twaBefore === null || twaAfter === null) continue

    const before = sided(twaBefore)
    const after = sided(twaAfter)
    if (before === null || after === null || before > 0 === after > 0) continue

    const maneuver = classifyFlip(before, after)
    flips.push({
      row_index: rows[index].row_index,
      row_time: rows[index].row_time,
      maneuver,
      twa_before: twaBefore,
      twa_after: twaAfter,
    })

    // Where two windows overlap the later flip claims the rows: they are recovering from it.
    const last = Math.min(rows.length - 1, index + MANEUVER_WINDOW_AFTER)
    for (let at = Math.max(0, index - MANEUVER_WINDOW_BEFORE); at <= last; at += 1) {
      if (!frozen[at]) labels[at] = maneuver
    }
  }

  return {
    detector_version: MANEUVER_DETECTOR_VERSION,
    window_before: MANEUVER_WINDOW_BEFORE,
    window_after: MANEUVER_WINDOW_AFTER,
    zone_boundary_deg: ZONE_BOUNDARY_DEG,
    flips,
    rows: rows.map(
      (row, index): RowManeuverWindow => ({
        row_index: row.row_index,
        row_time: row.row_time,
        maneuver_window: labels[index],
      })
    ),
  }
}

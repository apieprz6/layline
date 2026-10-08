/**
 * Reading a **Polar** at a point the boat actually sailed: **Target Speed** and **Target VMG**.
 *
 * The Polar is a continuous reference with a bounded domain, so it is *interpolated* — bilinearly,
 * across both axes, between the two bracketing rows and the two bracketing columns (ADR 0028).
 * Snapping to the nearest column would make a step function of a smooth curve, and this boat's
 * nine wind-speed columns are 2 to 4 knots apart: at 11 knots the nearest-column answer is a
 * tenth of a knot of target away from the interpolated one on a reach and four tenths at 135°.
 *
 * Two rules do all the work here, and they pull in opposite directions on purpose.
 *
 * **Outside the axes there is no answer.** Past the highest tabulated angle or wind speed, or below
 * the lowest, there is nothing to interpolate between — so the answer is missing, never clamped to
 * the last column and never projected past it. An ORC certificate structurally stops at 24 knots
 * (Rule 402.2); the boat does not, and a race in 27 knots has no Target Speed rather than a
 * flattering guess at one.
 *
 * **Inside the axes there is always an answer, and sometimes a flag on it.** A certificate
 * tabulates angles no boat sails and fills them by ramping up from zero, so some cells inside the
 * grid are the file's own manufacture rather than a measurement. A bracket touching one of those
 * yields a **Filler-Anchored** Target Speed — computed, shown, flagged (ADR 0036). Withholding it
 * would overwrite something the boat really did with silence because the yardstick was weak, which
 * is the opposite of the rule everything else here follows.
 *
 * The grid is classified once, on construction, because a race is thousands of rows against one
 * Polar and `classifyPolarCells` walks the whole grid.
 *
 * `services/boat/` describes the Polar artifact alone; composing it with a point the boat sailed is
 * a different concern and lives here (ADR 0036).
 */

import { zone } from '@/services/analysis/maneuvers'
import { classifyPolarCells, isAnchorable } from '@/services/boat/polarSyntheticRows'
import type { PolarCellOrigin, PolarPayload, TargetSpeed, TargetVmg, VmgLeg } from '@/types'

/**
 * The standing caveat every **VMG Efficiency** figure carries, on every row (ADR 0036).
 *
 * Not conditional on the search running out of real cells. A rectangular grid cannot hold an
 * optimum that moves with wind speed, and on this boat's own certificate six of nine wind speeds
 * have a downwind VMG curve flat enough near its peak that the published figures, rounded to two
 * decimals, differ from a neighbouring angle by under a hundredth of a knot — so a search over any
 * grid, however well built, can land on the neighbour instead.
 */
export const TARGET_VMG_CAVEAT =
  "Target VMG is estimated from the Polar's grid, not the certificate's own published optimum."

/**
 * Which half of the Polar a `TWA`'s VMG target is searched over.
 *
 * The same line a tack is told from a gybe by, and read from the same place, so the two cannot
 * disagree about a boat on the beam.
 */
export function vmgLegOf(twa: number): VmgLeg {
  return zone(twa)
}

/**
 * One Polar, classified and ready to be asked about a row.
 *
 * An object rather than two free functions taking a payload, so the grid is walked once per Polar
 * instead of once per row.
 */
export interface PolarTargets {
  /**
   * **Target Speed** at this angle and wind speed, or null outside the Polar's axes.
   *
   * `twa` may be signed as the recording wrote it (ADR 0008); the Polar's axis is one side of the
   * boat, so the magnitude is what is looked up.
   */
  targetSpeed(twa: number, tws: number): TargetSpeed | null
  /**
   * **Target VMG** on this leg at this wind speed, or null outside the Polar's TWS axis.
   *
   * An estimate — see `TARGET_VMG_CAVEAT`, which belongs beside every figure built on this. The
   * angle the search landed on is deliberately not returned: Layline states no point beat or gybe
   * angle, from any Polar, under any construction (ADR 0036).
   */
  targetVmg(leg: VmgLeg, tws: number): TargetVmg | null
}

/** Where a query sits on an axis: the two entries bracketing it, and how far between them. */
interface Bracket {
  low: number
  high: number
  /** 0 at `low`, 1 at `high`. */
  fraction: number
}

/**
 * The two axis entries a query sits between, or null when it sits outside them.
 *
 * Null is the whole of the out-of-range rule, and it is the same answer above the axis as below
 * it: with nothing on one side there is no bracket, and a bracket is what interpolation needs.
 * An exact hit on an axis value returns a degenerate bracket — the same index twice — so the
 * caller reads one cell rather than two and nothing it never looked at can flag the result.
 */
function bracketOn(axis: readonly number[], at: number): Bracket | null {
  if (axis.length === 0 || at < axis[0] || at > axis[axis.length - 1]) return null

  // Ascending and never repeated (`gridPayloadAxis.ts`), so the first entry at or above the query
  // is its upper bound and the one before it the lower.
  const high = axis.findIndex((entry) => entry >= at)
  if (axis[high] === at) return { low: high, high, fraction: 0 }

  const low = high - 1
  return { low, high, fraction: (at - axis[low]) / (axis[high] - axis[low]) }
}

/** Every distinct cell a bracket pair reads: four, or two on an axis hit, or one on both. */
function corners(twa: Bracket, tws: Bracket): [number, number][] {
  const rows = twa.low === twa.high ? [twa.low] : [twa.low, twa.high]
  const columns = tws.low === tws.high ? [tws.low] : [tws.low, tws.high]

  return rows.flatMap((row) => columns.map((column): [number, number] => [row, column]))
}

/** Linear between two values. */
function between(low: number, high: number, fraction: number): number {
  return low + (high - low) * fraction
}

export function polarTargets(payload: PolarPayload): PolarTargets {
  const { twa_axis, tws_axis, boat_speed } = payload
  const origins: PolarCellOrigin[][] = classifyPolarCells(payload)

  /** The boat speed one TWA row reads at a wind speed between two of its columns. */
  const speedAcross = (row: number, tws: Bracket): number =>
    between(boat_speed[row][tws.low], boat_speed[row][tws.high], tws.fraction)

  const anchoredOnFiller = (twa: Bracket, tws: Bracket): boolean =>
    corners(twa, tws).some(([row, column]) => !isAnchorable(origins[row][column]))

  /**
   * The best `boatspeed × |cos(TWA)|` over one leg's tabulated angles at one wind speed.
   *
   * `realOnly` is the difference between ADR 0036's restricted search and its fallback. Each
   * candidate is one TWA row read across the wind-speed bracket, so "real" means both cells the
   * row's own interpolation touches are measured or interpolated — a row real at 10 knots and
   * ramped at 8 cannot be trusted to answer at 9.
   */
  const bestOn = (leg: VmgLeg, tws: Bracket, realOnly: boolean): TargetVmg | null => {
    let best: TargetVmg | null = null

    for (const [row, twa] of twa_axis.entries()) {
      if (vmgLegOf(twa) !== leg) continue

      const filler_anchored = anchoredOnFiller({ low: row, high: row, fraction: 0 }, tws)
      if (realOnly && filler_anchored) continue

      // `|cos|`, because downwind VMG is progress to leeward and the sign would only say which
      // way the boat is pointing — which the leg already said.
      const knots = speedAcross(row, tws) * Math.abs(Math.cos((twa * Math.PI) / 180))
      if (best === null || knots > best.knots) best = { knots, filler_anchored }
    }

    return best
  }

  return {
    targetSpeed(twa, tws) {
      const twaBracket = bracketOn(twa_axis, Math.abs(twa))
      const twsBracket = bracketOn(tws_axis, tws)
      if (twaBracket === null || twsBracket === null) return null

      return {
        knots: between(
          speedAcross(twaBracket.low, twsBracket),
          speedAcross(twaBracket.high, twsBracket),
          twaBracket.fraction
        ),
        filler_anchored: anchoredOnFiller(twaBracket, twsBracket),
      }
    },

    targetVmg(leg, tws) {
      const twsBracket = bracketOn(tws_axis, tws)
      if (twsBracket === null) return null

      // The search is restricted away from filler (ADR 0036) — but it must also never suppress a
      // figure for want of a trustworthy comparison point, which is the same ADR's other rule. So
      // two passes over the leg: the real cells first, and the whole leg only if the real cells
      // had nothing to say at this wind speed. On this boat the first pass always answers, because
      // every row from TWA 52 up is measured in every column; a library polar ramping from TWA 0
      // is what the second pass is for, and what it returns is flagged.
      const real = bestOn(leg, twsBracket, true)

      return real ?? bestOn(leg, twsBracket, false)
    },
  }
}

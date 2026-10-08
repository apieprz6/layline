import { TARGET_VMG_CAVEAT, polarTargets } from '@/services/analysis/polar-targets'
import { zone } from '@/services/analysis/maneuvers'
import type { PolarPayload } from '@/types'

/**
 * Reading a Polar at a point the boat sailed.
 *
 * Two rules are being pinned, and they pull in opposite directions. Outside the axes the answer is
 * missing — never clamped, never projected (ADR 0028). Inside them the answer is always computed,
 * and flagged where the grid cells it leant on are the file's own filler (ADR 0036).
 *
 * The grid below is a cut-down stand-in built so every arithmetic claim is checkable by hand: a
 * ramp floor at TWA 30-35, a real region above it, and round numbers. The real certificate is
 * exercised in `polar-targets.archive.test.ts`.
 */

/**
 * TWA 30 is the ramp's seed and 35 is exactly twice it, so both rows are filler in every column.
 * TWA 40 is three times the seed in the lightest column alone — 3 x 1 = 3 — and real in the other
 * two, which is the per-cell boundary this whole module turns on. Every row above it is real in
 * every column, which is also true of the boat's own certificate from TWA 52 up.
 */
const GRID: PolarPayload = {
  twa_axis: [30, 35, 40, 45, 90, 150],
  tws_axis: [4, 8, 12],
  boat_speed: [
    [1, 2, 3],
    [2, 4, 6],
    [3, 5, 7],
    [4.4, 5.6, 7.2],
    [4.6, 6, 8],
    [2, 5, 6],
  ],
  source: { format: 'orc-pol', header_token: 'twa/tws' },
}

const targets = polarTargets(GRID)

describe('the zone a Target VMG search is confined to', () => {
  // The same `zone` a tack is told from a gybe by, deliberately not a second copy of the 90° line:
  // the best VMG upwind is a different search from the best VMG downwind, and the two must not
  // disagree about a boat on the beam.
  it('reads the beam as upwind and anything past it as downwind', () => {
    expect(zone(40)).toBe('upwind')
    expect(zone(90)).toBe('upwind')
    expect(zone(91)).toBe('downwind')
  })

  it('ignores which tack the boat is on, since the Polar is one side of the boat', () => {
    expect(zone(-150)).toBe('downwind')
    expect(zone(-40)).toBe('upwind')
  })
})

describe('targetSpeed', () => {
  it('reads a cell straight off the grid where the query lands on both axes', () => {
    expect(targets.targetSpeed(90, 8)).toEqual({ knots: 6, filler_anchored: false })
  })

  it('reads the boat as the Polar wrote it whichever tack it is on', () => {
    // A recording's TWA is signed, positive to starboard (ADR 0008); a Polar's axis is not.
    expect(targets.targetSpeed(-90, 8)).toEqual(targets.targetSpeed(90, 8))
  })

  it('interpolates across the wind-speed axis rather than snapping to a column', () => {
    // Halfway from 4 to 8 knots on the TWA 90 row: halfway from 4.6 to 6 knots of target. The
    // nearest column would have answered 4.6, which is where a step function reads a smooth curve.
    expect(targets.targetSpeed(90, 6)?.knots).toBeCloseTo(5.3)
  })

  it('interpolates across the angle axis too', () => {
    // Halfway from TWA 90 to 150 at 12 knots: halfway from 8 to 6.
    expect(targets.targetSpeed(120, 12)?.knots).toBeCloseTo(7)
  })

  it('interpolates both axes at once, which is what bilinear means', () => {
    // The four corners (90,8)=6, (90,12)=8, (150,8)=5, (150,12)=6, queried dead centre.
    expect(targets.targetSpeed(120, 10)?.knots).toBeCloseTo((6 + 8 + 5 + 6) / 4)
  })

  describe('outside the Polar, where there is no answer at all', () => {
    it('reports missing above the highest tabulated wind speed', () => {
      // An ORC certificate stops at 24 knots by rule; the boat does not. A race in 27 knots has no
      // Target Speed rather than the 24-knot column flat-lined out to meet it.
      expect(targets.targetSpeed(90, 12.1)).toBeNull()
    })

    it('reports missing below the lowest, which is the same answer for the same reason', () => {
      expect(targets.targetSpeed(90, 3.9)).toBeNull()
    })

    it('reports missing outside the angle axis in both directions', () => {
      expect(targets.targetSpeed(29, 8)).toBeNull()
      expect(targets.targetSpeed(151, 8)).toBeNull()
    })

    it('answers exactly on the axis bounds, which are inside the grid', () => {
      expect(targets.targetSpeed(150, 12)?.knots).toBe(6)
      expect(targets.targetSpeed(30, 4)?.knots).toBe(1)
    })
  })

  describe('Filler-Anchored: computed and flagged, never withheld', () => {
    it('flags a figure every one of whose corners is filler', () => {
      // TWA 32 in 6 knots brackets rows 30 and 35 and columns 4 and 8 — four ramp cells. Row 30
      // reads 1.5 across the columns and row 35 reads 3; two fifths of the way up is 2.1.
      expect(targets.targetSpeed(32, 6)).toEqual({ knots: 2.1, filler_anchored: true })
    })

    it('still computes it, because the row the boat sailed is real either way', () => {
      // The point of ADR 0036. Withholding this would overwrite something that happened with
      // silence on the grounds that the yardstick was weak.
      expect(targets.targetSpeed(32, 6)?.knots).toBeGreaterThan(0)
    })

    it('flags a bracket with one filler corner exactly as it flags four', () => {
      // TWA 38 in 10 knots brackets (35,8) and (35,12) — both filler — with (40,8) and (40,12),
      // both real. A mostly-real bracket is not a safer unflagged one.
      expect(targets.targetSpeed(38, 10)?.filler_anchored).toBe(true)
    })

    it('flags a bracket whose only filler corner is a single cell', () => {
      // TWA 42 in 6 knots brackets (40,4) — the one ramp cell left in row 40 — with three real
      // ones. This is the cell-grain case a row-level floor cannot express at all.
      expect(targets.targetSpeed(42, 6)?.filler_anchored).toBe(true)
    })

    it('leaves a bracket of real cells unflagged', () => {
      expect(targets.targetSpeed(42, 10)?.filler_anchored).toBe(false)
    })

    describe('a cell the file left empty, which is not filler but the absence of it', () => {
      /**
       * A qtVlm library polar's unfilled columns: the file tabulates TWS 4 and says nothing at 8.
       * A line through a zero is not a weak yardstick — it is a target of 2 knots where the boat
       * was measured at 4, which reads as 200% of polar.
       */
      const gappy = polarTargets({
        twa_axis: [52, 90],
        tws_axis: [4, 8],
        boat_speed: [
          [4, 0],
          [5, 0],
        ],
        source: { format: 'qtvlm-pol', header_token: 'twa\\tws' },
      })

      it('reports missing rather than a figure flagged Filler-Anchored', () => {
        expect(gappy.targetSpeed(52, 6)).toBeNull()
        expect(gappy.targetSpeed(52, 8)).toBeNull()
      })

      it('still answers where the bracket reads cells that say something', () => {
        expect(gappy.targetSpeed(52, 4)).toEqual({ knots: 4, filler_anchored: false })
        expect(gappy.targetSpeed(70, 4)?.knots).toBeCloseTo(4 + (5 - 4) * (18 / 38))
      })

      it('keeps an empty cell out of the Target VMG search, which it would otherwise win', () => {
        // A candidate whose bracket averages a real 4 knots with a nothing offers nearly no
        // target, and the search maximises — so it would never win. But the row it sits in would
        // be the only candidate at TWS 8, where it would answer 0.
        expect(gappy.targetVmg('upwind', 8)).toBeNull()
        expect(gappy.targetVmg('upwind', 4)).not.toBeNull()
      })
    })

    it('does not flag a figure for a filler cell it never read', () => {
      // An exact hit on both axes reads one cell. (40,12) is real, and the ramp cell at (40,4) in
      // the same row has nothing to do with it.
      expect(targets.targetSpeed(40, 12)).toEqual({ knots: 7, filler_anchored: false })
    })

    it('does not flag a row-exact query for the filler row below it', () => {
      // TWA 40 at 8 knots brackets columns only. Row 35, all filler, is not read.
      expect(targets.targetSpeed(40, 8)?.filler_anchored).toBe(false)
    })
  })
})

describe('targetVmg', () => {
  it('is an estimate, and says so in words a screen can print', () => {
    expect(TARGET_VMG_CAVEAT).toMatch(/estimate/i)
    expect(TARGET_VMG_CAVEAT).toMatch(/certificate/i)
  })

  it('never returns the angle it searched to, on any leg or any grid', () => {
    // The hard rule of ADR 0036: Layline states no point beat or gybe angle, from any Polar, under
    // any construction — proven to fail even on a grid built from a certificate's own optimum. The
    // shape is the enforcement, so a consumer cannot print one by accident.
    expect(Object.keys(targets.targetVmg('upwind', 8) ?? {}).sort()).toEqual([
      'estimated_knots',
      'filler_anchored',
    ])
    expect(Object.keys(targets.targetVmg('downwind', 8) ?? {}).sort()).toEqual([
      'estimated_knots',
      'filler_anchored',
    ])
  })

  it('maximises boat speed times the cosine of the angle, over the upwind rows', () => {
    // Real upwind rows at 12 knots: TWA 40 at 7 (7 x cos40 = 5.36) and TWA 90 at 8 (8 x cos90 = 0).
    expect(targets.targetVmg('upwind', 12)?.estimated_knots).toBeCloseTo(
      7 * Math.cos((40 * Math.PI) / 180)
    )
  })

  it('reads downwind VMG as a magnitude, not a negative number', () => {
    // Only TWA 150 is downwind here: 6 x |cos150| = 5.196. A sign would restate the leg and
    // nothing else, and a negative Target VMG would invert every efficiency built on it.
    expect(targets.targetVmg('downwind', 12)?.estimated_knots).toBeCloseTo(
      6 * Math.abs(Math.cos((150 * Math.PI) / 180))
    )
  })

  it('searches away from the filler rows, so a ramp cell cannot win the search', () => {
    /**
     * A ramp overstates badly at the narrow angles a certificate fills in, which is exactly where
     * `boatspeed x cos(TWA)` is largest. Here the seed is 2 knots at TWA 30 and the ramp's own TWA
     * 35 row reads 4, which would win the search outright at 3.28 knots of VMG — against the real
     * TWA 52 row's 1.85. ADR 0036 restricts the search to real cells, so the real row wins.
     */
    const ramped = polarTargets({
      twa_axis: [30, 35, 52],
      tws_axis: [4],
      boat_speed: [[2], [4], [3]],
      source: { format: 'orc-pol', header_token: 'twa/tws' },
    })

    expect(ramped.targetVmg('upwind', 4)).toEqual({
      estimated_knots: 3 * Math.cos((52 * Math.PI) / 180),
      filler_anchored: false,
    })
  })

  it('interpolates across the wind-speed axis like Target Speed does', () => {
    // TWA 40 at 10 knots is halfway from 5 to 7 = 6, and 6 x cos40 = 4.60 is the best the real
    // upwind rows can do there — TWA 45 reads 6.4 x cos45 = 4.53 and TWA 90 reads nothing.
    expect(targets.targetVmg('upwind', 10)?.estimated_knots).toBeCloseTo(
      6 * Math.cos((40 * Math.PI) / 180)
    )
  })

  it('reports missing outside the wind-speed axis, never extrapolated', () => {
    expect(targets.targetVmg('upwind', 12.1)).toBeNull()
    expect(targets.targetVmg('downwind', 3.9)).toBeNull()
  })

  describe('a Polar whose every row on a leg is filler', () => {
    /** A library polar ramping from TWA 0: there is no real upwind cell to search. */
    const allRamp = polarTargets({
      twa_axis: [30, 35, 150],
      tws_axis: [4, 8],
      boat_speed: [
        [1, 2],
        [2, 4],
        [3, 5],
      ],
      source: { format: 'qtvlm-pol', header_token: 'twa\\tws' },
    })

    it('computes a figure anyway and flags it, rather than withholding one', () => {
      // The restricted search and "compute, never suppress" are both ADR 0036's; where they
      // collide, the flag is what gives way, not the number.
      const upwind = allRamp.targetVmg('upwind', 8)

      expect(upwind?.estimated_knots).toBeCloseTo(4 * Math.cos((35 * Math.PI) / 180))
      expect(upwind?.filler_anchored).toBe(true)
    })

    it('leaves the leg that does have real cells unflagged', () => {
      expect(allRamp.targetVmg('downwind', 8)?.filler_anchored).toBe(false)
    })
  })

  it('reports missing on a leg the Polar tabulates no angle for', () => {
    // An ORC certificate export that stops at TWA 150 still has downwind rows; one that tabulated
    // nothing past the beam would have no downwind answer, and that is missing rather than zero.
    const upwindOnly = polarTargets({
      twa_axis: [52, 60],
      tws_axis: [4, 8],
      boat_speed: [
        [3, 6],
        [4, 7],
      ],
      source: { format: 'orc-pol', header_token: 'twa/tws' },
    })

    expect(upwindOnly.targetVmg('downwind', 8)).toBeNull()
    expect(upwindOnly.targetVmg('upwind', 8)).not.toBeNull()
  })
})

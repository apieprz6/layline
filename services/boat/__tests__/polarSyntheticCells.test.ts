import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePolarFile } from '@/services/boat/polarFile'
import {
  classifyPolarCells,
  classifyPolarRows,
  isAnchorable,
  polarSuppression,
} from '@/services/boat/polarSyntheticRows'
import type { PolarPayload } from '@/types'

/**
 * Which *cells* of a Polar are the file's own filler.
 *
 * The same signatures `polarSyntheticRows.test.ts` pins per row, asked per cell, because that is
 * the grain a sailed row has to be scored at (ADR 0036). The row-level answer is still correct for
 * the table it serves and is untouched here — the two are asserted side by side below precisely so
 * a change that collapses them back into one is visible.
 */

const FIXTURES = join(process.cwd(), 'docs/research/fixtures')

function payloadOf(name: string): PolarPayload {
  const result = parsePolarFile(readFileSync(join(FIXTURES, name), 'utf8'))
  if (!result.ok) throw new Error(`fixture no longer parses: ${result.message}`)
  return result.payload
}

const CLASS40 = payloadOf('qtvlm-library-class40.pol')
const ORC_10R = payloadOf('orc-first-10r.pol')

/** `ramp` / `real` / `0`, which is how ADR 0036 writes its measured table. */
function table(payload: PolarPayload): string[] {
  const cells = classifyPolarCells(payload)

  return payload.twa_axis.map((twa, row) => {
    const kinds = cells[row].map((origin) => {
      if (origin === 'no-data') return '0'
      return isAnchorable(origin) ? 'real' : 'ramp'
    })
    return `${twa} ${kinds.join(' ')}`
  })
}

describe('classifyPolarCells', () => {
  describe("Handsome Pete's own certificate, which is the table ADR 0036 measured", () => {
    /**
     * The first three rows are quoted verbatim from `docs/research/orc-polar-file-formats.md`,
     * which records rows 30, 35 and 40 of the boat's own certificate; row 45 and the one below it
     * are quoted from ADR 0036's own worked table. The rows above are the real `orc-first-10r.pol`
     * grid — the same boat model's 2026 certificate — standing in for what neither document quotes.
     *
     * Written out rather than read from the owner's file, for the reason `archive.ts` gives: the
     * boat's own `.pol` is not vendored into this repo, and a claim this specific has to be
     * checkable in CI. `polar-targets.archive.test.ts` runs the same assertions against the real
     * file wherever it is to hand.
     */
    const composite: PolarPayload = {
      tws_axis: [4, 6, 8, 10, 12, 14, 16, 20, 24],
      twa_axis: [30, 35, 40, 45, ...ORC_10R.twa_axis],
      boat_speed: [
        [0.88, 1.36, 1.79, 2.21, 2.46, 2.52, 2.54, 2.49, 2.25],
        [1.75, 2.73, 3.59, 4.43, 4.91, 5.03, 5.08, 4.97, 4.5],
        [2.63, 4.09, 5.38, 6.21, 6.44, 6.55, 6.61, 6.65, 6.59],
        [3.5, 4.99, 5.93, 6.46, 6.68, 6.78, 6.84, 6.89, 6.84],
        ...ORC_10R.boat_speed,
      ],
      source: { format: 'orc-pol', header_token: 'twa/tws' },
    }

    it("reproduces ADR 0036's measured table, cell for cell", () => {
      // The ramp clears at a different angle in every column: from TWA 40 above 10 knots, from 45
      // in 6-8, and only from 52 in 4. That is the finding the whole per-cell rule rests on.
      expect(table(composite).slice(0, 5)).toEqual([
        '30 ramp ramp ramp ramp ramp ramp ramp ramp ramp',
        '35 ramp ramp ramp ramp ramp ramp ramp ramp ramp',
        '40 ramp ramp ramp real real real real real real',
        '45 ramp real real real real real real real real',
        '52 real real real real real real real real real',
      ])
    })

    it('recovers the cells the row-level floor discards, which is why it exists', () => {
      // The row-level answer is 52°, so rows 30, 35, 40 and 45 are all below it. Per cell, two of
      // those four rows are mostly the boat's own measured speed.
      expect(polarSuppression(composite).firstTrustworthyTwa).toBe(52)

      const cells = classifyPolarCells(composite)
      const realAt = (twa: number): number =>
        cells[composite.twa_axis.indexOf(twa)].filter((origin) => isAnchorable(origin)).length

      // ADR 0036's prose says "six real cells at TWA 40 and seven at TWA 45". Six at 40 is right;
      // at 45 it is eight, which is what the ADR's own table in the same section shows — one ramp
      // cell in the lightest column and the remaining eight real. The table is the measurement and
      // the sentence undercounts it by one.
      expect(realAt(40)).toBe(6)
      expect(realAt(45)).toBe(8)
    })

    it("does not suppress the boat's best upwind angle in any condition it sails in", () => {
      // The second finding behind ADR 0036: beat angle runs 47° to 40° across this axis, every one
      // of those at or below the row-level floor of 52°. Per cell they are scoreable.
      const cells = classifyPolarCells(composite)
      const at = (twa: number, tws: number) =>
        cells[composite.twa_axis.indexOf(twa)][composite.tws_axis.indexOf(tws)]

      expect(isAnchorable(at(40, 12))).toBe(true)
      expect(isAnchorable(at(45, 8))).toBe(true)
    })

    it('still reads the lightest column of row 40 as the ramp it is on', () => {
      // Per-cell is not "everything is real now". Three of row 40's nine cells are 3x row 30 to
      // within a hundredth of a knot, and they stay filler.
      const cells = classifyPolarCells(composite)

      expect(cells[2].slice(0, 3)).toEqual(['ramp-filler', 'ramp-filler', 'ramp-filler'])
    })
  })

  describe('a qtVlm library polar, whose ramp runs from TWA 0 to TWA 40', () => {
    it("agrees with the row-level walk wherever that walk's answer is a whole row", () => {
      const rows = classifyPolarRows(CLASS40)
      const cells = classifyPolarCells(CLASS40)

      CLASS40.twa_axis.forEach((_, row) => {
        // A fully-ramped row has no real cell in it; a measured row above the floor has no filler.
        if (rows[row] === 'ramp-filler') {
          expect(cells[row].every((origin) => !isAnchorable(origin))).toBe(true)
        }
      })
    })

    it('reads a row of zeroes as nothing said, cell by cell', () => {
      // The file's TWA 0 row. `no-data` is per cell here rather than only a verdict on a whole row
      // of them, because interpolating through a zero invents a target below anything measured.
      const zeroRow = classifyPolarCells(CLASS40)[CLASS40.twa_axis.indexOf(0)]

      expect(zeroRow.every((origin) => origin === 'no-data')).toBe(true)
      expect(zeroRow.every((origin) => !isAnchorable(origin))).toBe(true)
    })

    it("leaves row 50's lightest cell real, which a scatter search would condemn", () => {
      // This is why the walk is still contiguous up from the base row, one column at a time. Row
      // 50 at TWS 5 is 5.30 knots and ten times the base row's 0.53 to the hundredth — a perfect
      // ramp cell by the signature alone — and it is real data. The walk stops in that column at
      // row 45, which is 0.19 off its own multiple, and never reaches 50.
      const cells = classifyPolarCells(CLASS40)
      const lightest = CLASS40.tws_axis.indexOf(5)

      expect(CLASS40.boat_speed[CLASS40.twa_axis.indexOf(50)][lightest]).toBe(5.3)
      expect(cells[CLASS40.twa_axis.indexOf(45)][lightest]).toBe('measured')
      expect(cells[CLASS40.twa_axis.indexOf(50)][lightest]).toBe('measured')
    })

    it('reads the partial rows per column instead of calling the whole row partial', () => {
      // Rows 35 and 40 are `partial-ramp-filler` at row grain: on the ramp in light air and off it
      // where real speed binds. Per cell that becomes some ramp cells and some real ones, and
      // `partial-ramp-filler` has no per-cell spelling at all.
      const row = CLASS40.twa_axis.indexOf(40)
      const kinds = classifyPolarCells(CLASS40)[row]

      expect(classifyPolarRows(CLASS40)[row]).toBe('partial-ramp-filler')
      expect(kinds).toContain('ramp-filler')
      expect(kinds.some((origin) => isAnchorable(origin))).toBe(true)
      expect(kinds).not.toContain('partial-ramp-filler')
    })
  })

  describe('an ORC certificate export, which tabulates nothing below its beat angle', () => {
    it('finds no filler anywhere in it', () => {
      expect(
        classifyPolarCells(ORC_10R).every((row) => row.every((origin) => isAnchorable(origin)))
      ).toBe(true)
    })

    it("does not read its close-hauled row as a ramp seed in any one column", () => {
      // A ramp needs two cells to be a ramp, for the same reason the row walk needs two rows: a
      // real 3.96 knots at TWA 52 must not seed a line through a column just because it is lowest.
      expect(classifyPolarCells(ORC_10R)[0].every((origin) => origin === 'measured')).toBe(true)
    })
  })

  describe('an interpolated row, which is real enough to anchor a target', () => {
    /** The exact arithmetic mean of the rows either side, in every column. */
    const withMeanRow: PolarPayload = {
      tws_axis: ORC_10R.tws_axis,
      twa_axis: [90, 100, 110],
      boat_speed: [
        ORC_10R.boat_speed[3],
        ORC_10R.boat_speed[3].map(
          (low, index) => Math.round(((low + ORC_10R.boat_speed[4][index]) / 2) * 100) / 100
        ),
        ORC_10R.boat_speed[4],
      ],
      source: ORC_10R.source,
    }

    it('is labelled interpolated per cell, from its row-level verdict', () => {
      // The signature is only evidence of a generator when it holds in every column at once, so it
      // stays a row-level question; the label is carried down to the cells unchanged.
      expect(classifyPolarCells(withMeanRow)[1].every((origin) => origin === 'interpolated')).toBe(
        true
      )
    })

    it('may still anchor a Target Speed, exactly as a measured cell may', () => {
      expect(classifyPolarCells(withMeanRow)[1].every((origin) => isAnchorable(origin))).toBe(true)
    })
  })

  describe('grids the detector cannot say much about', () => {
    it('finds no ramp in a single-row grid, since a ramp needs two cells', () => {
      const single: PolarPayload = {
        twa_axis: [90],
        tws_axis: [4, 6],
        boat_speed: [[4.43, 5.95]],
        source: { format: 'orc-pol', header_token: 'twa/tws' },
      }

      expect(classifyPolarCells(single)).toEqual([['measured', 'measured']])
    })

    it('calls every cell of an all-filler grid filler, rather than showing it anyway', () => {
      // Where `polarSuppression` has a safety valve — a grid read as filler all the way up is
      // displayed whole, because an empty grid explains nothing — this has none and needs none.
      // Nothing is withheld on the scoring path: the figures are computed and flagged (ADR 0036).
      const allRamp: PolarPayload = {
        twa_axis: [30, 35, 40],
        tws_axis: [4, 6],
        boat_speed: [
          [1, 2],
          [2, 4],
          [3, 6],
        ],
        source: { format: 'orc-pol', header_token: 'twa/tws' },
      }

      expect(polarSuppression(allRamp).suppressedTwa).toEqual([])
      expect(
        classifyPolarCells(allRamp).every((row) => row.every((origin) => origin === 'ramp-filler'))
      ).toBe(true)
    })

    it('generates no ramp out of a column the base row left empty', () => {
      // Every multiple of zero is zero, so a column of zeroes would otherwise read as a perfect
      // ramp all the way up — and a zero is the file saying nothing, not a line to extend.
      const emptyColumn: PolarPayload = {
        twa_axis: [30, 35, 40],
        tws_axis: [4, 6],
        boat_speed: [
          [0, 2],
          [0, 4],
          [0, 6],
        ],
        source: { format: 'orc-pol', header_token: 'twa/tws' },
      }

      expect(classifyPolarCells(emptyColumn).map((row) => row[0])).toEqual([
        'no-data',
        'no-data',
        'no-data',
      ])
      expect(classifyPolarCells(emptyColumn).map((row) => row[1])).toEqual([
        'ramp-filler',
        'ramp-filler',
        'ramp-filler',
      ])
    })
  })
})

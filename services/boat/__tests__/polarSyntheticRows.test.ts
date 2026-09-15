import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePolarFile } from '@/services/boat/polarFile'
import { classifyPolarRows, polarSuppression } from '@/services/boat/polarSyntheticRows'
import type { PolarPayload } from '@/types'

/**
 * Which rows of a Polar are the file's own filler.
 *
 * A certificate polar tabulates angles a boat cannot sail. Those rows are generated, not
 * measured: `docs/research/orc-polar-file-formats.md` shows Handsome Pete's row 35 is exactly
 * twice its row 30, and its row 40 exactly three times, so the three of them lie on one
 * straight line ramping up from zero. Displaying them would tell a sailor pinching at 28° that
 * they are making 480% of polar.
 *
 * So the rows are stored exactly as the file gave them and suppressed on display — and the
 * suppression is *detected* from the grid rather than hardcoded at an angle, because which rows
 * are filler is a property of the file. The two real fixtures disagree about where the ramp
 * ends by twenty degrees of tabulated rows and agree that it ends at 45.
 */

const FIXTURES = join(process.cwd(), 'docs/research/fixtures')

function payloadOf(name: string): PolarPayload {
  const result = parsePolarFile(readFileSync(join(FIXTURES, name), 'utf8'))
  if (!result.ok) throw new Error(`fixture no longer parses: ${result.message}`)
  return result.payload
}

const CLASS40 = payloadOf('qtvlm-library-class40.pol')
const ORC_10R = payloadOf('orc-first-10r.pol')

describe('polarSuppression', () => {
  describe('a qtVlm library polar, whose ramp runs from TWA 0 to TWA 40', () => {
    it('finds the first trustworthy angle at 45, which is where its real data begins', () => {
      // Measured, not assumed: every row from 5 to 30 is n × row 5 to within 0.05 kt, rows 35
      // and 40 still are in light air, and row 45 is off the ramp by 0.19 kt even in its
      // lightest column — which is the column the walk gives a row its last chance in.
      expect(polarSuppression(CLASS40).firstTrustworthyTwa).toBe(45)
    })

    it('suppresses every angle below it, and names them', () => {
      expect(polarSuppression(CLASS40).suppressedTwa).toEqual([
        0, 5, 10, 15, 20, 25, 30, 35, 40,
      ])
    })

    it('stops at the first measured row rather than hunting for filler further up', () => {
      // Row 50's light-air cell happens to sit on the ramp too. It is real data all the same,
      // which is why the walk is contiguous from the bottom and not a sweep of the grid.
      const { suppressedTwa } = polarSuppression(CLASS40)

      expect(suppressedTwa).not.toContain(50)
    })

    it('classifies the rows it suppresses, rather than lumping them together', () => {
      const kinds = classifyPolarRows(CLASS40)
      const byAngle = new Map(CLASS40.twa_axis.map((twa, index) => [twa, kinds[index]]))

      // A row of zeros: the file's own statement that it has nothing here.
      expect(byAngle.get(0)).toBe('no-data')
      // Multiples of row 5 in every column, within the exporter's own two-decimal rounding.
      expect(byAngle.get(10)).toBe('ramp-filler')
      expect(byAngle.get(30)).toBe('ramp-filler')
      // Still on the ramp in light air, off it by half a knot upwind of it.
      expect(byAngle.get(35)).toBe('partial-ramp-filler')
      expect(byAngle.get(40)).toBe('partial-ramp-filler')
      expect(byAngle.get(45)).toBe('measured')
    })

    it('states the reason, so the gap in the grid is explained and not just left', () => {
      const { reason } = polarSuppression(CLASS40)

      expect(reason).not.toBeNull()
      expect(reason).toMatch(/45/)
      // The claim is about where the numbers came from, not about the boat.
      expect(reason?.toLowerCase()).toMatch(/ramp|filler|generated/)
    })

    it('names every kind of row it is hiding, since this file has three of them', () => {
      // Row 0 is zeros, rows 5–30 are the full ramp, rows 35 and 40 what is left of it. All
      // three are being hidden, so all three are accounted for.
      const reason = polarSuppression(CLASS40).reason?.toLowerCase() ?? ''

      expect(reason).toContain('records nothing')
      expect(reason).toContain('ramps up')
      expect(reason).toContain('lightest')
    })
  })

  describe('an ORC certificate export, which tabulates nothing below its beat angle', () => {
    it('suppresses nothing, because none of its rows are filler', () => {
      const { firstTrustworthyTwa, suppressedTwa, reason } = polarSuppression(ORC_10R)

      expect(firstTrustworthyTwa).toBe(52)
      expect(suppressedTwa).toEqual([])
      expect(reason).toBeNull()
    })

    it('does not read its lowest row as a ramp seed on its own', () => {
      // A ramp needs a second row to corroborate it. Row 60 is not twice row 52, so row 52 is
      // the boat's real close-hauled speed and stays.
      expect(classifyPolarRows(ORC_10R)[0]).toBe('measured')
    })
  })

  describe("Handsome Pete's own documented ramp", () => {
    /**
     * A composite, and labelled as one: the first three rows are quoted verbatim from
     * `docs/research/orc-polar-file-formats.md`, which records rows 30, 35 and 40 of the boat's
     * own certificate. The rows above them are the real `orc-first-10r.pol` grid, the same boat
     * model's 2026 certificate, standing in for the rows the document does not quote.
     */
    const composite: PolarPayload = {
      tws_axis: [4, 6, 8, 10, 12, 14, 16, 20, 24],
      twa_axis: [30, 35, 40, ...ORC_10R.twa_axis],
      boat_speed: [
        [0.88, 1.36, 1.79, 2.21, 2.46, 2.52, 2.54, 2.49, 2.25],
        [1.75, 2.73, 3.59, 4.43, 4.91, 5.03, 5.08, 4.97, 4.5],
        [2.63, 4.09, 5.38, 6.21, 6.44, 6.55, 6.61, 6.65, 6.59],
        ...ORC_10R.boat_speed,
      ],
      source: { format: 'orc-pol', header_token: 'twa/tws' },
    }

    it('reads row 35 as the full ramp and row 40 as what is left of it', () => {
      const kinds = classifyPolarRows(composite)

      // Row 35 is exactly twice row 30 in all nine columns; row 40 is three times it in the
      // three lightest, and real data binds in the rest.
      expect(kinds[0]).toBe('ramp-filler')
      expect(kinds[1]).toBe('ramp-filler')
      expect(kinds[2]).toBe('partial-ramp-filler')
      expect(kinds[3]).toBe('measured')
    })

    it('suppresses 30, 35 and 40 and nothing above them', () => {
      expect(polarSuppression(composite).suppressedTwa).toEqual([30, 35, 40])
    })
  })

  describe('a row a generator interpolated between its neighbours', () => {
    /**
     * The other filler signature the survey records: a row that is the exact arithmetic mean of
     * the rows either side of it, in every column, which no measured row is. Constructed here
     * from the real 90 and 110 rows of `orc-first-10r.pol`, rounded the way an exporter would.
     */
    const withMeanRow: PolarPayload = {
      tws_axis: ORC_10R.tws_axis,
      twa_axis: [90, 100, 110],
      boat_speed: [
        ORC_10R.boat_speed[3],
        ORC_10R.boat_speed[3].map((low, index) =>
          Math.round(((low + ORC_10R.boat_speed[4][index]) / 2) * 100) / 100
        ),
        ORC_10R.boat_speed[4],
      ],
      source: ORC_10R.source,
    }

    it('is called out as interpolated', () => {
      expect(classifyPolarRows(withMeanRow)[1]).toBe('interpolated')
    })

    it('leaves the rows either side of it alone', () => {
      const kinds = classifyPolarRows(withMeanRow)

      expect(kinds[0]).toBe('measured')
      expect(kinds[2]).toBe('measured')
    })
  })

  describe('the sentence the screen prints under a grid with rows missing', () => {
    /** A floor of zeros and nothing else generated: the file simply has nothing at TWA 30. */
    const zeroFloor: PolarPayload = {
      twa_axis: [30, 52, 60],
      tws_axis: ORC_10R.tws_axis,
      boat_speed: [ORC_10R.tws_axis.map(() => 0), ORC_10R.boat_speed[0], ORC_10R.boat_speed[1]],
      source: ORC_10R.source,
    }

    it('does not call a row of zeros a ramp', () => {
      // The row is rightly hidden either way; the reason given for hiding it has to be the one
      // the detector found, because the sentence is the only account the sailor gets.
      const { suppressedTwa, reason } = polarSuppression(zeroFloor)

      expect(suppressedTwa).toEqual([30])
      expect(reason).toContain('records nothing')
      expect(reason?.toLowerCase()).not.toContain('ramp')
    })

    it('says which angle the grid does start at', () => {
      expect(polarSuppression(zeroFloor).reason).toContain('52°')
    })
  })

  describe('grids the detector cannot say anything useful about', () => {
    it('suppresses nothing in a single-row grid', () => {
      const single: PolarPayload = {
        twa_axis: [90],
        tws_axis: [4, 6],
        boat_speed: [[4.43, 5.95]],
        source: { format: 'orc-pol', header_token: 'twa/tws' },
      }

      expect(polarSuppression(single)).toEqual({
        firstTrustworthyTwa: 90,
        suppressedTwa: [],
        reason: null,
      })
    })

    it('shows the whole grid when every row of it looks like filler', () => {
      // Rather than an empty grid. A polar that is filler all the way up is a file we have
      // misread, and hiding all of it would tell the sailor nothing about why.
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

      const { firstTrustworthyTwa, suppressedTwa } = polarSuppression(allRamp)

      expect(firstTrustworthyTwa).toBe(30)
      expect(suppressedTwa).toEqual([])
    })
  })
})

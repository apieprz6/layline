/**
 * Does the paddlewheel need recalibrating — as rules, over Races built by hand so each case fails
 * on its own account. The owner's season, which says "leave it", is pinned in
 * `archive-paddlewheel.test.ts`.
 *
 * Every Race here goes through `paddlewheelDivergence`, the same pipeline the screen reads, so the
 * verdict is tested against the Era it will actually be handed.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import { paddlewheelDivergence } from '@/services/analysis/paddlewheel'
import type { PaddlewheelRace, SpeedPairRow } from '@/services/analysis/paddlewheel'
import {
  CLOSE_ENOUGH_KNOTS,
  paddlewheelVerdict,
} from '@/services/analysis/paddlewheel-verdict'

const NO_LOG = buildCalibrationLog([], [])

/** A gap in knots, given a row's paddlewheel speed and course. */
type Gap = (stw: number, cog: number) => number

/**
 * One Race: twelve rows in each knot from 2 to 8, sailed alternately north and south, with `SOG`
 * the paddlewheel's reading plus `gap`. A Race sailed in June unless told otherwise.
 */
function race(id: string, gap: Gap, day = 3, cog: (index: number) => string | null = (i) => (i % 2 === 0 ? '0' : '180')): PaddlewheelRace {
  const rows: SpeedPairRow[] = []
  for (let band = 2; band < 9; band += 1) {
    for (let step = 0; step < 12; step += 1) {
      const row_index = rows.length + 1
      const stw = band + (step + 0.5) / 12
      const course = cog(step)
      const sog = stw + gap(stw, Number(course ?? 0))
      const row_time = `2026-06-${String(day).padStart(2, '0')} 19:00:00`
      rows.push({
        row_index,
        row_time,
        quality: {
          row_index,
          row_time,
          frozen: false,
          not_water_referenced: false,
          low_speed: false,
          gap_seconds: 30,
        },
        maneuver_window: null,
        countable: true,
        stw: stw.toFixed(3),
        sog: sog.toFixed(3),
        cog: course,
      })
    }
  }
  return { race_id: id, sailed_at: `2026-06-${String(day).padStart(2, '0')} 19:00:00`, rows }
}

function verdictOf(races: PaddlewheelRace[]) {
  const [era] = paddlewheelDivergence(races, NO_LOG)
  return paddlewheelVerdict(era)
}

const four = (gap: Gap): PaddlewheelRace[] => [1, 2, 3, 4].map((n) => race(`race-${n}`, gap, n))

describe('the recommendation', () => {
  it('leaves a paddlewheel alone that is spot on everywhere', () => {
    const verdict = verdictOf(four(() => 0.05))

    expect(verdict.recommendation).toBe('leave-it')
    expect(verdict.bands.filter((band) => band.rows > 0).every((band) => band.verdict === 'spot-on')).toBe(true)
    expect(verdict.spot_on_share).toBe(1)
  })

  it('recalibrates one that reads slow by the same amount at every speed, in every Race', () => {
    const verdict = verdictOf(four(() => 0.4))

    expect(verdict.recommendation).toBe('recalibrate')
    expect(verdict.one_calibration_fixes).toBe(true)
    expect(verdict.bands[5].verdict).toBe('reads-slow')
    expect(verdict.bands[5].mean_gap_knots).toBeCloseTo(0.4, 6)
    expect(verdict.bands[5].agreeing).toBe(4)
  })

  it('recalibrates a gap that is a straight line in speed, slow at the bottom and fast at the top', () => {
    // +0.6 kt at 2 kt falling to −0.6 at 9: a multiplier-and-offset error, which one calibration
    // removes exactly.
    const verdict = verdictOf(four((stw) => 0.6 - ((stw - 2) * 1.2) / 7))

    expect(verdict.bands[2].verdict).toBe('reads-slow')
    expect(verdict.bands[8].verdict).toBe('reads-fast')
    expect(verdict.one_calibration_fixes).toBe(true)
    expect(verdict.recommendation).toBe('recalibrate')
  })

  it('leaves a U alone: spot on in the middle, off at the edges, which no calibration can follow', () => {
    const verdict = verdictOf(four((stw) => (stw < 3 ? 0.45 : stw >= 8 ? 0.45 : 0)))

    expect(verdict.bands[2].verdict).toBe('reads-slow')
    expect(verdict.bands[5].verdict).toBe('spot-on')
    expect(verdict.one_calibration_fixes).toBe(false)
    expect(verdict.recommendation).toBe('leave-it')
  })

  it('cannot tell where the Races lean opposite ways, which is current or noise', () => {
    // Two read +0.8 kt slow and two −0.3 fast: +0.25 on average, outside the window, and only half
    // the Races leaning that way.
    const races = [1, 2, 3, 4].map((n) => race(`race-${n}`, () => (n <= 2 ? 0.8 : -0.3), n))
    const verdict = verdictOf(races)

    expect(verdict.bands[5].verdict).toBe('races-disagree')
    expect(verdict.recommendation).toBe('cant-tell')
  })

  it('cannot tell from two Races, however clear they look', () => {
    const verdict = verdictOf([race('a', () => 0.5, 1), race('b', () => 0.5, 2)])

    expect(verdict.bands.every((band) => band.verdict === 'thin')).toBe(true)
    expect(verdict.recommendation).toBe('cant-tell')
  })

  it('cannot tell when the gap swings with heading, because that is current', () => {
    // +0.7 kt northbound and +0.1 on the other three headings: every Race agrees it reads slow on
    // average, and it would — a current does exactly this, and recalibrating would bake it in.
    const races = [1, 2, 3, 4].map((n) =>
      race(`race-${n}`, (_, cog) => (cog === 0 ? 0.7 : 0.1), n, (i) => String((i % 4) * 90))
    )
    const verdict = verdictOf(races)

    expect(verdict.bands[5].verdict).toBe('reads-slow')
    expect(verdict.heading.swing_knots).toBeCloseTo(0.6, 6)
    expect(verdict.recommendation).toBe('cant-tell')
  })

  it('says clean it first when the gap grew through the season, which is weed', () => {
    const races = [1, 2, 3, 4, 5, 6].map((n) => race(`race-${n}`, () => 0.1 * n, n))
    const verdict = verdictOf(races)

    expect(verdict.drift.change_knots).toBeGreaterThan(CLOSE_ENOUGH_KNOTS)
    expect(verdict.recommendation).toBe('clean-first')
  })
})

describe('what it reads, and what it refuses to', () => {
  it('weights every Race equally in a band, however long it sailed there', () => {
    const verdict = verdictOf([
      race('a', () => 0.3, 1),
      race('b', () => 0.3, 2),
      race('c', () => 0.6, 3),
    ])

    expect(verdict.bands[4].mean_gap_knots).toBeCloseTo(0.4, 6)
  })

  it('keeps a band no Race sailed, as a band with no rows rather than a gap of zero', () => {
    const verdict = verdictOf(four(() => 0))

    expect(verdict.bands[0]).toEqual({
      band: 0,
      verdict: 'thin',
      mean_gap_knots: null,
      races: [],
      agreeing: 0,
      rows: 0,
    })
  })

  it('leaves a row with no COG out of the heading check, rather than reading it as north', () => {
    // Every northbound row has no course. Were a blank read as 0°, the north sector would fill.
    const races = [1, 2, 3, 4].map((n) =>
      race(`race-${n}`, (_, cog) => (cog === 0 ? 0.9 : 0), n, (i) => (i % 2 === 0 ? null : '180'))
    )
    const verdict = verdictOf(races)

    expect(verdict.heading.sectors[0]).toEqual({ sector: 0, mean_gap_knots: null, races: 0 })
    expect(verdict.heading.sectors[4].races).toBe(4)
  })

  it('publishes nothing a sailor could type into the display', () => {
    const verdict = verdictOf(four((stw) => 0.6 - ((stw - 2) * 1.2) / 7))

    // The line behind `one_calibration_fixes` is fitted and thrown away: its tilt is a drafted
    // multiplier, and its intercept a drafted offset (ADR 0027, ADR 0041).
    const keys = JSON.stringify(verdict).match(/"[a-z_]+":/g) ?? []
    expect(keys.filter((key) => /slope|intercept|tilt|multiplier|correction/.test(key))).toEqual([])
  })
})

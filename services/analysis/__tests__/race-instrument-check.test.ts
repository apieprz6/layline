/**
 * One Race's contribution to each **Calibration Channel**, as the per-Race page states it.
 *
 * Pinned against the season's own per-Race functions over the same rows, so the tile under a Race
 * and the Instrument Tuning screen cannot read one Race two ways.
 */

import { raceAwaAsymmetry } from '@/services/analysis/awa-asymmetry'
import { raceHeadingOffset } from '@/services/analysis/compass-deviation'
import {
  RACE_SPEED_GAP_KNOTS,
  raceInstrumentCheck,
  tuningRaceRows,
  type TuningRace,
  type TuningRow,
} from '@/services/analysis/instrument-tuning'
import { lineGapAt, raceDivergence } from '@/services/analysis/paddlewheel'

const WINDOW = { window_start: '2026-07-11T14:00:00', window_finish: '2026-07-11T15:00:00' }

function at(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `2026-07-11T14:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * A boat sailing a slow circle: every heading on the rose, a compass reading high to the north and
 * low to the south, and a paddlewheel reading a little under the GPS across six knots of speed.
 */
function circling(count: number): TuningRow[] {
  return Array.from({ length: count }, (_, index) => {
    const heading = (index * 10) % 360
    const deviation = 4 * Math.cos((heading * Math.PI) / 180)
    const stw = 3 + (index % 7)
    return {
      row_index: index,
      row_time: at(index * 10),
      latitude: (41.85 + index * 0.0005).toFixed(5),
      longitude: (-87.55 + index * 0.0005).toFixed(5),
      ctw: heading.toFixed(0),
      cog: ((heading - deviation + 360) % 360).toFixed(1),
      stw: stw.toFixed(1),
      sog: (stw * 1.05).toFixed(2),
      twa: '60',
      awa_calc: '40',
    }
  })
}

function race(rows: TuningRow[]): TuningRace {
  return { race_id: 'race-a', rows, window: WINDOW }
}

describe('one Race, checked against each channel', () => {
  it('is the season’s own three per-Race readings, over the same rows', () => {
    const subject = race(circling(108))
    const read = tuningRaceRows(subject)
    const check = raceInstrumentCheck(subject)

    expect(check.heading).toEqual(raceHeadingOffset(read))
    expect(check.asymmetry).toEqual(raceAwaAsymmetry(read))

    const divergence = raceDivergence({ race_id: 'race-a', sailed_at: WINDOW.window_start, rows: read.rows })
    expect(divergence.fit.fitted).toBe(true)
    if (!divergence.fit.fitted || !check.speed.fitted) throw new Error('expected a line')

    expect(check.speed.r_squared).toBe(divergence.fit.line.r_squared)
    // The gap at the two speeds the season's own headline reads, off the same line.
    expect(check.speed.gaps).toEqual(
      RACE_SPEED_GAP_KNOTS.map((knots) => ({
        stw_knots: knots,
        gap_knots: lineGapAt(divergence.fit.fitted ? divergence.fit.line : (null as never), knots),
      }))
    )
  })

  it('reads the compass swing off this Race’s own headings, highest less lowest', () => {
    const check = raceInstrumentCheck(race(circling(108)))
    if (!check.heading.ok) throw new Error('expected a compass reading')

    const figures = check.heading.offset.bins.flatMap((bin) =>
      bin.mean_error_deg === null ? [] : [bin.mean_error_deg]
    )
    expect(check.heading_swing_deg).toBeCloseTo(Math.max(...figures) - Math.min(...figures))
    expect(check.heading_swing_deg).toBeGreaterThan(6)
  })

  it('says why, channel by channel, where the Race produced nothing — never a zero', () => {
    const check = raceInstrumentCheck(race(circling(3)))

    expect(check.heading).toMatchObject({ ok: false, reason: 'too-few-rows' })
    expect(check.heading_swing_deg).toBeNull()
    expect(check.asymmetry).toMatchObject({ ok: false })
    expect(check.speed).toEqual({ fitted: false, reason: 'too-few-points' })
  })

  it('is a Race with no rows in its window, stated as such on every channel', () => {
    const check = raceInstrumentCheck(race([]))

    expect(check.heading).toMatchObject({ ok: false, reason: 'too-few-rows', row_count: 0 })
    expect(check.asymmetry).toMatchObject({ ok: false, reason: 'too-few-rows' })
    expect(check.speed).toEqual({ fitted: false, reason: 'no-points' })
  })
})

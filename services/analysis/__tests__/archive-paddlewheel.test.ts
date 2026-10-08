/**
 * The paddlewheel against `SOG`, over the recordings its figures were measured on.
 *
 * Pinned as counts and knots rather than as shapes, for the same reason Row Quality's and the
 * Maneuvers' archive suites are: these numbers decide what the `STW` card says about a season, and
 * the only way to notice the arithmetic drifting is to write down what the archive measures today
 * and fail when it stops measuring that.
 *
 * Needs the owner's recordings, so it skips loudly without them — see `archive.ts`.
 *
 * ## What this suite reproduces, and from where
 *
 * ADR 0034's prototype measured the archive in Python (`compute-charts.py` on the throwaway branch
 * `prototype/lay-149-diagnostic-charts`) and published four figures this implementation has to
 * agree with: a slope of **0.94** regressing `SOG` on `STW`, **1.02** the other way round and
 * **0.98** orthogonally; and a gap that is **U-shaped** over Countable rows — about +0.45 kt at
 * 2–3 kt, near zero at 4–6 kt and +0.3 to +0.5 kt at 8–9 kt.
 *
 * They reproduce, to the second decimal on all three slopes, over a slightly different population:
 * the prototype detected Maneuvers after clipping to the Race Window and this reads the real
 * engine, which detects before (ADR 0009) — 2,698 Countable rows against the prototype's 2,707.
 *
 * ADR 0027's own figures are *not* pinned here and are not expected to reproduce: it measured a
 * gap growing steadily to roughly 10% at 9–10 kt over all 6,337 rows with `SOG ≥ 3.5`, a
 * population that includes **Frozen** rows and **Maneuver Windows**. ADR 0034 refines that
 * description on the Countable rows, and this suite follows ADR 0034.
 */

import { buildCalibrationLog, calibrationEras } from '@/lib/boat/calibrationLog'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import {
  MIN_SOG_SPREAD_KNOTS,
  lineGapAt,
  paddlewheelDivergence,
} from '@/services/analysis/paddlewheel'
import type {
  BandAxis,
  EraDivergence,
  FitMethod,
  PaddlewheelRace,
  SpeedPairRow,
} from '@/services/analysis/paddlewheel'
import {
  archiveFilenames,
  describeArchive,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { CalibrationEvent } from '@/types'

/**
 * One recording as a Race this check can read: both axes over the whole Transcription, joined,
 * filtered to the Race Window, and only then paired with the two speeds the file recorded.
 *
 * The join is by `row_index` rather than by position, because a filtered list and the file it came
 * from no longer agree about which row is the fifth.
 */
function race(filename: string): PaddlewheelRace {
  const { rows: recorded } = transcribe(filename).transcription
  const quality = assessRowQuality(recorded)
  const whole = analysisRows(quality, detectManeuvers(recorded, quality))
  const speeds = new Map(recorded.map((row) => [row.row_index, row]))

  const rows: SpeedPairRow[] = analysisRowsWithin(whole, raceWindowFor(filename)).map((row) => {
    const held = speeds.get(row.row_index)
    if (!held) throw new Error(`row ${row.row_index} is not in its own recording`)
    return { ...row, sog: held.sog, stw: held.stw }
  })

  return {
    race_id: filename.replace(/\.csv$/, ''),
    sailed_at: raceWindowFor(filename).window_start,
    rows,
  }
}

/** The whole archive as one season, with nothing recorded against the `STW` channel. */
function season(options: { method?: FitMethod; band_axis?: BandAxis } = {}): EraDivergence {
  const eras = paddlewheelDivergence(archiveFilenames.map(race), buildCalibrationLog([], []), options)

  expect(eras).toHaveLength(1)
  return eras[0]
}

/** The slope of the drawn line, which is a thing a test may compute and a card may not print. */
function slopeOf(era: EraDivergence): number {
  if (!era.fit.fitted) throw new Error(`the archive carried no line: ${era.fit.reason}`)

  const [from, to] = era.fit.line.ends
  return (to.sog - from.sog) / (to.stw - from.stw)
}

describeArchive('the archive, read as paddlewheel divergence', () => {
  it('is 2,698 Countable rows, every one of them carrying an `STW`', () => {
    // So ADR 0027's blank-`STW` stat is zero over the rows the scatter reads (ADR 0034). The 935
    // in-window rows the paddlewheel said nothing on were all excluded before it looked: 845 of
    // them Frozen, and the other 90 Low-Speed — the log going quiet because the boat stopped
    // moving through the water. Not one of them is a point, and none of them is plotted at zero.
    const { coverage } = season()

    expect(coverage).toEqual({
      rows: 4088,
      countable: 2698,
      points: 2698,
      blank_stw: 0,
      blank_sog: 0,
      excluded_blank_stw: { frozen: 845, low_speed: 90, maneuver_window: 0 },
    })
  })

  it('reproduces the three slopes one population gives under three fit methods', () => {
    // ADR 0034's measurement, and the reason no coefficient is ever printed: regressing `SOG` on
    // `STW` says the paddlewheel over-reads at speed and regressing the other way says it
    // under-reads. The orthogonal fit, which is the only one of the three that treats both
    // channels as the measurements they are, sits between them and is the default.
    expect(slopeOf(season({ method: 'sog-on-stw' }))).toBeCloseTo(0.94, 2)
    expect(slopeOf(season({ method: 'orthogonal' }))).toBeCloseTo(0.98, 2)
    expect(slopeOf(season({ method: 'stw-on-sog' }))).toBeCloseTo(1.02, 2)
    expect(slopeOf(season())).toBeCloseTo(slopeOf(season({ method: 'orthogonal' })), 12)
  })

  it('reports one `R²` and one Measured Offset, whichever way the line was fitted', () => {
    // `R²` is a property of the points and the gap is their mean: the method moves the line
    // through them and can move neither of these.
    const figures = (['orthogonal', 'sog-on-stw', 'stw-on-sog'] as const).map((method) => {
      const era = season({ method })
      return {
        r_squared: era.fit.fitted ? era.fit.line.r_squared : null,
        gap: era.measured_offset_knots,
      }
    })

    expect(figures[0].r_squared).toBeCloseTo(0.918, 3)
    expect(figures[0].gap).toBeCloseTo(0.122, 3)
    expect(figures[1]).toEqual(figures[0])
    expect(figures[2]).toEqual(figures[0])
  })

  it('reads the card’s gap from 1:1 at 4 kt and at 8 kt off the drawn line', () => {
    // ADR 0035's `STW` headline, promoted from the chart's own readout. Two points on the line in
    // the Measured Offset's own unit — never the line's slope, and never its intercept.
    const era = season()
    if (!era.fit.fitted) throw new Error('the archive carried no line')

    expect(lineGapAt(era.fit.line, 4)).toBeCloseTo(0.155, 3)
    expect(lineGapAt(era.fit.line, 8)).toBeCloseTo(0.076, 3)
  })

  it('leaves 11 of the 13 Races carrying a line of their own', () => {
    // ADR 0034 reads the `STW` coverage verdict off this share. The two without one are the
    // 29 July and 2 September beer-cans, which never spanned three knots of `SOG` between them —
    // both still show every one of their points.
    const era = season()
    const narrow = era.races.filter((held) => !held.fit.fitted)

    expect(era.races_with_points).toBe(13)
    expect(era.races_with_a_line).toBe(11)
    expect(narrow.map((held) => [held.race_id, held.fit.fitted ? null : held.fit.reason])).toEqual([
      ['07-29-26-beer-can', 'narrow-spread'],
      ['09-02-2026-beer-can', 'narrow-spread'],
    ])
    expect(narrow.every((held) => held.points.length > 0)).toBe(true)
    expect(narrow.every((held) => (held.sog_spread_knots ?? 0) < MIN_SOG_SPREAD_KNOTS)).toBe(true)
  })
})

describeArchive('the U the archive’s rows make around the line', () => {
  /** The mean gap per band, by recorded `SOG`, which is the banding ADR 0034's figures are on. */
  function bySog(): Map<number, number> {
    return new Map(
      season({ band_axis: 'sog' }).gap_by_speed.map((band) => [band.band, band.mean_gap_knots])
    )
  }

  it('is about +0.45 kt down at 2–3 kt, where ADR 0034 measured it', () => {
    expect(bySog().get(2)).toBeCloseTo(0.48, 2)
  })

  it('is near zero through the middle, at 4–6 kt', () => {
    const bands = bySog()

    expect(bands.get(4)).toBeCloseTo(-0.15, 2)
    expect(bands.get(5)).toBeCloseTo(-0.04, 2)
    expect(bands.get(6)).toBeCloseTo(0.15, 2)
  })

  it('and opens back up to +0.3 to +0.5 kt at 8–9 kt', () => {
    const bands = bySog()

    expect(bands.get(7)).toBeCloseTo(0.31, 2)
    expect(bands.get(8)).toBeCloseTo(0.42, 2)
    expect(bands.get(7)).toBeGreaterThan(0.3)
    expect(bands.get(8)).toBeLessThan(0.5)
  })

  it('reads lower at the top end banded by `STW` instead, which is ADR 0034’s own caveat', () => {
    // 0.20 kt against 0.42 for the same rows. Which channel the bands are cut on is a statement
    // the chart has to make, not a default this module may pick silently.
    const byStw = new Map(season().gap_by_speed.map((band) => [band.band, band.mean_gap_knots]))

    expect(byStw.get(8)).toBeCloseTo(0.2, 2)
    expect(byStw.get(5)).toBeCloseTo(-0.01, 2)
  })

  it('is a shape a straight line cannot hold, which is why both views exist', () => {
    // The line reads 0.08 kt high at 8 kt while the rows there read 0.42 — a disagreement of a
    // third of a knot, well past the 0.1 kt ADR 0034 has the readout flag. A single scalar cannot
    // represent a U, and the fitted line is not one either.
    const era = season()
    if (!era.fit.fitted) throw new Error('the archive carried no line')
    const rows = bySog()

    const line = lineGapAt(era.fit.line, 8.5)
    expect(line).not.toBeNull()
    expect(Math.abs((rows.get(8) as number) - (line as number))).toBeGreaterThan(0.1)
  })

  it('weights every Race equally in a band, so the 13-hour race owns none of them', () => {
    // The St Joe distance race is 726 of the archive's 2,698 Countable rows — a quarter of the
    // season by row count, and one Race of thirteen by this module's arithmetic.
    const era = season()
    const stJoe = era.races.find((held) => held.race_id === '09-04-2026-chicago-st-joe')

    expect(stJoe?.points).toHaveLength(726)
    expect(era.gap_by_speed.every((band) => band.races <= 13)).toBe(true)
    expect(era.gap_by_speed.find((band) => band.band === 5)?.races).toBe(13)
  })
})

describeArchive('the archive’s own Calibration Eras', () => {
  /**
   * The one act recorded against this boat's instruments: the 4 July compass autocompensation,
   * which lives in Handsome-Pete's `compass-calibrations.yaml` and which the owner has not yet
   * entered through the Boat management UI. Written here as the Event it would be — the same
   * stand-in ADR 0034's prototype used, and the only way to read an era boundary at all today.
   */
  const AUTOCOMPENSATION: CalibrationEvent = {
    id: 'event-stand-in',
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    occurred_on: '2026-07-04',
    type: 'autocompensation',
    channels: ['HDG'],
    note: 'Compass swung; deviation table rebuilt.',
    created_by: 'admin-1',
    created_at: '2026-07-05T02:00:00Z',
    updated_at: '2026-07-05T02:00:00Z',
  }

  it('is one `STW` Era over the whole season, because nothing was done to the paddlewheel', () => {
    // ADR 0032's correct failure, stated as a measurement: the compass has two Eras and the
    // paddlewheel has one, and no step in `STW` anywhere in these 2,698 rows may add a second.
    const log = buildCalibrationLog([], [AUTOCOMPENSATION])

    expect(calibrationEras(log, 'HDG')).toHaveLength(2)

    const eras = paddlewheelDivergence(archiveFilenames.map(race), log)
    expect(eras).toHaveLength(1)
    expect(eras[0].era.from_date).toBeNull()
    expect(eras[0].era.until_date).toBeNull()
    expect(eras[0].races).toHaveLength(13)
  })

  it('splits the season in two the day an `STW` act is written down, and not before', () => {
    // What the screen will show the first time the owner records cleaning the paddlewheel. The
    // two figures are the same rows the single Era pooled, read either side of the act: six
    // Races before 4 July and seven after.
    const cleaned: CalibrationEvent = {
      ...AUTOCOMPENSATION,
      id: 'event-stand-in-stw',
      type: 'other',
      channels: ['STW'],
      note: 'Paddlewheel cleaned.',
    }
    const eras = paddlewheelDivergence(
      archiveFilenames.map(race),
      buildCalibrationLog([], [cleaned])
    )

    expect(eras.map((era) => [era.era.from_date, era.races.length])).toEqual([
      [null, 6],
      ['2026-07-04', 7],
    ])
    expect(eras[0].measured_offset_knots).toBeCloseTo(0.213, 3)
    expect(eras[1].measured_offset_knots).toBeCloseTo(0.044, 3)
    // And neither Era is the season's own 0.122 kt, which is the whole point of partitioning.
    expect(eras.every((era) => Math.abs((era.measured_offset_knots as number) - 0.122) > 0.01)).toBe(
      true
    )
  })
})

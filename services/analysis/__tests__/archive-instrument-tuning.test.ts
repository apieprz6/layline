/**
 * The `HDG` Measured Offset and the Apparent Wind Asymmetry, over the recordings their figures were
 * measured on.
 *
 * The regression guard, pinned as figures rather than shapes, for the same reason Row Quality's and
 * Maneuvers' are: these numbers are what the Instrument Tuning screen says about a season, and the
 * only way to notice a rule drifting is to write down what the archive measures today and fail when
 * it stops measuring that.
 *
 * Needs the owner's recordings, so it skips loudly without them — see `archive.ts`.
 *
 * ## What this reproduces, and the two figures it deliberately does not
 *
 * ADR 0034 read these two checks off a prototype over this same archive. Everything it states
 * precisely is reproduced here exactly: `+12.7°` heading NNE against `−8.9°` WSW since the 4 July
 * autocompensation, a 22° swing, a curve reaching 33 of 36 headings with 24 of them on two or more
 * Races and its most extreme bin on two; per-Race heading coverage spanning 14% to 56%; 18 upwind
 * Tack Pairs from 10 Races and 2 downwind pairs from 2; starboard reading 10.2° wider downwind.
 *
 * Two of its figures come out differently, both for reasons worth stating rather than chasing:
 *
 * - **The `+3.3°` era mean.** This implementation reads `+3.63°` averaging every heading equally
 *   and `+3.09°` averaging every Race equally (σ 2.6 over those seven Race means, which is the
 *   other half of the ADR's retired band, reproduced). ADR 0035 is the reason the discrepancy does
 *   not matter: the card now leads with the swing, and the mean is a secondary line that has to
 *   state its own weighting — which is exactly the ambiguity a single `+3.3°` was hiding.
 * - **The Asymmetry moving `−3.8° → −5.5°` across the autocompensation.** The `−5.5` is reproduced
 *   to the decimal; the `−3.8` is reproducible only by averaging upwind and downwind together,
 *   which is the one figure this service refuses to compute. Pinned below as what the prior art's
 *   retired `overall_offset` would have said, computed in the test rather than offered by the
 *   module. Upwind alone moves `−6.25° → −5.51°` across the same boundary, which is a smaller move
 *   in the same direction, so ADR 0034's conclusion — that the Asymmetry does not look
 *   compass-driven — survives reading it the honest way.
 */

import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import {
  awaAsymmetryByEra,
  eraAwaAsymmetry,
  raceAwaAsymmetry,
} from '@/services/analysis/awa-asymmetry'
import { calibrationEras } from '@/services/analysis/calibration-eras'
import { headingOffsetByEra, raceHeadingOffset } from '@/services/analysis/compass-deviation'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { SOG_MIN_KNOTS, analysisReadings, channelValue } from '@/services/analysis/readings'
import {
  archiveFilenames,
  describeArchive,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type {
  AnalysisReading,
  CalibrationEra,
  CalibrationEvent,
  EraAwaAsymmetry,
  EraHeadingOffset,
  RaceAwaAsymmetryResult,
  RaceHeadingOffsetResult,
} from '@/types'

/** One Race: a recording, assessed whole, joined to its channels, then clipped to its window. */
interface ArchiveRace {
  race_id: string
  window_start: string
  rows: AnalysisReading[]
}

function races(): ArchiveRace[] {
  return archiveFilenames.map((filename) => {
    const rows = transcribe(filename).transcription.rows
    const quality = assessRowQuality(rows)
    const window = raceWindowFor(filename)
    const readings = analysisReadings(rows, analysisRows(quality, detectManeuvers(rows, quality)))

    return {
      race_id: filename.replace(/\.csv$/, ''),
      window_start: window.window_start,
      rows: analysisRowsWithin(readings, window),
    }
  })
}

/**
 * The archive's one recorded act on the compass: the 4 July autocompensation.
 *
 * Written out here rather than read from the prior art's `compass-calibrations.yaml`, for the same
 * reason the Race Windows are (`archive.ts`): this reaches Layline as a **Calibration Event** a
 * person entered through the finished UI, and every figure below is a figure under exactly this
 * boundary.
 */
const AUTOCOMPENSATION: CalibrationEvent = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Autocompensation performed; the compass rebuilt its own deviation table.',
  created_by: 'admin-1',
  created_at: '2026-07-05T02:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
}

const HDG_ERAS: CalibrationEra[] = calibrationEras(
  buildCalibrationLog([], [AUTOCOMPENSATION]),
  'HDG'
)

/** The whole season as one Era, which is what a channel with nothing recorded against it gets. */
const SEASON: CalibrationEra = calibrationEras([], 'HDG')[0]

function compassResults(): RaceHeadingOffsetResult[] {
  return races().map(raceHeadingOffset)
}

function asymmetryResults(): RaceAwaAsymmetryResult[] {
  return races().map(raceAwaAsymmetry)
}

/** The Era before the autocompensation and the one since, in that order. */
function headingEras(): EraHeadingOffset[] {
  return headingOffsetByEra(HDG_ERAS, compassResults())
}

function asymmetryEras(): EraAwaAsymmetry[] {
  return awaAsymmetryByEra(HDG_ERAS, asymmetryResults())
}

describeArchive('the archive, read as the Measured Offset for HDG', () => {
  it('measures every one of the thirteen Races, the smallest on 30 rows', () => {
    const results = compassResults()

    // Every Race clears five readable rows. The smallest is 09-02, a 20-minute beer-can with 30 —
    // worth pinning because it is the Race nearest the gate, and the gate is what keeps a figure
    // from being computed off a handful of rows.
    expect(results).toHaveLength(13)
    expect(results.filter((result) => result.ok)).toHaveLength(13)

    const smallest = results.flatMap((result) => (result.ok ? [result.offset] : []))
    expect(Math.min(...smallest.map((offset) => offset.row_count))).toBe(30)
  })

  it('finds no single Race covers the compass: 14% to 56% of the rose', () => {
    // ADR 0034's reason the Era is the level this figure is read at, and the reason a Race's own
    // mean is mostly a fact about which courses it sailed.
    const coverage = compassResults().flatMap((result) =>
      result.ok ? [result.offset.heading_coverage] : []
    )

    expect(Math.min(...coverage) * 100).toBeCloseTo(13.9, 1)
    expect(Math.max(...coverage) * 100).toBeCloseTo(55.6, 1)
  })

  it('reads the current Era as a curve from +12.7° at NNE to −8.9° at WSW, a 22° swing', () => {
    const [, since] = headingEras()

    expect(since.era.from_date).toBe('2026-07-04')
    expect(since.swing?.highest.bin_center_deg).toBe(15)
    expect(since.swing?.highest.mean_error_deg).toBeCloseTo(12.7, 1)
    expect(since.swing?.lowest.bin_center_deg).toBe(245)
    expect(since.swing?.lowest.mean_error_deg).toBeCloseTo(-8.9, 1)
    expect(since.swing?.swing_deg).toBeCloseTo(21.6, 1)
  })

  it('and as a curve the Era’s mean is an average of, whichever way the mean is weighted', () => {
    const [, since] = headingEras()

    // Neither of these is a heading the compass actually shows, which is why ADR 0035 demoted the
    // mean to a secondary line that states its own weighting.
    expect(since.mean_of_bins_deg).toBeCloseTo(3.63, 2)
    expect(since.mean_of_races_deg).toBeCloseTo(3.09, 2)
  })

  it('reads the Era before it as the same shape about ten degrees higher', () => {
    const [before, since] = headingEras()

    // The autocompensation moved the mean and left the shape: a 23° swing either side of it.
    expect(before.era.from_date).toBe(null)
    expect(before.swing?.swing_deg).toBeCloseTo(22.9, 1)
    expect(before.mean_of_bins_deg).toBeCloseTo(12.72, 2)
    expect((before.mean_of_bins_deg as number) - (since.mean_of_bins_deg as number)).toBeCloseTo(
      9.1,
      1
    )
  })

  it('rests the current Era’s curve on 33 headings, 24 of them on two or more Races', () => {
    const [before, since] = headingEras()

    // The coverage ADR 0034's verdict reads, and the reason it reads the two-or-more share rather
    // than the bare one: 33 bins have a figure, and a third of them are one Race's heading mix.
    expect(since.race_count).toBe(7)
    expect(since.headings_covered).toBe(33)
    expect(since.headings_on_two_or_more_races).toBe(24)
    // Its most extreme bin rests on two Races, which is what the swing is leaning on.
    expect(since.swing?.highest.race_count).toBe(2)

    expect(before.race_count).toBe(6)
    expect(before.headings_covered).toBe(32)
    expect(before.headings_on_two_or_more_races).toBe(21)
  })

  it('never pools the Races’ rows, so the 13-hour race does not swamp the beer-cans', () => {
    const [, since] = headingEras()
    const stJoe = since.races.find((race) => race.race_id === '09-04-2026-chicago-st-joe')

    // The distance race brings 634 of the Era's rows — more than its other six Races together —
    // and its own `+8.08°` counts once, like every other Race's. Pooling rows would read the Era
    // at `+5.8°` instead of `+3.1°`, on the strength of one long night.
    expect(stJoe?.row_count).toBe(634)
    expect(stJoe?.mean_offset_deg).toBeCloseTo(8.08, 2)
    expect(since.mean_of_races_deg).toBeCloseTo(3.09, 2)
  })

  it('carries the caveat on every figure it returns', () => {
    const [before, since] = headingEras()
    const everyFigure = [
      ...headingEras().map((era) => era.caveat),
      ...before.races.map((race) => race.caveat),
      ...since.races.map((race) => race.caveat),
    ]

    expect(everyFigure).toHaveLength(2 + 13)
    expect(everyFigure.every((caveat) => caveat.includes('CTW = HDG + leeway'))).toBe(true)
  })
})

describeArchive('why the angle wrap is written out rather than transliterated', () => {
  /** `CTW − COG` below −180: the inputs a plain `%` gets wrong. */
  function wrappingRows(): { race_id: string; count: number }[] {
    return races().map((race) => ({
      race_id: race.race_id,
      count: race.rows.filter((row) => {
        if (!row.countable) return false
        const sog = channelValue(row.sog)
        const heading = channelValue(row.ctw)
        const course = channelValue(row.cog)
        if (sog === null || sog < SOG_MIN_KNOTS) return false
        return heading !== null && course !== null && heading - course < -180
      }).length,
    }))
  }

  it('is 189 real rows across 9 of the 13 Races, not an edge case', () => {
    const wrapping = wrappingRows()

    expect(wrapping.reduce((total, race) => total + race.count, 0)).toBe(189)
    expect(wrapping.filter((race) => race.count > 0)).toHaveLength(9)
  })

  it('and would read 06-06-26-nood at −107.5° instead of +14.5°', () => {
    const race = races().find((candidate) => candidate.race_id === '06-06-26-nood')
    const result = raceHeadingOffset(race as ArchiveRace)
    if (!result.ok) throw new Error('expected a figure for 06-06-26-nood')

    // The same rows under `(d + 180) % 360 - 180`, which is the Python's own source text: 122° of
    // compass error out of nowhere, silently, on a figure a sailor would act on.
    const naive = race?.rows.flatMap((row) => {
      const sog = channelValue(row.sog)
      const heading = channelValue(row.ctw)
      const course = channelValue(row.cog)
      if (!row.countable || sog === null || sog < SOG_MIN_KNOTS) return []
      if (heading === null || course === null) return []
      return [((heading - course + 180) % 360) - 180]
    }) as number[]

    expect(result.offset.mean_offset_deg).toBeCloseTo(14.51, 2)
    expect(naive.reduce((total, error) => total + error, 0) / naive.length).toBeCloseTo(-107.5, 1)
  })
})

describeArchive('the archive, read as Apparent Wind Asymmetry', () => {
  it('is 18 upwind Tack Pairs from 10 Races, and 2 downwind pairs from 2', () => {
    const season = eraAwaAsymmetry(SEASON, asymmetryResults())

    // The finding this check exists to surface: the two points of sail are not comparable
    // populations, and the downwind one is two pairs.
    expect(season.upwind).toMatchObject({ pair_count: 18, race_count: 10 })
    expect(season.downwind).toMatchObject({ pair_count: 2, race_count: 2 })
  })

  it('and they lean opposite ways: port 11.6° wider upwind, starboard 10.2° wider downwind', () => {
    const season = eraAwaAsymmetry(SEASON, asymmetryResults())

    // A vane rotated on the mast would lean the same way on both. Averaging the two would read
    // `−0.4°` and report a symmetric instrument, which is why no such figure exists here.
    // (ADR 0034 reports the upwind side as 11.5°, a tenth of a degree from this; its downwind
    // figure is reproduced exactly.)
    expect(season.upwind).toMatchObject({ wider_tack: 'port' })
    expect(season.upwind?.wider_by_deg).toBeCloseTo(11.6, 1)
    expect(season.downwind).toMatchObject({ wider_tack: 'starboard' })
    expect(season.downwind?.wider_by_deg).toBeCloseTo(10.2, 1)
  })

  it('excludes three Races outright, each with its reason', () => {
    const season = eraAwaAsymmetry(SEASON, asymmetryResults())

    // Not points at zero: two Races never paired a tack and one never held two steady segments.
    expect(
      season.excluded.map((excluded) => [excluded.race_id, excluded.reason])
    ).toEqual([
      ['06-06-26-nood', 'no-pairs'],
      ['06-20-26-chi-wauk', 'no-pairs'],
      ['08-26-26-beer-can', 'too-few-segments'],
    ])
    expect(season.race_count).toBe(10)
  })

  it('reads the autocompensation as moving the upwind Asymmetry from −6.25° to −5.51°', () => {
    const [before, since] = asymmetryEras()

    // On 4 Races and then 6, which is ADR 0034's own split. A compass that moved ten degrees moved
    // this by three quarters of one, in the same direction — so this does not look compass-driven,
    // the conclusion the ADR drew from the averaged figure below.
    expect(before.upwind?.race_count).toBe(4)
    expect(before.upwind?.asymmetry_deg).toBeCloseTo(-6.25, 2)
    expect(since.upwind?.race_count).toBe(6)
    expect(since.upwind?.asymmetry_deg).toBeCloseTo(-5.51, 2)

    // And the downwind side is entirely in the earlier Era: both of its pairs were sailed before
    // the autocompensation, so there is nothing to compare it across. An average of the two sides
    // would therefore be comparing an upwind-and-downwind mixture against an upwind-only one.
    expect(before.downwind?.pair_count).toBe(2)
    expect(since.downwind).toBe(null)
  })

  it('and declines to produce the −3.8° the prior art’s retired average would have', () => {
    const [before, since] = asymmetryEras()

    /** The prior art's `overall_offset`: a Race's every pair averaged, whatever its point of sail. */
    const retired = (era: EraAwaAsymmetry): number => {
      const perRace = era.races.map(
        (race) => race.pairs.reduce((total, pair) => total + pair.asymmetry_deg, 0) / race.pairs.length
      )
      return perRace.reduce((total, value) => total + value, 0) / perRace.length
    }

    // ADR 0034's `−3.8° → −5.5°` reproduced — in the test, from the pairs, because the module
    // offers no such figure. The earlier Era's two downwind pairs lean the other way and pull its
    // number two and a half degrees toward zero, which is the erasure ADR 0035 names.
    expect(retired(before)).toBeCloseTo(-3.85, 2)
    expect(retired(since)).toBeCloseTo(-5.51, 2)
  })

  it('carries the caveat on every figure it returns', () => {
    const season = eraAwaAsymmetry(SEASON, asymmetryResults())
    const everyFigure = [
      season.caveat,
      season.upwind?.caveat,
      season.downwind?.caveat,
      ...season.races.flatMap((race) => [race.caveat, race.upwind?.caveat, race.downwind?.caveat]),
    ].filter((caveat): caveat is string => caveat !== undefined)

    expect(everyFigure.every((caveat) => caveat.includes('not a Measured Offset'))).toBe(true)
  })
})

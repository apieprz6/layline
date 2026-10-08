/**
 * Shapes for the chart suites, built by hand so each one isolates the rule under test.
 *
 * Invented, and not pretending otherwise. What the charts do over the owner's real season is a
 * separate suite — `services/analysis/__tests__/archive-charts.test.tsx` renders all three through
 * the real services over the real recordings. These exist so a rule like "a bin resting on one Race
 * is drawn hollow" can be stated with one Race in it, which no real season would hand over.
 */

import type { EraDivergence, RaceDivergence } from '@/services/analysis/paddlewheel'
import type {
  CalibrationEra,
  CalibrationEvent,
  EraAsymmetryFigure,
  EraAwaAsymmetry,
  EraHeadingBin,
  EraHeadingOffset,
  HeadingBin,
  PairedPointOfSail,
  RaceAwaAsymmetry,
  RaceHeadingOffset,
  Tack,
  TackPair,
  TackSegment,
} from '@/types'

export const BIN_COUNT = 36

export function era(channel: CalibrationEra['channel'], from_date: string | null = null): CalibrationEra {
  return {
    key: `${channel}:${from_date ?? 'opening'}`,
    channel,
    from_date,
    until_date: null,
    opened_by: [],
  }
}

export function event(
  occurred_on: string,
  channels: CalibrationEvent['channels'],
  type: CalibrationEvent['type'] = 'other'
): CalibrationEvent {
  return {
    id: `event-${occurred_on}-${channels.join('')}`,
    artifact_id: 'artifact-1',
    kind: 'instrument_calibration',
    occurred_on,
    type,
    channels,
    note: 'something was done to the boat',
    created_by: 'admin-1',
    created_at: `${occurred_on}T02:00:00Z`,
    updated_at: `${occurred_on}T02:00:00Z`,
  }
}

/* --------------------------------------------------------------------------- HDG */

/** One Race's 36 bins, with a figure only where `at` names one. */
export function raceBins(at: Readonly<Record<number, { mean: number | null; rows: number }>>): HeadingBin[] {
  return Array.from({ length: BIN_COUNT }, (_, index) => {
    const given = at[index]
    return {
      bin_start_deg: index * 10,
      bin_center_deg: index * 10 + 5,
      row_count: given?.rows ?? 0,
      mean_error_deg: given?.mean ?? null,
    }
  })
}

export function raceHeading(
  race_id: string,
  window_start: string,
  bins: HeadingBin[],
  over: Partial<RaceHeadingOffset> = {}
): RaceHeadingOffset {
  const covered = bins.filter((bin) => bin.mean_error_deg !== null).length
  return {
    race_id,
    window_start,
    mean_offset_deg: 3.1,
    std_dev_deg: 2.2,
    max_abs_error_deg: 14,
    row_count: bins.reduce((total, bin) => total + bin.row_count, 0),
    headings_covered: covered,
    heading_coverage: covered / BIN_COUNT,
    bins,
    caveat: 'Measured through CTW, and CTW = HDG + leeway.',
    ...over,
  }
}

/** An Era's bins, each the mean of the Races that had a figure there. */
function eraBins(races: readonly RaceHeadingOffset[]): EraHeadingBin[] {
  return Array.from({ length: BIN_COUNT }, (_, index) => {
    const race_means = races.flatMap((race) => {
      const mean = race.bins[index].mean_error_deg
      return mean === null ? [] : [{ race_id: race.race_id, mean_error_deg: mean }]
    })

    return {
      bin_start_deg: index * 10,
      bin_center_deg: index * 10 + 5,
      mean_error_deg:
        race_means.length === 0
          ? null
          : race_means.reduce((total, at) => total + at.mean_error_deg, 0) / race_means.length,
      race_count: race_means.length,
      race_means,
    }
  })
}

export function headingEra(
  races: readonly RaceHeadingOffset[],
  over: Partial<EraHeadingOffset> = {}
): EraHeadingOffset {
  const bins = eraBins(races)
  const measured = bins.filter(
    (bin): bin is EraHeadingBin & { mean_error_deg: number } => bin.mean_error_deg !== null
  )
  const highest = measured.reduce<(EraHeadingBin & { mean_error_deg: number }) | null>(
    (found, bin) => (found === null || bin.mean_error_deg > found.mean_error_deg ? bin : found),
    null
  )
  const lowest = measured.reduce<(EraHeadingBin & { mean_error_deg: number }) | null>(
    (found, bin) => (found === null || bin.mean_error_deg < found.mean_error_deg ? bin : found),
    null
  )

  return {
    era: era('HDG'),
    bins,
    swing:
      highest === null || lowest === null
        ? null
        : { highest, lowest, swing_deg: highest.mean_error_deg - lowest.mean_error_deg },
    mean_of_bins_deg: measured.length === 0 ? null : 3.6,
    mean_of_races_deg: races.length === 0 ? null : 3.1,
    race_count: races.length,
    headings_covered: measured.length,
    headings_on_two_or_more_races: bins.filter((bin) => bin.race_count >= 2).length,
    heading_bin_count: BIN_COUNT,
    races: [...races],
    excluded: [],
    caveat: 'Measured through CTW, and CTW = HDG + leeway.',
    ...over,
  }
}

/* --------------------------------------------------------------------------- AWA */

function segment(tack: Tack, point_of_sail: PairedPointOfSail, held: number, at: string): TackSegment {
  return {
    tack,
    point_of_sail,
    start_time: at,
    end_time: at,
    row_indexes: [1, 2, 3],
    held_angle_deg: tack === 'port' ? -held : held,
  }
}

export function pair(
  point_of_sail: PairedPointOfSail,
  starboardHeld: number,
  portHeld: number,
  at = '2026-06-03 19:12:00'
): TackPair {
  return {
    point_of_sail,
    at,
    gap_seconds: 90,
    starboard: segment('starboard', point_of_sail, starboardHeld, at),
    port: segment('port', point_of_sail, portHeld, at),
    asymmetry_deg: (starboardHeld - portHeld) / 2,
  }
}

function raceFigure(point_of_sail: PairedPointOfSail, pairs: readonly TackPair[]): EraAsymmetryFigure | null {
  const its = pairs.filter((at) => at.point_of_sail === point_of_sail)
  if (its.length === 0) return null

  const mean = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0) / values.length
  const asymmetry_deg = mean(its.map((at) => at.asymmetry_deg))

  return {
    point_of_sail,
    asymmetry_deg,
    wider_tack: asymmetry_deg === 0 ? null : asymmetry_deg > 0 ? 'starboard' : 'port',
    wider_by_deg: Math.abs(asymmetry_deg) * 2,
    held_deg: {
      starboard: mean(its.map((at) => Math.abs(at.starboard.held_angle_deg))),
      port: mean(its.map((at) => Math.abs(at.port.held_angle_deg))),
    },
    pair_count: its.length,
    caveat: 'Not a Measured Offset: the recording’s AWA is qtVlm’s recomputation.',
    race_count: 1,
    race_figures: [],
  }
}

export function raceAsymmetry(
  race_id: string,
  window_start: string,
  pairs: readonly TackPair[]
): RaceAwaAsymmetry {
  return {
    race_id,
    window_start,
    upwind: raceFigure('upwind', pairs),
    downwind: raceFigure('downwind', pairs),
    pairs: [...pairs],
    caveat: 'Not a Measured Offset: the recording’s AWA is qtVlm’s recomputation.',
  }
}

export function asymmetryEra(
  races: readonly RaceAwaAsymmetry[],
  over: Partial<EraAwaAsymmetry> = {}
): EraAwaAsymmetry {
  const side = (point_of_sail: PairedPointOfSail): EraAsymmetryFigure | null => {
    const figures = races.flatMap((race) => (race[point_of_sail] === null ? [] : [race]))
    if (figures.length === 0) return null

    const mean = (pick: (race: RaceAwaAsymmetry) => number): number =>
      figures.reduce((total, race) => total + pick(race), 0) / figures.length
    const asymmetry_deg = mean((race) => race[point_of_sail]!.asymmetry_deg)

    return {
      point_of_sail,
      asymmetry_deg,
      wider_tack: asymmetry_deg === 0 ? null : asymmetry_deg > 0 ? 'starboard' : 'port',
      wider_by_deg: Math.abs(asymmetry_deg) * 2,
      held_deg: {
        starboard: mean((race) => race[point_of_sail]!.held_deg.starboard),
        port: mean((race) => race[point_of_sail]!.held_deg.port),
      },
      pair_count: figures.reduce((total, race) => total + race[point_of_sail]!.pair_count, 0),
      race_count: figures.length,
      race_figures: figures.map((race) => ({
        race_id: race.race_id,
        window_start: race.window_start,
        asymmetry_deg: race[point_of_sail]!.asymmetry_deg,
        held_deg: race[point_of_sail]!.held_deg,
        pair_count: race[point_of_sail]!.pair_count,
      })),
      caveat: 'Not a Measured Offset: the recording’s AWA is qtVlm’s recomputation.',
    }
  }

  return {
    era: era('AWA'),
    upwind: side('upwind'),
    downwind: side('downwind'),
    race_count: races.length,
    races: [...races],
    excluded: [],
    caveat: 'Not a Measured Offset: the recording’s AWA is qtVlm’s recomputation.',
    ...over,
  }
}

/* --------------------------------------------------------------------------- STW */

const NO_COVERAGE: EraDivergence['coverage'] = {
  rows: 0,
  countable: 0,
  points: 0,
  blank_stw: 0,
  blank_sog: 0,
  excluded_blank_stw: { frozen: 0, low_speed: 0, maneuver_window: 0 },
}

/** `count` rows climbing from 2 kt, each reading `gap` knots high on the GPS. */
export function speedPoints(count: number, gap: number): RaceDivergence['points'] {
  return Array.from({ length: count }, (_, index) => {
    const stw = 2 + (index / Math.max(1, count - 1)) * 6
    return { row_index: index + 1, stw, sog: stw + gap }
  })
}

export function raceDivergence(
  race_id: string,
  sailed_at: string,
  points: RaceDivergence['points'],
  over: Partial<RaceDivergence> = {}
): RaceDivergence {
  return {
    race_id,
    sailed_at,
    points,
    coverage: { ...NO_COVERAGE, rows: points.length, countable: points.length, points: points.length },
    sog_spread_knots: 6,
    measured_offset_knots: points.length === 0 ? null : 0.2,
    fit: {
      fitted: true,
      line: {
        method: 'orthogonal',
        ends: [
          { stw: 2, sog: 2.3 },
          { stw: 8, sog: 8.2 },
        ],
        r_squared: 0.92,
        points: points.length,
      },
    },
    ...over,
  }
}

export function speedEra(
  races: readonly RaceDivergence[],
  over: Partial<EraDivergence> = {}
): EraDivergence {
  return {
    era: era('STW'),
    races: [...races],
    coverage: races.reduce(
      (total, race) => ({
        ...total,
        rows: total.rows + race.coverage.rows,
        countable: total.countable + race.coverage.countable,
        points: total.points + race.coverage.points,
      }),
      NO_COVERAGE
    ),
    measured_offset_knots: 0.21,
    fit: {
      fitted: true,
      line: {
        method: 'orthogonal',
        ends: [
          { stw: 2, sog: 2.3 },
          { stw: 9, sog: 9.1 },
        ],
        r_squared: 0.9,
        points: races.reduce((total, race) => total + race.points.length, 0),
      },
    },
    gap_by_speed: [
      { band: 2, mean_gap_knots: 0.45, rows: 120, races: races.length },
      { band: 4, mean_gap_knots: 0.02, rows: 300, races: races.length },
      { band: 8, mean_gap_knots: 0.4, rows: 90, races: races.length },
    ],
    races_with_points: races.filter((race) => race.points.length > 0).length,
    races_with_a_line: races.filter((race) => race.fit.fitted).length,
    ...over,
  }
}

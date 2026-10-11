/**
 * **Apparent Wind Asymmetry**: how much wider one tack reads than the other, at a matched point of
 * sail, over **Tack Pairs**.
 *
 * The arithmetic is the masthead unit's own factory procedure, automated — "calculate the average of
 * the values displayed on starboard tack and those displayed on port tack ... (average starboard
 * angle − average port angle) / 2" (nke Aluwind HR user guide, pp. 6–7, §2.1) — and a port of the
 * prior art's `awa_offset.py` over **Countable** rows.
 *
 * **It is not a Measured Offset, and nothing here may label it one.** That term names a residual
 * isolated to one **Calibration Channel**, and this one cannot be: the recording's apparent wind is
 * qtVlm's own recomputation from `TWS`, `TWA` and `STW` rather than the masthead's reading, and
 * `TWA` is downstream of `CTW`. An asymmetry here may be the vane, may be `HDG` deviation leaking
 * through, and may be an error in qtVlm's leeway/true-wind model — three causes this column cannot
 * separate. See `ASYMMETRY_CAVEAT`.
 *
 * **Upwind and downwind are reported separately and never averaged together.** On this archive they
 * lean opposite ways — port reads wider upwind, starboard wider downwind — so their mean sits near
 * zero and states the opposite of the finding. A vane rotated on the mast would lean the same way
 * on both, which is exactly why the comparison is worth keeping and the average is not (ADR 0035).
 */

import { awaToSigned } from '@/services/analysis/angles'
import { byEra, dayOf } from '@/services/analysis/calibration-eras'
import { aboveSpeedGate, channelValue } from '@/services/analysis/readable-rows'
import { meanOfSome } from '@/services/analysis/statistics'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  AsymmetryFigure,
  CalibrationEra,
  EraAsymmetryFigure,
  EraAwaAsymmetry,
  PairedPointOfSail,
  RaceAwaAsymmetry,
  RaceAwaAsymmetryResult,
  RowQuality,
  Tack,
  TackPair,
  TackSegment,
} from '@/types'

/** `|AWA|` strictly under this is upwind. */
export const UPWIND_MAX_AWA_DEG = 50

/** `|AWA|` strictly over this is downwind. Between the two, inclusive, is reaching. */
export const DOWNWIND_MIN_AWA_DEG = 110

/**
 * Rows a segment needs before the angle it held is a figure.
 *
 * A row count and not a duration, inherited from the prior art with a known blind spot: ten of the
 * archive's eleven measured files sample every ~30s and one every ~74s, so three rows is anywhere
 * from 90 to 225 seconds of held heading depending which Race it is applied to. Named here so the
 * limitation is inherited knowingly; a duration-based minimum is a later question.
 */
export const MIN_SEGMENT_ROWS = 3

/** How far apart two segments may sit and still be one Tack Pair, in seconds. */
export const MAX_PAIR_GAP_SECONDS = 300

/** What must be said wherever this figure is. */
export const ASYMMETRY_CAVEAT =
  'Computed from the recording’s apparent wind, which is qtVlm’s recomputation from `TWS`, `TWA` ' +
  'and `STW` rather than the masthead’s own reading — and `TWA` depends on `CTW`. The asymmetry ' +
  'may be the vane, `HDG` deviation, or qtVlm’s leeway/true-wind model; this column cannot ' +
  'separate the three, which is why it is not a Measured Offset and names no channel to adjust.'

/** The fields this check reads. An `ReadableRow` satisfies it. */
export interface AsymmetryReadableRow {
  row_index: number
  row_time: string
  /** Not **Frozen**, not **Low-Speed**, not in a **Maneuver Window** (ADR 0025). */
  countable: boolean
  /**
   * Read for **Not Water-Referenced** alone — `STW` or `CTW` absent, so the apparent wind this
   * check reads was computed from GPS and means something different from its neighbours'.
   */
  quality: Pick<RowQuality, 'not_water_referenced'>
  /** `AWA (calc)` as text, exactly as the file wrote it. Degrees, unsigned, 0..360. */
  awa_calc: string | null
  sog: string | null
}

/** One Race, as this check reads it. */
export interface AsymmetryReadableRace {
  race_id: string
  /** The **Race Window**'s start: what orders Races and what assigns each to a **Calibration Era**. */
  window_start: string
  /** The rows inside the Race Window, in row order, Countable or not. */
  rows: readonly AsymmetryReadableRow[]
}

/** A row this check can read, classified. */
interface ClassifiedRow {
  row_index: number
  row_time: string
  awa_signed_deg: number
  tack: Tack
  /** `reaching` is read and then never paired — it is here so a run can break on it. */
  point_of_sail: PairedPointOfSail | 'reaching'
}

/**
 * The rows the check may read, each with its tack and point of sail.
 *
 * Four gates. **Countable** (ADR 0025) and this analysis's own `SOG_MIN_KNOTS` are the two every
 * Instrument Tuning check applies; `AWA (calc)` must be present; and **Not Water-Referenced** is
 * excluded here specifically, which Countable deliberately does not do. That last one is a
 * correctness fix the prior art never had rather than an optional extra: where `STW` is blank qtVlm
 * evidently substituted something for it — `AWA (calc)` is non-empty in 4,283 rows of the measured
 * archive against `STW`'s 4,047 — so on those rows the only column this check reads is a figure
 * computed from a value nothing recorded. Countable stays the uniform rule; this is one check
 * refusing rows whose own input is fabricated, the same way it refuses a null one.
 */
function classify(rows: readonly AsymmetryReadableRow[]): ClassifiedRow[] {
  const classified: ClassifiedRow[] = []

  for (const row of rows) {
    if (!row.countable || row.quality.not_water_referenced || !aboveSpeedGate(row)) continue

    const unsigned = channelValue(row.awa_calc)
    if (unsigned === null) continue

    const awa_signed_deg = awaToSigned(unsigned)
    const magnitude = Math.abs(awa_signed_deg)

    classified.push({
      row_index: row.row_index,
      row_time: row.row_time,
      awa_signed_deg,
      // Zero folds to starboard, as it does everywhere this archive is read.
      tack: awa_signed_deg >= 0 ? 'starboard' : 'port',
      point_of_sail:
        // Strict both ways, so 50° and 110° are both reaching and so never paired. The band
        // between them is where a held angle says least about where the wind actually is.
        magnitude < UPWIND_MAX_AWA_DEG
          ? 'upwind'
          : magnitude > DOWNWIND_MIN_AWA_DEG
            ? 'downwind'
            : 'reaching',
    })
  }

  return classified
}

/**
 * Every steady segment: a run of consecutive readable rows on one tack at one point of sail.
 *
 * Consecutive among the rows this check may read, not among the recording's rows — the prior art
 * filters first and groups after, and so does this. The consequence is deliberate: a dropout or a
 * tack's own excluded rows in the middle of a long starboard beat leave one segment rather than
 * two, and the pairing step's own gap test is what refuses a pair spanning a dead feed.
 *
 * Reaching runs are found and discarded, so that a beat interrupted by a reach is two segments.
 */
export function findTackSegments(rows: readonly AsymmetryReadableRow[]): TackSegment[] {
  return segmentsOf(classify(rows))
}

/** The same search, over rows already classified — so a caller holding them classifies once. */
function segmentsOf(classified: readonly ClassifiedRow[]): TackSegment[] {
  const segments: TackSegment[] = []

  const sameRun = (a: ClassifiedRow, b: ClassifiedRow): boolean =>
    a.tack === b.tack && a.point_of_sail === b.point_of_sail

  let runStart = 0
  for (let index = 1; index <= classified.length; index += 1) {
    if (index < classified.length && sameRun(classified[index], classified[runStart])) continue

    const run = classified.slice(runStart, index)
    const held = run[0]
    runStart = index

    if (run.length < MIN_SEGMENT_ROWS || held.point_of_sail === 'reaching') continue

    segments.push({
      tack: held.tack,
      point_of_sail: held.point_of_sail,
      start_time: run[0].row_time,
      end_time: run[run.length - 1].row_time,
      row_indexes: run.map((row) => row.row_index),
      held_angle_deg: meanOfSome(run.map((row) => row.awa_signed_deg)),
    })
  }

  return segments
}

/** Half the difference between the two tacks' held angles. Positive means starboard reads wider. */
function asymmetryOf(starboard: TackSegment, port: TackSegment): number {
  // The vendor procedure's `(starboard − port) / 2`, in the signed convention: port's held angle is
  // negative, so adding the two subtracts its magnitude.
  return (starboard.held_angle_deg + port.held_angle_deg) / 2
}

/**
 * The Tack Pairs among segments already in time order.
 *
 * Greedy and forward-only, as the prior art is: each unused segment takes the first later unused
 * segment at its own point of sail on the opposite tack, and the search for a partner stops at the
 * first segment more than `MAX_PAIR_GAP_SECONDS` past it. Stopping rather than skipping on is what
 * keeps a pair from spanning an hour of reaching or a dead feed, and it relies on the ordering
 * `findTackSegments` produces — so nothing may re-sort segments by anything else in between.
 */
export function findTackPairs(segments: readonly TackSegment[]): TackPair[] {
  const pairs: TackPair[] = []
  const used = new Set<number>()

  for (let i = 0; i < segments.length; i += 1) {
    if (used.has(i)) continue
    const first = segments[i]

    for (let j = i + 1; j < segments.length; j += 1) {
      if (used.has(j)) continue
      const second = segments[j]

      if (first.point_of_sail !== second.point_of_sail) continue
      if (first.tack === second.tack) continue

      const gap_seconds = wallClockSeconds(second.start_time) - wallClockSeconds(first.end_time)
      // Negative means the second segment began before the first ended, which non-overlapping runs
      // in time order cannot produce. Kept as a refusal rather than an assertion: it would mean an
      // ordering bug upstream, and pairing overlapping segments would hide it behind a figure.
      if (gap_seconds < 0) continue
      if (gap_seconds > MAX_PAIR_GAP_SECONDS) break

      const [starboard, port] = first.tack === 'starboard' ? [first, second] : [second, first]
      pairs.push({
        point_of_sail: first.point_of_sail,
        at: first.start_time,
        gap_seconds,
        starboard,
        port,
        asymmetry_deg: asymmetryOf(starboard, port),
      })
      used.add(i)
      used.add(j)
      break
    }
  }

  return pairs
}

/**
 * Which tack reads wider, and by how much — which is twice the Asymmetry (ADR 0035).
 *
 * Twice, because the Asymmetry is half the difference between the two held angles: a `+5°`
 * Asymmetry is starboard holding ten degrees wider than port, and printing the 5 as the gap between
 * the tacks would halve the finding.
 */
function leaning(asymmetry_deg: number): Pick<AsymmetryFigure, 'wider_tack' | 'wider_by_deg'> {
  return {
    wider_tack: asymmetry_deg === 0 ? null : asymmetry_deg > 0 ? 'starboard' : 'port',
    wider_by_deg: Math.abs(asymmetry_deg) * 2,
  }
}

/**
 * The angle each tack held, as magnitudes, averaged over whatever was handed in.
 *
 * Magnitudes rather than the signed convention the arithmetic uses, because this is what the **Tack
 * Dial** draws: the dial is a picture of how wide each tack sailed, starboard right and port left,
 * and a negative port angle would put port's ray on starboard's side of the boat.
 *
 * Carried rather than left to the chart to reconstruct. `asymmetry_deg` alone fixes the *gap*
 * between the two rays and says nothing about where either sits, so a dial drawn from it would have
 * to invent a centre angle the boat never held — a correct number over a fabricated picture.
 */
function heldAngles(
  starboard: readonly number[],
  port: readonly number[]
): AsymmetryFigure['held_deg'] {
  return { starboard: meanOfSome(starboard), port: meanOfSome(port) }
}

/** One point of sail's figure over the Tack Pairs that measured it. */
function figure(point_of_sail: PairedPointOfSail, pairs: readonly TackPair[]): AsymmetryFigure {
  const asymmetry_deg = meanOfSome(pairs.map((pair) => pair.asymmetry_deg))

  return {
    point_of_sail,
    asymmetry_deg,
    ...leaning(asymmetry_deg),
    held_deg: heldAngles(
      pairs.map((pair) => Math.abs(pair.starboard.held_angle_deg)),
      pairs.map((pair) => Math.abs(pair.port.held_angle_deg))
    ),
    pair_count: pairs.length,
    caveat: ASYMMETRY_CAVEAT,
  }
}

/**
 * One Race's Apparent Wind Asymmetry, upwind and downwind, or why it has none.
 *
 * The three refusals are the prior art's own, kept as data: too few readable rows to hold two
 * segments, too few segments to pair, or segments that never paired. A Race that produced only
 * upwind pairs is not a refusal — it returns an upwind figure and a null downwind one, because one
 * point of sail measured is a real finding and the other's absence is not a zero.
 */
export function raceAwaAsymmetry(race: AsymmetryReadableRace): RaceAwaAsymmetryResult {
  const { race_id, window_start } = race
  const readable = classify(race.rows)

  if (readable.length < MIN_SEGMENT_ROWS * 2) {
    return { ok: false, race_id, window_start, reason: 'too-few-rows', row_count: readable.length }
  }

  const segments = segmentsOf(readable)
  if (segments.length < 2) {
    return {
      ok: false,
      race_id,
      window_start,
      reason: 'too-few-segments',
      segment_count: segments.length,
    }
  }

  const pairs = findTackPairs(segments)
  if (pairs.length === 0) {
    return { ok: false, race_id, window_start, reason: 'no-pairs', segment_count: segments.length }
  }

  const side = (point_of_sail: PairedPointOfSail): AsymmetryFigure | null => {
    const its = pairs.filter((pair) => pair.point_of_sail === point_of_sail)
    return its.length === 0 ? null : figure(point_of_sail, its)
  }

  return {
    ok: true,
    race_id,
    window_start,
    asymmetry: {
      race_id,
      window_start,
      upwind: side('upwind'),
      downwind: side('downwind'),
      pairs,
      caveat: ASYMMETRY_CAVEAT,
    },
  }
}

/** One point of sail across an Era: each Race's own figure averaged, never its pairs pooled. */
function eraFigure(
  point_of_sail: PairedPointOfSail,
  races: readonly RaceAwaAsymmetry[]
): EraAsymmetryFigure | null {
  const race_figures = races.flatMap((race) => {
    const its = race[point_of_sail]
    return its === null
      ? []
      : [
          {
            race_id: race.race_id,
            window_start: race.window_start,
            asymmetry_deg: its.asymmetry_deg,
            held_deg: its.held_deg,
            pair_count: its.pair_count,
          },
        ]
  })

  if (race_figures.length === 0) return null

  const asymmetry_deg = meanOfSome(race_figures.map((race) => race.asymmetry_deg))

  return {
    point_of_sail,
    asymmetry_deg,
    ...leaning(asymmetry_deg),
    // Each Race's own held angles averaged, not its pairs pooled — the same weighting the figure
    // above it uses, so the two rays the dial draws and the number it labels them with stay one
    // statement. Pooling here would move a ray off the figure beside it.
    held_deg: heldAngles(
      race_figures.map((race) => race.held_deg.starboard),
      race_figures.map((race) => race.held_deg.port)
    ),
    pair_count: race_figures.reduce((total, race) => total + race.pair_count, 0),
    race_count: race_figures.length,
    race_figures,
    caveat: ASYMMETRY_CAVEAT,
  }
}

/**
 * One Era's Asymmetry, upwind and downwind, each over the Races that measured it.
 *
 * A Race first, then the Era: every Race's own figure is a mean of its own pairs, and the Era is a
 * mean of those, so a long Race with sixteen pairs buys no more say than a short one with two. Each
 * side also carries its total pair count, because how far either figure can be leaned on is a
 * question about pairs and the two sides rarely have comparable numbers of them.
 *
 * Races that produced nothing are carried through as `excluded` with their reason, never averaged
 * in at zero. There is deliberately no figure spanning the two points of sail.
 */
export function eraAwaAsymmetry(
  era: CalibrationEra,
  results: readonly RaceAwaAsymmetryResult[]
): EraAwaAsymmetry {
  const inOrder = [...results].sort((a, b) => a.window_start.localeCompare(b.window_start))
  const races = inOrder.flatMap((result) => (result.ok ? [result.asymmetry] : []))

  return {
    era,
    upwind: eraFigure('upwind', races),
    downwind: eraFigure('downwind', races),
    race_count: races.length,
    races,
    excluded: inOrder.flatMap((result) => (result.ok ? [] : [result])),
    caveat: ASYMMETRY_CAVEAT,
  }
}

/**
 * Every Era that holds a Race, with that Era's Asymmetry.
 *
 * `HDG`'s Eras are a defensible partition for this figure as well as for the compass's own, since
 * an autocompensation plausibly moves this number too — the whole reason the two are read on one
 * screen. Which channel's Eras to pass is the caller's choice, and the Era returned says which.
 */
export function awaAsymmetryByEra(
  eras: readonly CalibrationEra[],
  results: readonly RaceAwaAsymmetryResult[]
): EraAwaAsymmetry[] {
  return byEra(eras, results, (result) => dayOf(result.window_start)).map(({ era, items }) =>
    eraAwaAsymmetry(era, items)
  )
}

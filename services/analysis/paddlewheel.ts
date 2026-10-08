/**
 * The paddlewheel against GPS: `SOG` read on recorded `STW`, per **Calibration Era**.
 *
 * What it reports is a **Measured Offset for `STW`, via `SOG`** — a gap in knots, with an `R²`
 * beside it and a line drawn for its shape. What it never reports is a `(multiplier, offset)` pair
 * to type into a new Instrument Calibration Version: Instrument Tuning is diagnostic, the
 * correction happens on the boat first, and this module publishes the fitted line as the two ends
 * of a drawn segment for exactly that reason (ADR 0027, ADR 0034, LAY-138 decision 7).
 *
 * Three things about it are load-bearing and easy to undo by accident.
 *
 * **`STW` is fitted as stored.** The paddlewheel's own multiplier and Programmed Offset were
 * applied before the figure was ever written, so there is no raw reading to recover and inverting
 * the current correction would manufacture a value nothing recorded (ADR 0008). One consequence
 * carries the whole chart: **the current configuration is the 1:1 line**, so a gap from the
 * diagonal is the finding, with no separate reference line to compute.
 *
 * **The slope depends on the method and the knot gap does not.** Least squares on one variable is
 * biased flat by noise in the other, and here both channels are measurements: on the real archive
 * one population gives 0.94 regressing `SOG` on `STW`, 0.98 orthogonally and 1.02 the other way
 * round. So the line is fitted orthogonally by default with the method named beside it, `R²` is
 * identical under all three, and the Measured Offset is the weighted mean of `SOG − STW`, which
 * reads no fit at all (ADR 0034).
 *
 * **A blank `STW` is not a zero.** A row the paddlewheel said nothing on has no x-value, so it
 * cannot be a point — a mechanical consequence of what is being compared, not a filtering choice.
 * Those rows are counted and reported instead, never dropped and never plotted at the origin.
 */

import { calibrationEras, withinEra } from '@/services/analysis/calibration-eras'
import { notCountableReason } from '@/services/analysis/countable'
import type { AnalysisRow, CalibrationEra, CalibrationLogEntry, TranscriptionChannels } from '@/types'

/**
 * Rows a fit needs before it may draw a line.
 *
 * ADR 0027 takes this from the compass check's own `MIN_VALID_POINTS`, which LAY-145 names and has
 * not yet been ported; when that module lands the two belong in one place rather than two. Spelled
 * without `Valid`, which is on **Countable**'s own `Avoid` list (CONTEXT.md): the rows reaching
 * this gate are already Countable, and the gate asks a narrower question than that word would.
 */
export const MIN_FIT_POINTS = 5

/**
 * Knots of `SOG` a population must span before a line through it points anywhere.
 *
 * A starting value, not strongly defended (ADR 0027) — to be revisited against real per-Race
 * ranges once the archive is larger.
 */
export const MIN_SOG_SPREAD_KNOTS = 3

/** Which way the line was fitted, since the slope depends on it and the gap does not. */
export type FitMethod =
  /** Both channels treated as noisy. The default, and the only one that assumes neither is truth. */
  | 'orthogonal'
  /** ADR 0027's own regression, and the method the screen's toggle offers against orthogonal. */
  | 'sog-on-stw'
  /**
   * `STW` regressed on `SOG` and inverted. Not offered by the screen's toggle (ADR 0034) and kept
   * because the three-way spread between the methods is the evidence for printing no coefficient:
   * reproducing it in a test would otherwise mean a second copy of this arithmetic.
   */
  | 'stw-on-sog'

/** A point on the scatter: the two speeds of one row, as recorded. */
export interface SpeedPoint {
  row_index: number
  stw: number
  sog: number
}

/** One end of the drawn line. No `row_index`: the line passes through no row in particular. */
export interface LinePoint {
  stw: number
  sog: number
}

/**
 * The fitted line, as a shape.
 *
 * Two ends of a segment over the `STW` range the fit read, because that is what a chart draws and
 * because a slope and an intercept are a drafted correction however they are labelled. Its `R²`
 * rides along as the confidence figure, and is the same under every method.
 */
export interface FittedLine {
  method: FitMethod
  /** Ascending in `STW`: the fit over the range it was fitted on, never wider. */
  ends: [LinePoint, LinePoint]
  r_squared: number
  /** Rows the fit read. */
  points: number
}

/** Why a population carries no line of its own. Data, not an absence (ADR 0032). */
export type NoFitReason =
  /** No Countable row carried both speeds. */
  | 'no-points'
  /** Fewer than `MIN_FIT_POINTS`. */
  | 'too-few-points'
  /** Less than `MIN_SOG_SPREAD_KNOTS` of `SOG` between the slowest row and the fastest. */
  | 'narrow-spread'
  /** The two channels never varied together, so no line through them is defined. */
  | 'flat'

/** A line, or the reason there is none — never a line computed anyway and flagged afterwards. */
export type FitOutcome =
  | { fitted: true; line: FittedLine }
  | { fitted: false; reason: NoFitReason }

/**
 * What a population's rows could and could not be read as.
 *
 * Every count is over the rows handed in, so "the paddlewheel had no reading for X% of this
 * population" is a question this answers about whichever population was asked (ADR 0034).
 */
export interface BlankStwCoverage {
  /** Rows given, Countable or not. */
  rows: number
  countable: number
  /** Countable rows carrying both speeds: the rows the scatter draws and the fit reads. */
  points: number
  /**
   * Countable rows the paddlewheel said nothing on — the stat the screen states as "the
   * paddlewheel had no reading for X% of this population", and never a point at zero.
   *
   * Read before `blank_sog`, so a row both channels went quiet on is counted here: this is the
   * published figure, and a row with no `STW` belongs in it however the GPS behaved.
   */
  blank_stw: number
  /** Countable rows with an `STW` and no `SOG`, which have no y-value. So the rows add up. */
  blank_sog: number
  /**
   * Rows with no `STW` that were not Countable, by the first of ADR 0025's three reasons to hold —
   * which is where the archive's own blank rows went: Frozen, or the boat stopped moving.
   */
  excluded_blank_stw: {
    frozen: number
    low_speed: number
    maneuver_window: number
  }
}

/**
 * A row as this check reads it: the Countable verdict beside the two speeds, as recorded.
 *
 * `AnalysisRow` and nothing less, because the coverage stat has to say which of ADR 0025's three
 * exclusions took each blank row, and recomputing that outside this module would put the rule in
 * two places. The port stays here rather than in `/types` — it is what this module asks a caller
 * for, not a shape two features name.
 */
export interface SpeedPairRow extends AnalysisRow, Pick<TranscriptionChannels, 'sog' | 'stw'> {}

/** One Race's rows, with where it sits on the Calibration Log's timeline. */
export interface PaddlewheelRace {
  race_id: string
  /**
   * When it was sailed, in the **Recording**'s own frame — the **Race Window** start, or its
   * calendar date. Either places the Race in an Era; neither is ever a `Date`.
   */
  sailed_at: string
  /**
   * Every row inside the Race Window, Countable or not. Assess Row Quality and Maneuvers over the
   * whole Transcription and clip afterwards, in that order (ADR 0009): the not-Countable rows are
   * what the coverage stat is made of, so handing over only the Countable ones loses it.
   */
  rows: readonly SpeedPairRow[]
}

/** One Race's divergence: its scatter, its coverage, and its line or the reason for none. */
export interface RaceDivergence {
  race_id: string
  sailed_at: string
  /** Every Countable row carrying both speeds, in row order. */
  points: SpeedPoint[]
  coverage: BlankStwCoverage
  /** Knots of `SOG` the points span, which is what the spread gate reads. Null with no points. */
  sog_spread_knots: number | null
  /** The **Measured Offset for `STW`, via `SOG`**: the mean of `SOG − STW`. Null with no points. */
  measured_offset_knots: number | null
  fit: FitOutcome
}

/** The mean gap from 1:1 over one knot of speed, every Race weighted equally (ADR 0034). */
export interface SpeedBandGap {
  /** The band's lower bound in knots; it holds `[band, band + 1)`. */
  band: number
  mean_gap_knots: number
  rows: number
  races: number
}

/** Which recorded channel the speed bands are cut on, since the figure moves with the choice. */
export type BandAxis = 'stw' | 'sog'

/** One **Calibration Era** of `STW`, with every Race in it and the Era's own pooled figures. */
export interface EraDivergence {
  era: CalibrationEra
  /** The Races sailed in it, oldest first. Empty is a legitimate answer. */
  races: RaceDivergence[]
  /** Every Race's rows, added up. */
  coverage: BlankStwCoverage
  /**
   * The Era's **Measured Offset for `STW`, via `SOG`**, with each Race weighted
   * `1 / (its Countable row count)` so no Race buys influence with duration.
   */
  measured_offset_knots: number | null
  fit: FitOutcome
  /** The U the rows make around the line, banded by recorded `STW`. */
  gap_by_speed: SpeedBandGap[]
  /** Races with at least one point. */
  races_with_points: number
  /**
   * Races clearing both gates on their own. ADR 0034 reads the `STW` coverage verdict off the
   * share of these; the word itself is the card's, and belongs with the other two channels' own.
   */
  races_with_a_line: number
}

/**
 * A recorded figure as a coordinate, or absent.
 *
 * Three ways to be absent and all of them read as absent: the channel said nothing, it wrote an
 * empty cell — which `Number` reads as zero, and a zero here would be a point at the origin on a
 * row where nothing was measured — or it wrote something that is not a number at all. The last
 * cannot reach this from a Transcription, the parser having refused any file whose figures
 * Postgres `numeric` would hand back changed; where it somehow does, it is counted as a blank
 * rather than plotted. `NaN` never leaves this function.
 */
function recorded(value: string | null): number | null {
  if (value === null || value.trim() === '') return null

  const figure = Number(value)
  return Number.isFinite(figure) ? figure : null
}

/**
 * The rows a fit reads and what each one is worth, which always travel together.
 *
 * Parallel arrays rather than a weight per point, because a Race's rows are weighted by a fact
 * about the Race and not about the row (`1 / its Countable row count`), and writing that onto each
 * point would invite reading it as the row's own.
 */
interface WeightedPoints {
  points: readonly SpeedPoint[]
  weights: readonly number[]
}

/** Total weight, or zero. The one guard every figure below needs before it divides. */
function totalWeight({ weights }: WeightedPoints): number {
  return weights.reduce((sum, weight) => sum + weight, 0)
}

/** Weighted first and second moments of the points, or null where there is nothing to weigh. */
function moments(
  population: WeightedPoints
): { mx: number; my: number; sxx: number; syy: number; sxy: number } | null {
  const total = totalWeight(population)
  if (total <= 0) return null

  const { points, weights } = population
  let mx = 0
  let my = 0
  for (const [at, point] of points.entries()) {
    mx += weights[at] * point.stw
    my += weights[at] * point.sog
  }
  mx /= total
  my /= total

  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [at, point] of points.entries()) {
    const dx = point.stw - mx
    const dy = point.sog - my
    sxx += weights[at] * dx * dx
    syy += weights[at] * dy * dy
    sxy += weights[at] * dx * dy
  }

  return { mx, my, sxx, syy, sxy }
}

/**
 * The line, by the method asked for, as the two ends of the segment over the points' `STW` range.
 *
 * Each method answers a different question about which channel is trusted: `sog-on-stw` minimises
 * error in `SOG` alone, `stw-on-sog` minimises it in `STW` alone, and the orthogonal fit minimises
 * the perpendicular distance, which is the only one of the three that treats both as noisy. The
 * slope and intercept are computed here and go no further — what comes back is a shape.
 */
function fitLine(population: WeightedPoints, method: FitMethod): FittedLine | null {
  const { points } = population
  const found = moments(population)
  if (found === null) return null

  const { mx, my, sxx, syy, sxy } = found
  // A channel that never moved, or two that never moved together: no line is defined through
  // either, and a least-squares formula would divide by zero or answer flat with no evidence.
  if (sxx === 0 || syy === 0 || sxy === 0) return null

  const slope =
    method === 'sog-on-stw'
      ? sxy / sxx
      : method === 'stw-on-sog'
        ? syy / sxy
        : (syy - sxx + Math.sqrt((syy - sxx) ** 2 + 4 * sxy * sxy)) / (2 * sxy)
  const intercept = my - slope * mx

  const lo = Math.min(...points.map((point) => point.stw))
  const hi = Math.max(...points.map((point) => point.stw))

  return {
    method,
    ends: [
      { stw: lo, sog: intercept + slope * lo },
      { stw: hi, sog: intercept + slope * hi },
    ],
    // Identical under every method, which is why it is the figure reported beside the gap.
    r_squared: (sxy * sxy) / (sxx * syy),
    points: points.length,
  }
}

/** The line, or which gate stopped it. The gates are read in the order a population fails them. */
function fitWithGates(population: WeightedPoints, method: FitMethod): FitOutcome {
  const { points } = population
  if (points.length === 0) return { fitted: false, reason: 'no-points' }
  if (points.length < MIN_FIT_POINTS) return { fitted: false, reason: 'too-few-points' }

  const spread = sogSpread(points)
  if (spread === null || spread < MIN_SOG_SPREAD_KNOTS) {
    return { fitted: false, reason: 'narrow-spread' }
  }

  const line = fitLine(population, method)
  return line === null ? { fitted: false, reason: 'flat' } : { fitted: true, line }
}

/** The weighted mean of `SOG − STW`: the gap from 1:1, reading no fit at all. */
function knotGap(population: WeightedPoints): number | null {
  const total = totalWeight(population)
  if (total <= 0) return null

  const { points, weights } = population
  let gap = 0
  for (const [at, point] of points.entries()) gap += weights[at] * (point.sog - point.stw)
  return gap / total
}

/** Knots of `SOG` between the slowest point and the fastest, or null with no points. */
function sogSpread(points: readonly SpeedPoint[]): number | null {
  if (points.length === 0) return null

  const speeds = points.map((point) => point.sog)
  return Math.max(...speeds) - Math.min(...speeds)
}

/** Nothing read yet, over this many rows. The shape every tally below starts from. */
function noCoverage(rows: number): BlankStwCoverage {
  return {
    rows,
    countable: 0,
    points: 0,
    blank_stw: 0,
    blank_sog: 0,
    excluded_blank_stw: { frozen: 0, low_speed: 0, maneuver_window: 0 },
  }
}

/** Every Countable row that can be a point, and the count of every row that cannot. */
function readRows(rows: readonly SpeedPairRow[]): {
  points: SpeedPoint[]
  coverage: BlankStwCoverage
} {
  const points: SpeedPoint[] = []
  const coverage = noCoverage(rows.length)

  for (const row of rows) {
    const stw = recorded(row.stw)
    const sog = recorded(row.sog)

    if (!row.countable) {
      const reason = notCountableReason(row)
      if (stw === null && reason !== null) coverage.excluded_blank_stw[reason] += 1
      continue
    }

    coverage.countable += 1
    if (stw === null) {
      coverage.blank_stw += 1
      continue
    }
    if (sog === null) {
      coverage.blank_sog += 1
      continue
    }

    coverage.points += 1
    points.push({ row_index: row.row_index, stw, sog })
  }

  return { points, coverage }
}

/**
 * One Race, read as a scatter with a line through it where it can carry one.
 *
 * Always returns its points: a Race is real data regardless of what it can support, and a calm
 * evening that never spanned three knots still shows where it sat (ADR 0027).
 */
export function raceDivergence(
  race: PaddlewheelRace,
  method: FitMethod = 'orthogonal'
): RaceDivergence {
  const { points, coverage } = readRows(race.rows)
  const population: WeightedPoints = { points, weights: points.map(() => 1) }

  return {
    race_id: race.race_id,
    sailed_at: race.sailed_at,
    points,
    coverage,
    sog_spread_knots: sogSpread(points),
    measured_offset_knots: knotGap(population),
    fit: fitWithGates(population, method),
  }
}

/** The gap the drawn line shows at one speed, or null where the line does not reach it. */
export function lineGapAt(line: FittedLine, stw: number): number | null {
  const [from, to] = line.ends
  if (stw < from.stw || stw > to.stw) return null

  const along = (stw - from.stw) / (to.stw - from.stw)
  return from.sog + along * (to.sog - from.sog) - stw
}

/**
 * The mean gap from 1:1 per knot of speed, every Race weighted equally.
 *
 * Each Race's own mean in a band first, then the mean of those — so three rows of a long Race and
 * one row of a short one have the same say in the band they share (ADR 0034). Which channel the
 * bands are cut on moves the figure at the top end, so the axis is stated rather than assumed.
 */
export function gapBySpeedBand(
  races: readonly RaceDivergence[],
  axis: BandAxis = 'stw'
): SpeedBandGap[] {
  const bands = new Map<number, { means: number[]; rows: number }>()

  for (const race of races) {
    const perBand = new Map<number, number[]>()
    for (const point of race.points) {
      const band = Math.floor(axis === 'stw' ? point.stw : point.sog)
      const gaps = perBand.get(band) ?? []
      gaps.push(point.sog - point.stw)
      perBand.set(band, gaps)
    }

    for (const [band, gaps] of perBand) {
      const held = bands.get(band) ?? { means: [], rows: 0 }
      held.means.push(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length)
      held.rows += gaps.length
      bands.set(band, held)
    }
  }

  return [...bands.entries()]
    .sort(([left], [right]) => left - right)
    .map(([band, { means, rows }]) => ({
      band,
      mean_gap_knots: means.reduce((sum, mean) => sum + mean, 0) / means.length,
      rows,
      races: means.length,
    }))
}

/** Oldest first, which is the order a season reads in. Ties keep the order they arrived in. */
function bySailedAt(left: PaddlewheelRace, right: PaddlewheelRace): number {
  if (left.sailed_at === right.sailed_at) return 0
  return left.sailed_at < right.sailed_at ? -1 : 1
}

/** Two coverage tallies added, which is what an Era's own is made of. */
function addCoverage(into: BlankStwCoverage, from: BlankStwCoverage): BlankStwCoverage {
  return {
    rows: into.rows + from.rows,
    countable: into.countable + from.countable,
    points: into.points + from.points,
    blank_stw: into.blank_stw + from.blank_stw,
    blank_sog: into.blank_sog + from.blank_sog,
    excluded_blank_stw: {
      frozen: into.excluded_blank_stw.frozen + from.excluded_blank_stw.frozen,
      low_speed: into.excluded_blank_stw.low_speed + from.excluded_blank_stw.low_speed,
      maneuver_window:
        into.excluded_blank_stw.maneuver_window + from.excluded_blank_stw.maneuver_window,
    },
  }
}

/**
 * One Era's pooled fit, over the Races sailed in it.
 *
 * Every Countable row of every Race enters it, each weighted `1 / (its Race's Countable row
 * count)` — not row-count-weighted pooling, because rows inside one Race are a slowly-varying
 * process sampled every half minute rather than independent draws, so unweighted pooling would
 * let one long or fouled Race decide the Era in proportion to its duration (ADR 0027).
 *
 * The weight is one over the Countable row count and not one over the rows the fit reads, so a
 * Race whose paddlewheel went quiet for half the race carries half the say — which is the honest
 * consequence of a blank `STW` not being a point. On the archive measured, every Countable row
 * carries an `STW` and the two are the same number.
 *
 * ADR 0027 excludes "an Era with too little total weighted data" without quantifying it, so the
 * per-Race gates stand in rather than a second, invented threshold.
 */
function eraDivergence(
  era: CalibrationEra,
  races: readonly RaceDivergence[],
  method: FitMethod,
  axis: BandAxis
): EraDivergence {
  const points: SpeedPoint[] = []
  const weights: number[] = []
  let coverage = noCoverage(0)

  for (const race of races) {
    coverage = addCoverage(coverage, race.coverage)
    for (const point of race.points) {
      points.push(point)
      weights.push(1 / race.coverage.countable)
    }
  }

  const population: WeightedPoints = { points, weights }

  return {
    era,
    races: [...races],
    coverage,
    measured_offset_knots: knotGap(population),
    fit: fitWithGates(population, method),
    gap_by_speed: gapBySpeedBand(races, axis),
    races_with_points: races.filter((race) => race.points.length > 0).length,
    races_with_a_line: races.filter((race) => race.fit.fitted).length,
  }
}

/**
 * Every `STW` **Calibration Era** the Calibration Log implies, each with its Races and its figures.
 *
 * The Log alone says where an Era begins — a Log with nothing in it is one Era over the whole
 * archive, which is the state the screen ships in, and a step in the data is never a boundary
 * (ADR 0027). An Era holding no Race is returned with its reason rather than dropped: an Era the
 * sailor can see nothing was measured in reads differently from one that is missing.
 */
export function paddlewheelDivergence(
  races: readonly PaddlewheelRace[],
  log: readonly CalibrationLogEntry[],
  options: {
    method?: FitMethod
    /**
     * Which channel the Era's `gap_by_speed` bands are cut on. Defaults to the scatter's own x,
     * and is the caller's to state because the figure at the top end moves with it (ADR 0034).
     */
    band_axis?: BandAxis
  } = {}
): EraDivergence[] {
  const method = options.method ?? 'orthogonal'
  const axis = options.band_axis ?? 'stw'
  const read = [...races].sort(bySailedAt).map((race) => raceDivergence(race, method))

  return calibrationEras(log, 'STW').map((era) =>
    eraDivergence(
      era,
      read.filter((race) => withinEra(race.sailed_at, era)),
      method,
      axis
    )
  )
}

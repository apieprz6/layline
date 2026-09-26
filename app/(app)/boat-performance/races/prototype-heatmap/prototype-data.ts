/**
 * PROTOTYPE — throwaway. Answers LAY-148 and gets deleted.
 *
 * The real thing will read a Race out of Supabase through `services/analysis/` (ADR 0026). This
 * reads a qtVlm CSV off disk, because the local database is empty and the question is *how the
 * heatmap should look*, not where its rows come from. Everything downstream of the rows — Row
 * Quality, Maneuver Windows, Target Speed, percent-of-target — is computed with the real
 * production code or the real spec, so the picture on screen is a picture of real sailing.
 *
 * Nothing here is cached, memoised, or written anywhere.
 */

import { readFile } from 'node:fs/promises'
import { parsePolarFile } from '@/services/boat/polarFile'
import { classifyPolarRows } from '@/services/boat/polarSyntheticRows'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { PolarPayload, RaceChartSeries } from '@/types'

import { RACE_FILES, type RaceFileKey } from './prototype-races'

/** Real recordings from the boat, sitting in a sibling repo. */
const RECORDINGS = '/home/ubuntu/git/Handsome-Pete/raw-regatta-recordings'
const POLAR = '/home/ubuntu/git/Handsome-Pete/polars/HandsomePete_2026_ORC_final.pol'

/** LAY-140: asymmetric, because the recovery after a turn is longer than the wind-up before it. */
const MANEUVER_BEFORE = 1
const MANEUVER_AFTER = 3

/**
 * The suppression threshold is **read off the Polar, not written down**.
 *
 * LAY-148 assumes "~45°", which is where ADR 0028's reasoning landed in the abstract — below it the
 * Polar's own rows are manufactured filler, so a percent computed against them is arithmetic on a
 * number nobody measured, and a sailor pinching at 28° would read ~480% of target. But Handsome
 * Pete's real ORC polar has no trusted row below **52°**, so a hardcoded 45 would leave every row
 * between 45° and 52° looking like an ordinary out-of-range miss rather than the same "we cannot
 * say" the sub-45 rows get. `classifyPolarRows` already tells us where the filler stops; that
 * boundary is the threshold, and it moves when the sailor uploads a new polar.
 *
 * Kept only as a floor for the pathological case of a Polar whose filler detection finds nothing to
 * strip — a hand-written file claiming a measured row at 20°.
 */
const TWA_SUPPRESSION_FLOOR = 45

/** Why a point is not colored by its percent-of-target. In precedence order. */
export type PointState =
  /** Colored by percent-of-target. The only state that carries a measurement. */
  | 'measured'
  /** Fabricated (ADR 0009). No metric may read it, and it is where the boat was an hour ago. */
  | 'frozen'
  /** Parked. Countable says no (ADR 0025). */
  | 'low-speed'
  /** Mid-turn. Countable says no (ADR 0025). */
  | 'maneuver'
  /** Below ~45° TWA: the Polar has no measured row to divide by (ADR 0028). */
  | 'suppressed'
  /** Outside the Polar's covered range, or a reading the file never wrote. Missing stays missing. */
  | 'no-target'

export interface TrackPoint {
  index: number
  seconds: number
  /** Null everywhere a fix is missing. Null in, null out. */
  latitude: number | null
  longitude: number | null
  sog: number | null
  tws: number | null
  /** Signed as the file writes it: negative to port. */
  twa: number | null
  /** Bilinear on the Polar at this row's own (|TWA|, TWS). Null outside the covered range. */
  target: number | null
  /** `sog / target`, as a fraction. Null unless the state is `measured`. */
  ratio: number | null
  state: PointState
}

export interface PrototypeRace {
  label: string
  file: string
  series: RaceChartSeries
  points: TrackPoint[]
  /** What the legend and the excluded-row note read off. */
  counts: Record<PointState, number>
  /** Only over `measured` points — the numbers the perf tiles state. */
  upwind: { ratio: number | null; rows: number }
  downwind: { ratio: number | null; rows: number }
  polar: PolarPayload
  /** The lowest TWA the Polar carries a measured or interpolated row for. */
  polarFloor: number
  /** The angle below which no percent-of-target exists, derived from the Polar above. */
  suppressionFloor: number
}

export async function loadPrototypeRace(key: RaceFileKey): Promise<PrototypeRace> {
  const entry = RACE_FILES.find((candidate) => candidate.key === key) ?? RACE_FILES[0]

  const [csv, polarText] = await Promise.all([
    readFile(`${RECORDINGS}/${entry.file}`),
    readFile(POLAR, 'utf8'),
  ])

  const parsed = parseQtvlmRecording(csv)
  if (!parsed.ok) throw new Error(`prototype: ${entry.file} refused — ${parsed.message}`)

  const polarOutcome = parsePolarFile(polarText)
  if (!polarOutcome.ok) throw new Error(`prototype: polar refused — ${polarOutcome.message}`)

  const { transcription } = parsed
  const quality = assessRowQuality(transcription.rows)
  const series = raceChartSeries(transcription, quality)
  const polar = polarOutcome.payload

  const anchors = trustedAnchors(polar)
  const polarFloor = anchors.floorTwa

  const maneuver = maneuverWindows(series)
  const points = series.row_seconds.map((seconds, at) =>
    classifyPoint(at, seconds, series, maneuver, anchors)
  )

  const counts: Record<PointState, number> = {
    measured: 0,
    frozen: 0,
    'low-speed': 0,
    maneuver: 0,
    suppressed: 0,
    'no-target': 0,
  }
  for (const point of points) counts[point.state] += 1

  return {
    label: entry.label,
    file: entry.file,
    series,
    points,
    counts,
    upwind: average(points, (twa) => Math.abs(twa) <= 90),
    downwind: average(points, (twa) => Math.abs(twa) > 90),
    polar,
    polarFloor,
    suppressionFloor: Math.max(TWA_SUPPRESSION_FLOOR, polarFloor),
  }
}

// ---------------------------------------------------------------------------
// Target Speed — ADR 0028
// ---------------------------------------------------------------------------

interface Anchors {
  /** TWA rows the Polar actually measured or interpolated, ascending. */
  twa: number[]
  tws: number[]
  /** `speed[twaIndex][twsIndex]`, indexed against the arrays above. */
  speed: number[][]
  floorTwa: number
}

/**
 * The Polar minus its manufactured filler.
 *
 * ADR 0028 anchors interpolation only on rows `classifyPolarRows` calls `measured` or
 * `interpolated`; a ramp-filler row (row 35 being exactly 2× row 30) is not a boat speed and may
 * not be an endpoint of an interpolation.
 */
function trustedAnchors(polar: PolarPayload): Anchors {
  const origins = classifyPolarRows(polar)
  const keep: number[] = []

  for (let at = 0; at < polar.twa_axis.length; at += 1) {
    const origin = origins[at]
    if (origin === 'measured' || origin === 'interpolated') keep.push(at)
  }

  return {
    twa: keep.map((at) => polar.twa_axis[at]),
    tws: polar.tws_axis,
    speed: keep.map((at) => polar.boat_speed[at]),
    floorTwa: keep.length > 0 ? polar.twa_axis[keep[0]] : Infinity,
  }
}

/**
 * Bilinear interpolation at this row's own real angle and speed — never a snap to the nearest
 * Polar row, which would make a 7° heading change look like a 4% performance change.
 *
 * Outside the covered range the answer is **missing**. Extrapolating past the Polar's last column
 * would invent a target for a wind the boat was never measured in.
 */
function targetSpeed(anchors: Anchors, twaMagnitude: number, tws: number): number | null {
  const angle = bracket(anchors.twa, twaMagnitude)
  const speed = bracket(anchors.tws, tws)
  if (!angle || !speed) return null

  const { lo: a0, hi: a1, t: ta } = angle
  const { lo: s0, hi: s1, t: ts } = speed

  const low = lerp(anchors.speed[a0][s0], anchors.speed[a0][s1], ts)
  const high = lerp(anchors.speed[a1][s0], anchors.speed[a1][s1], ts)
  const value = lerp(low, high, ta)

  return Number.isFinite(value) && value > 0 ? value : null
}

function bracket(axis: number[], value: number): { lo: number; hi: number; t: number } | null {
  if (axis.length === 0) return null
  if (value < axis[0] || value > axis[axis.length - 1]) return null

  for (let at = 0; at < axis.length - 1; at += 1) {
    if (value >= axis[at] && value <= axis[at + 1]) {
      const span = axis[at + 1] - axis[at]
      return { lo: at, hi: at + 1, t: span === 0 ? 0 : (value - axis[at]) / span }
    }
  }

  const last = axis.length - 1
  return { lo: last, hi: last, t: 0 }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ---------------------------------------------------------------------------
// Countable — ADR 0025 + LAY-140
// ---------------------------------------------------------------------------

/**
 * Rows inside a Maneuver Window, per LAY-140: one row before a TWA sign flip and three after.
 *
 * A Frozen row may neither anchor a window nor fall inside one — its TWA is the previous row's
 * verbatim, so a flip across it is an artifact of the dead feed and not a turn of the wheel. The
 * comparison therefore walks the last *non-Frozen* angle rather than the previous index.
 */
function maneuverWindows(series: RaceChartSeries): boolean[] {
  const twa = series.channels.twa
  const inWindow = new Array<boolean>(twa.length).fill(false)

  let lastAngle: number | null = null
  let lastAt = -1

  for (let at = 0; at < twa.length; at += 1) {
    if (series.frozen[at]) continue
    const angle = twa[at]
    if (angle === null) continue

    if (lastAngle !== null && Math.sign(angle) !== Math.sign(lastAngle) && angle !== 0) {
      // The flip sits between `lastAt` and `at`; the window spans both sides of it.
      for (let mark = lastAt - MANEUVER_BEFORE + 1; mark <= at + MANEUVER_AFTER - 1; mark += 1) {
        if (mark < 0 || mark >= twa.length) continue
        if (series.frozen[mark]) continue
        inWindow[mark] = true
      }
    }

    lastAngle = angle
    lastAt = at
  }

  return inWindow
}

function classifyPoint(
  at: number,
  seconds: number,
  series: RaceChartSeries,
  maneuver: boolean[],
  anchors: Anchors
): TrackPoint {
  const latitude = series.latitude[at]
  const longitude = series.longitude[at]
  const sog = series.channels.sog[at]
  const tws = series.channels.tws[at]
  const twa = series.channels.twa[at]

  const base = { index: at, seconds, latitude, longitude, sog, tws, twa }

  // Precedence is deliberate: Frozen first, because a frozen row's SOG and TWA are somebody
  // else's numbers and every other test would be reading them.
  if (series.frozen[at]) return { ...base, target: null, ratio: null, state: 'frozen' }
  if (series.low_speed[at]) return { ...base, target: null, ratio: null, state: 'low-speed' }
  if (maneuver[at]) return { ...base, target: null, ratio: null, state: 'maneuver' }

  if (sog === null || tws === null || twa === null) {
    return { ...base, target: null, ratio: null, state: 'no-target' }
  }

  const magnitude = Math.abs(twa)
  if (magnitude < Math.max(TWA_SUPPRESSION_FLOOR, anchors.floorTwa)) {
    return { ...base, target: null, ratio: null, state: 'suppressed' }
  }

  const target = targetSpeed(anchors, magnitude, tws)
  if (target === null) return { ...base, target: null, ratio: null, state: 'no-target' }

  return { ...base, target, ratio: sog / target, state: 'measured' }
}

/** Over `measured` points only — an excluded row never enters an average (ADR 0025). */
function average(
  points: readonly TrackPoint[],
  pick: (twa: number) => boolean
): { ratio: number | null; rows: number } {
  let total = 0
  let rows = 0

  for (const point of points) {
    if (point.state !== 'measured' || point.ratio === null || point.twa === null) continue
    if (!pick(point.twa)) continue
    total += point.ratio
    rows += 1
  }

  return { ratio: rows > 0 ? total / rows : null, rows }
}

/**
 * Does the paddlewheel need recalibrating? One Calibration Era's answer, and the five readings it
 * is drawn from (ADR 0041).
 *
 * The question is separable from GPS error because the two behave differently. GPS noise is random
 * row to row and averages away; a paddlewheel calibration error repeats — **the same gap at the
 * same speed in every Race**. Current also moves `SOG` and not `STW`, but it changes Race to Race
 * and swings with heading; weed on the wheel grows over weeks. So the verdict reads five things:
 *
 * 1. **Bands.** Each Race's own mean gap per knot of `STW`, then whether the Races sit together
 *    outside a close-enough window, together inside it, or strung across it.
 * 2. **Where the sailing is.** The share of the Era's rows in bands that are spot on.
 * 3. **Heading.** The gap by `COG`, per 45° sector, every Race weighted equally.
 * 4. **Drift.** Each Race's Measured Offset against when it was sailed.
 * 5. **Shape.** A calibration is one multiplier and one Programmed Offset, so the gap it can remove
 *    is a straight line in speed. Spot on in the middle and off at the edges is a curve, which it
 *    cannot follow — fixing the edges would spoil the middle.
 *
 * **It never drafts a value.** The verdict says *whether* to recalibrate and where the paddlewheel
 * reads slow or fast, in knots at stated speeds. A percentage, a slope or a suggested multiplier
 * would be a correction to type in, which ADR 0027 and LAY-138 decision 7 rule out and ADR 0041
 * leaves ruled out.
 *
 * Every threshold below is a **starting value, not strongly defended** (ADR 0041), chosen against
 * the owner's thirteen Races, to be revisited once the archive is larger.
 */

import type { EraDivergence, RaceDivergence } from '@/services/analysis/paddlewheel'

/**
 * Knots of gap inside which the paddlewheel is "spot on": Lake Michigan current and GPS noise can
 * account for this much on their own, so a calibration change could not be told from chasing them.
 */
export const CLOSE_ENOUGH_KNOTS = 0.2

/** Rows a Race needs in a band, or a heading sector, before its mean there counts. */
export const MIN_ROWS_PER_RACE = 10

/** Races that must count in a band before the band gets a verdict at all. */
export const MIN_RACES_PER_BAND = 3

/** Share of a band's Races that must lean the same way as the band for "the Races agree". */
export const AGREE_SHARE = 0.75

/**
 * Share of the Era's rows in spot-on bands at or above which recalibrating would do more harm than
 * good: the paddlewheel is already right where the boat sails, and a calibration moves every speed.
 */
export const SPOT_ON_SHARE_TO_LEAVE = 0.6

/** Heading sectors the gap is read in — eight of 45°, centred on north. */
export const HEADING_SECTORS = 8

/** Races a heading sector needs before it has a mean; sectors with one are needed to judge at all. */
const MIN_RACES_PER_SECTOR = 2
const MIN_SECTORS_TO_JUDGE = 4

/** Rows a Race needs to place a point on the drift line, and Races before the line is read. */
const MIN_ROWS_FOR_DRIFT = 30
const MIN_RACES_FOR_DRIFT = 3

export type SpeedBandVerdict =
  /** Fewer than `MIN_RACES_PER_BAND` Races counted here. */
  | 'thin'
  | 'spot-on'
  /** `SOG` above `STW`, and the Races agree: the paddlewheel under-reads. */
  | 'reads-slow'
  /** `SOG` below `STW`, and the Races agree. */
  | 'reads-fast'
  /** Outside the window on average, but the Races lean both ways: current or noise. */
  | 'races-disagree'

/** One Race's own mean gap in one band or sector. */
export interface RaceGap {
  race_id: string
  mean_gap_knots: number
  rows: number
}

export interface SpeedBandRead {
  /** The band's lower bound in knots of `STW`; it holds `[band, band + 1)`. */
  band: number
  verdict: SpeedBandVerdict
  /** Mean of the counted Races' own means — every Race weighted equally. Null with none counted. */
  mean_gap_knots: number | null
  /** Each counted Race's own mean, in the Era's Race order. */
  races: RaceGap[]
  /** Counted Races leaning the same way as `mean_gap_knots`. */
  agreeing: number
  /** Every row in the band, counted Race or not. */
  rows: number
}

export interface HeadingSectorRead {
  /** 0 is north (337.5°–22.5°), 1 north-east, and so round. */
  sector: number
  /** Null where fewer than two Races counted. */
  mean_gap_knots: number | null
  races: number
}

export interface DriftPoint {
  race_id: string
  sailed_at: string
  measured_offset_knots: number
}

export type PaddlewheelRecommendation =
  /** Off over most of the sailing in a way one calibration can follow, the Races agree, and neither current nor weed explains it. */
  | 'recalibrate'
  /** Spot on where the boat sails, or off only in a way a calibration cannot follow. */
  | 'leave-it'
  /** The gap moved through the season: weed, before calibration. */
  | 'clean-first'
  /** Too few Races, Races that disagree, or a gap that swings with heading. */
  | 'cant-tell'

export interface PaddlewheelVerdict {
  recommendation: PaddlewheelRecommendation
  /** One per knot from 0 up to the fastest row, including bands no Race sailed. */
  bands: SpeedBandRead[]
  /** Share of the Era's rows in spot-on bands; null with no rows. */
  spot_on_share: number | null
  heading: {
    sectors: HeadingSectorRead[]
    /** Highest sector mean less the lowest; null with too few sectors to judge. */
    swing_knots: number | null
  }
  drift: {
    points: DriftPoint[]
    /** Mean of the last third of Races less the first third; null with too few Races. */
    change_knots: number | null
  }
  /** Whether one multiplier and one offset could close the gap (point 5, above). */
  one_calibration_fixes: boolean
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Each Race's mean gap per key, for whatever key the caller cuts its points on. */
function perRaceMeans(
  races: readonly RaceDivergence[],
  keyOf: (point: RaceDivergence['points'][number]) => number | null
): Map<number, RaceGap[]> {
  const out = new Map<number, RaceGap[]>()

  for (const race of races) {
    const sums = new Map<number, { sum: number; rows: number }>()
    for (const point of race.points) {
      const key = keyOf(point)
      if (key === null) continue
      const held = sums.get(key) ?? { sum: 0, rows: 0 }
      held.sum += point.sog - point.stw
      held.rows += 1
      sums.set(key, held)
    }
    for (const [key, { sum, rows }] of sums) {
      const list = out.get(key) ?? []
      list.push({ race_id: race.race_id, mean_gap_knots: sum / rows, rows })
      out.set(key, list)
    }
  }

  return out
}

/**
 * Whether a figure in knots is beyond a limit, judged at the hundredth of a knot it is printed at —
 * so the screen can never say "0.20 kt slow" of a band it calls outside a ±0.2 kt window, nor "moved
 * 0.20 kt" of a drift it calls weed.
 */
export function exceeds(knots: number, limit: number): boolean {
  return Math.round(Math.abs(knots) * 100) / 100 > limit
}

function withinWindow(gap: number): boolean {
  return !exceeds(gap, CLOSE_ENOUGH_KNOTS)
}

function readBand(band: number, all: readonly RaceGap[]): SpeedBandRead {
  const rows = all.reduce((sum, race) => sum + race.rows, 0)
  const races = all.filter((race) => race.rows >= MIN_ROWS_PER_RACE)
  const gap = races.length === 0 ? null : mean(races.map((race) => race.mean_gap_knots))

  if (gap === null || races.length < MIN_RACES_PER_BAND) {
    return { band, verdict: 'thin', mean_gap_knots: gap, races, agreeing: 0, rows }
  }

  const agreeing = races.filter(
    (race) => Math.sign(race.mean_gap_knots) === Math.sign(gap)
  ).length
  const verdict: SpeedBandVerdict =
    withinWindow(gap)
      ? 'spot-on'
      : agreeing / races.length >= AGREE_SHARE
        ? gap > 0
          ? 'reads-slow'
          : 'reads-fast'
        : 'races-disagree'

  return { band, verdict, mean_gap_knots: gap, races, agreeing, rows }
}

/** The sector a recorded course falls in, or null where there is no course. */
function sectorOf(cog: number | null): number | null {
  if (cog === null) return null
  const width = 360 / HEADING_SECTORS
  return Math.floor((((cog % 360) + 360 + width / 2) % 360) / width)
}

function readHeading(races: readonly RaceDivergence[]): PaddlewheelVerdict['heading'] {
  const bySector = perRaceMeans(races, (point) => sectorOf(point.cog))

  const sectors = Array.from({ length: HEADING_SECTORS }, (_, sector): HeadingSectorRead => {
    const counted = (bySector.get(sector) ?? []).filter((race) => race.rows >= MIN_ROWS_PER_RACE)
    return {
      sector,
      mean_gap_knots:
        counted.length < MIN_RACES_PER_SECTOR ? null : mean(counted.map((race) => race.mean_gap_knots)),
      races: counted.length,
    }
  })

  const known = sectors.flatMap((sector) =>
    sector.mean_gap_knots === null ? [] : [sector.mean_gap_knots]
  )
  return {
    sectors,
    swing_knots: known.length < MIN_SECTORS_TO_JUDGE ? null : Math.max(...known) - Math.min(...known),
  }
}

function readDrift(races: readonly RaceDivergence[]): PaddlewheelVerdict['drift'] {
  const points = races.flatMap((race): DriftPoint[] =>
    race.measured_offset_knots === null || race.points.length < MIN_ROWS_FOR_DRIFT
      ? []
      : [
          {
            race_id: race.race_id,
            sailed_at: race.sailed_at,
            measured_offset_knots: race.measured_offset_knots,
          },
        ]
  )
  if (points.length < MIN_RACES_FOR_DRIFT) return { points, change_knots: null }

  // The Era's Races arrive oldest first, which is the order a drift is read in.
  const third = Math.max(1, Math.floor(points.length / 3))
  const offsets = points.map((point) => point.measured_offset_knots)
  return { points, change_knots: mean(offsets.slice(-third)) - mean(offsets.slice(0, third)) }
}

/** The Era's answer. Reads only the points, so it is the same under either fit method. */
export function paddlewheelVerdict(era: EraDivergence): PaddlewheelVerdict {
  const byBand = perRaceMeans(era.races, (point) => Math.floor(point.stw))
  const fastest = Math.max(-1, ...byBand.keys())
  const bands = Array.from({ length: fastest + 1 }, (_, band) => readBand(band, byBand.get(band) ?? []))

  const total = bands.reduce((sum, band) => sum + band.rows, 0)
  const spotRows = bands
    .filter((band) => band.verdict === 'spot-on')
    .reduce((sum, band) => sum + band.rows, 0)
  const spot_on_share = total === 0 ? null : spotRows / total

  const heading = readHeading(era.races)
  const drift = readDrift(era.races)

  const off = bands.filter((band) => band.verdict === 'reads-slow' || band.verdict === 'reads-fast')
  const one_calibration_fixes =
    off.length > 0 && (spot_on_share ?? 0) < SPOT_ON_SHARE_TO_LEAVE && followsALine(bands)

  return {
    recommendation: recommend(bands, off, drift, heading, one_calibration_fixes),
    bands,
    spot_on_share,
    heading,
    drift,
    one_calibration_fixes,
  }
}

/**
 * Whether the judged bands' gaps lie within the close-enough window of one straight line.
 *
 * A calibration is `multiplier × reading + offset`, so the gap it can remove is linear in speed:
 * slow at low speed and fast at high speed is a line, and so is slow everywhere. A U is not. The
 * line is internal — fitted, read for its residuals and discarded, never returned — because its
 * coefficients are exactly the drafted correction this module must not publish (ADR 0027).
 */
function followsALine(bands: readonly SpeedBandRead[]): boolean {
  const judged = bands.flatMap((band) =>
    band.verdict === 'thin' || band.mean_gap_knots === null
      ? []
      : [{ x: band.band + 0.5, y: band.mean_gap_knots }]
  )
  if (judged.length < 2) return judged.length === 1

  const mx = mean(judged.map((p) => p.x))
  const my = mean(judged.map((p) => p.y))
  const sxx = judged.reduce((sum, p) => sum + (p.x - mx) ** 2, 0)
  const tilt = judged.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0) / sxx

  return judged.every((p) => Math.abs(p.y - (my + tilt * (p.x - mx))) <= CLOSE_ENOUGH_KNOTS)
}

function recommend(
  bands: readonly SpeedBandRead[],
  off: readonly SpeedBandRead[],
  drift: PaddlewheelVerdict['drift'],
  heading: PaddlewheelVerdict['heading'],
  fixes: boolean
): PaddlewheelRecommendation {
  if (bands.every((band) => band.verdict === 'thin')) return 'cant-tell'

  if (off.length > 0) {
    if (drift.change_knots !== null && exceeds(drift.change_knots, CLOSE_ENOUGH_KNOTS)) {
      return 'clean-first'
    }
    // A gap that swings with heading is at least partly current, and recalibrating would bake it in.
    if (heading.swing_knots !== null && exceeds(heading.swing_knots, 2 * CLOSE_ENOUGH_KNOTS)) {
      return 'cant-tell'
    }
    return fixes ? 'recalibrate' : 'leave-it'
  }

  return bands.some((band) => band.verdict === 'spot-on') ? 'leave-it' : 'cant-tell'
}

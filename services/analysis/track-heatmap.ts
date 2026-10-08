/**
 * The **Race Track Heatmap**: a race's own GPS trace, drawn, with colour spent only on what was
 * measured (ADR 0033).
 *
 * The track *is* the heatmap. Every recorded row of the window is drawn, because the boat was
 * there; a row that is not **Countable** carries no colour, because it supports no claim. Nothing
 * that is not a measurement may borrow a step of the ramp — which is why an excluded row is a grey
 * hairline and never the ramp's own grey midpoint.
 *
 * ## Why this returns drawn geometry and not rows
 *
 * The projection and the state classification stay on the server; what crosses to the client is a
 * list of path strings with a band each. The client can move the camera and has no ability to
 * re-decide what a row meant. That is also forced: a `TrackProjection` carries closures and cannot
 * be serialised at all.
 *
 * ## The four states, and why they must stay four
 *
 * - **Countable, with a Target Speed** — coloured on the seven-band diverging ramp.
 * - **Countable, Filler-Anchored** — coloured by its own percent *and* textured, because ADR 0036
 *   puts the doubt on the number rather than in place of it. A sailed row is real however weak the
 *   grid cell it is compared against.
 * - **Not Countable, or no computable Target Speed** — an uncoloured hairline. Geometry, no claim.
 * - **Frozen** — ringed, the track broken into and out of the run, and the gap **bridged** with
 *   its own duration (ADR 0014, as ADR 0033 amends it). A frozen run repeats one position, so 815
 *   frozen rows stack 815 rings into a single pixel: ringing alone discharges the obligation on
 *   paper and leaves a clean track of a boat that was not transmitting.
 *
 * Collapsing any of these into "not Countable" would re-lose the distinction ADR 0009 exists to
 * protect, which is why the counts below are tallied by reason and stated in words under the
 * legend rather than left to be inferred from how much grey is on screen.
 *
 * Every time here is absolute seconds in the recording's own naive frame. Nothing constructs a
 * `Date`: an offset would be a claim about a timezone the recording never made.
 */

import { notCountableReason } from '@/services/analysis/countable'
import { computeRowEfficiency } from '@/services/analysis/efficiency'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import type { TrackBox } from '@/services/recordings/track-projection'
import { projectTrack, type TrackProjection } from '@/services/recordings/track-projection'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  AnalysisRow,
  DropoutBridge,
  RaceTrackHeatmap,
  TrackBand,
  TrackHeatmapCounts,
  TrackRing,
  TrackSegment,
} from '@/types'

/**
 * What the map reads of a row: where the boat was, what it was doing, and ADR 0025's verdict.
 *
 * Its own interface rather than `ReadableRow`, for the reason `ScorableRow` is one — so this
 * module cannot quietly grow a dependency on a channel it has no rule about. Five channels, all
 * of them text exactly as the file wrote it (ADR 0008), read as numbers only here and in the
 * efficiency it delegates to.
 *
 * `AnalysisRow` brings the quality assessment and the Maneuver Window along unseparated, because
 * *why* a row is excluded has to reach the renderer as a state and not as a missing number.
 */
export interface TrackHeatmapRow extends AnalysisRow {
  latitude: string | null
  longitude: string | null
  /** Knots over the ground: the efficiency numerator (ADR 0027). */
  sog: string | null
  tws: string | null
  /** Signed, −180..180, positive = starboard (ADR 0008). */
  twa: string | null
}

/**
 * The seven bands of the diverging ramp, in order, centred on 100% (ADR 0033).
 *
 * One list, read by both the colouring and the legend, so the swatch a sailor is shown cannot
 * drift from the band a segment was given. Diverging rather than sequential because percent of
 * target is a **polarity** question before it is a magnitude one: the Polar already said how fast
 * the boat theoretically goes, and what the track is for is finding which side of target each
 * stretch of water sat on.
 *
 * Amber below and blue above, *not* the conventional red/blue: the same map rings **Frozen** rows
 * in `--wind-storm`, and a red arm would collide with it. The midpoint is a neutral gray, never a
 * hue, per the `dataviz` rule — which is also why an excluded row may not be drawn in grey as a
 * colour step, since the ramp's own grey means on target.
 */
export const TRACK_BANDS = [
  { band: 'below-3', below: 0.85, tick: '<85', label: 'below 85% of target' },
  { band: 'below-2', below: 0.95, tick: '85', label: '85–95% of target' },
  { band: 'below-1', below: 0.98, tick: '95', label: '95–98% of target' },
  { band: 'at', below: 1.02, tick: '98', label: 'on target, 98–102%' },
  { band: 'above-1', below: 1.05, tick: '102', label: '102–105% of target' },
  { band: 'above-2', below: 1.15, tick: '105', label: '105–115% of target' },
  { band: 'above-3', below: Infinity, tick: '115+', label: 'above 115% of target' },
] as const satisfies readonly { band: TrackBand; below: number; tick: string; label: string }[]

/** Which band a percent of target lands in. The upper edge of each band belongs to the next. */
export function trackBand(ratio: number): TrackBand {
  return (TRACK_BANDS.find((band) => ratio < band.below) ?? TRACK_BANDS[TRACK_BANDS.length - 1])
    .band
}

/**
 * A band as the colour to draw it in.
 *
 * A token, never a hex: `.theme-nightvision` collapses this ramp to one red depth scale, and a
 * chart escaping the theme is the one thing `globals.css` forbids. The seven values and their
 * after-dark mappings are declared there; nothing here knows what colour it asked for, which is
 * also why the legend has to change its own *words* after dark rather than its swatches.
 */
export function trackBandColour(band: TrackBand): string {
  return `var(--track-${band})`
}

/** The box ADR 0033 fixes the frame at: stable at 390px whatever shape the track is. */
export const TRACK_BOX: TrackBox = { width: 360, height: 440, pad: 12 }

/** A projected point, rounded to the tenth of a unit the path strings carry. */
function at(projection: TrackProjection, lat: number, lon: number): { x: number; y: number } {
  return { x: projection.x(lon), y: projection.y(lat) }
}

/** `x,y` as a path string writes it. */
function pathPoint(point: { x: number; y: number }): string {
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`
}

/** One row's position, as numbers, or null where the file logged no fix. */
function fixOf(row: TrackHeatmapRow): { lat: number; lon: number } | null {
  const lat = channelValue(row.latitude)
  const lon = channelValue(row.longitude)
  return lat === null || lon === null ? null : { lat, lon }
}

/**
 * How a row is to be drawn: its band, or no band and the reason there is none.
 *
 * `band: null` is three different facts, and all three draw the same hairline — but they are
 * counted apart, because "the boat was parked" and "the Polar cannot answer out here" are not the
 * same sentence under a legend.
 */
interface RowPaint {
  band: TrackBand | null
  /** At least one Polar cell this row's target interpolated from is the file's own filler. */
  filler_anchored: boolean
}

function paintRow(row: TrackHeatmapRow, targets: PolarTargets | null): RowPaint {
  // ADR 0025's verdict first. A row the metrics may not read gets no colour here either, which is
  // the whole of "colour is spent only on the measurement".
  if (!row.countable) return { band: null, filler_anchored: false }
  if (targets === null) return { band: null, filler_anchored: false }

  // The one Target Speed lookup in the app, consumed rather than re-derived: a second reading of
  // the Polar would be a second chance for the map and the tiles below it to disagree about the
  // same race (ADR 0036).
  const scored = computeRowEfficiency(row, targets)

  if (scored.target_speed === null || scored.polar_efficiency === null) {
    return { band: null, filler_anchored: false }
  }

  return {
    band: trackBand(scored.polar_efficiency),
    filler_anchored: scored.target_speed.filler_anchored,
  }
}

function emptyCounts(rows: number): TrackHeatmapCounts {
  return {
    rows,
    with_fix: 0,
    scored: 0,
    filler_anchored: 0,
    frozen: 0,
    low_speed: 0,
    maneuver_window: 0,
    without_target: 0,
  }
}

/**
 * One race's track, drawn, or null where the window holds no position fix at all.
 *
 * Null is a real state in this archive rather than a failure, and the screen owes it words: an
 * empty frame explains nothing (ADR 0033). It is deliberately not an empty heatmap, which a
 * caller could render as a map of a race nobody can see.
 *
 * `targets` is null for a race that records no **Polar Version**, which nine of this archive's
 * races do. Then every row is drawn and none is coloured — the track is still the honest answer to
 * where the boat went, and the section says why nothing on it is scored rather than leaving the
 * grey to be read as poor performance.
 *
 * Hand this the rows of the **Race Window**, already assessed over the whole Transcription and
 * clipped afterwards (ADR 0009). A dropout beginning before the gun still froze the first rows of
 * the race, and the counts below are counts of the race.
 */
export function raceTrackHeatmap(
  rows: readonly TrackHeatmapRow[],
  targets: PolarTargets | null,
  box: TrackBox = TRACK_BOX
): RaceTrackHeatmap | null {
  const fixes = rows.map((row) => {
    const fix = fixOf(row)
    return { latitude: fix?.lat ?? null, longitude: fix?.lon ?? null }
  })

  const projection = projectTrack(fixes, box)
  if (projection === null) return null

  const segments: TrackSegment[] = []
  const rings: TrackRing[] = []
  const bridges: DropoutBridge[] = []
  const counts = emptyCounts(rows.length)

  /** The previous drawable point, or null where a break interrupted the run. */
  let previous: { x: number; y: number } | null = null
  /** The last row either side of a Dropout: where the bridge starts, and when. */
  let before: { x: number; y: number; seconds: number } | null = null
  /** Rows of the Dropout being crossed. Zero outside one. */
  let frozenRun = 0

  rows.forEach((row, index) => {
    const reason = notCountableReason(row)
    if (reason !== null) counts[reason] += 1

    const fix = fixes[index]
    const lat = fix.latitude
    const lon = fix.longitude

    if (lat !== null && lon !== null) counts.with_fix += 1

    const paint = paintRow(row, targets)
    if (paint.band !== null) {
      counts.scored += 1
      if (paint.filler_anchored) counts.filler_anchored += 1
    } else if (row.countable && targets !== null) {
      // In range of the recording and excluded by nothing, yet the Polar has no answer here: past
      // an axis, or a bracket touching a cell the file left empty (ADR 0028). Missing is drawn as
      // the absence of colour and never as a value.
      counts.without_target += 1
    }

    if (row.quality.frozen) {
      // A frozen row still has a position — it is the previous row's, verbatim — and ringing it is
      // the only way the run is visible at all. The track breaks here, so nothing draws a line
      // through water the boat may not have crossed.
      if (lat !== null && lon !== null) {
        const ring = at(projection, lat, lon)
        rings.push({ cx: ring.x, cy: ring.y })
      }
      frozenRun += 1
      previous = null
      return
    }

    if (lat === null || lon === null) {
      // A missing fix is a break too, but it is not a Dropout and carries no duration claim: the
      // boat was somewhere and the file does not say where.
      previous = null
      before = null
      frozenRun = 0
      return
    }

    const here = at(projection, lat, lon)
    const seconds = wallClockSeconds(row.row_time)

    if (frozenRun > 0 && before !== null) {
      bridges.push({
        x1: before.x,
        y1: before.y,
        x2: here.x,
        y2: here.y,
        seconds: seconds - before.seconds,
        rows: frozenRun,
      })
    }

    if (previous !== null) {
      // Attributed to the row it *arrives at*, which is the row whose reading it is showing. One
      // segment per row transition rather than one polyline per run, because a heatmap needs the
      // colour to change where the boat's performance changed.
      segments.push({
        points: `${pathPoint(previous)} ${pathPoint(here)}`,
        band: paint.band,
        filler_anchored: paint.filler_anchored,
      })
    }

    previous = here
    before = { ...here, seconds }
    frozenRun = 0
  })

  return {
    width: box.width,
    height: box.height,
    metres_per_unit: projection.metresPerUnit,
    segments,
    bridges,
    rings,
    counts,
  }
}

/**
 * A **Dropout**'s duration, as a sailor would say it: `34s`, `7m`, `2h11`.
 *
 * Under 90 seconds reads in seconds, because `2m` for 91 seconds is a rounding a sailor would
 * notice on a gap they remember. Beyond an hour reads `h` and minutes, since `131m` is a number
 * nobody converts in their head on the rail.
 */
export function dropoutDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

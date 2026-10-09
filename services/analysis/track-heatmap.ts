/**
 * The **Race Track Heatmap**: a race's own GPS trace, drawn, with each row's figures and verdicts
 * attached (ADR 0033, as ADR 0037 amends it).
 *
 * The track *is* the heatmap. Every recorded row of the window is drawn, because the boat was
 * there; whether a row carries *colour* is a question each overlay answers for itself, and
 * `track-overlays.ts` is where every one of those answers lives.
 *
 * ## What crosses to the client, and why it changed
 *
 * ADR 0033 sent drawn geometry and a colour per segment, so that nothing on the far side could
 * re-decide what a row meant. Six overlays cannot each be precomputed into that payload, and a
 * switch that costs a round trip is not a switch — so each segment now carries its row's **values
 * and verdicts**, computed here, and both sides band them through the one shared module. The
 * client chooses which band to paint and can read a stretch out when the sailor taps it; it cannot
 * invent a band the rules refuse, because the rules are not on that side (ADR 0037).
 *
 * The projection still happens here. It carries closures and cannot be serialised at all, which is
 * also why the client only ever moves a camera over geometry it is handed.
 *
 * ## The four states, and why they must stay four
 *
 * - **Coloured** — the overlay has a value for this row.
 * - **Flagged** — coloured, and resting on the Polar's manufactured filler (ADR 0036). The doubt
 *   goes on the number, not in place of it.
 * - **Uncoloured** — drawn as a hairline, with the reason travelling as a discriminated state and
 *   never as a bare null. Several reasons draw alike on purpose: geometry with no claim on it
 *   should not look like four different claims.
 * - **Frozen** — ringed, the track broken into and out of the run, and the gap **bridged** with
 *   its own duration (ADR 0014, as ADR 0033 amends it). A frozen run repeats one position, so 815
 *   frozen rows stack 815 rings into a single pixel: ringing alone discharges the obligation on
 *   paper and leaves a clean track of a boat that was not transmitting.
 *
 * Every time here is absolute seconds in the recording's own naive frame. Nothing constructs a
 * `Date`: an offset would be a claim about a timezone the recording never made.
 */

import { notCountableReason } from '@/services/analysis/countable'
import { computeRowEfficiency } from '@/services/analysis/efficiency'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import { TRACK_OVERLAYS, overlayPaint } from '@/services/analysis/track-overlays'
import type { TrackBox } from '@/services/recordings/track-projection'
import { projectTrack, type TrackProjection } from '@/services/recordings/track-projection'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  AnalysisRow,
  DropoutBridge,
  RaceTrackHeatmap,
  TrackHeatmapCounts,
  TrackOverlay,
  TrackOverlayCounts,
  TrackPoint,
  TrackRing,
  TrackRowFacts,
  TrackSegment,
} from '@/types'

/**
 * What the map reads of a row: where the boat was, what it was doing, and ADR 0025's verdict.
 *
 * Its own interface rather than `ReadableRow`, for the reason `ScorableRow` is one — so this
 * module cannot quietly grow a dependency on a channel it has no rule about. Six channels, all of
 * them text exactly as the file wrote it (ADR 0008), read as numbers only here and in the
 * efficiency it delegates to.
 *
 * `AnalysisRow` brings the quality assessment and the Maneuver Window along unseparated, because
 * *why* a row is excluded has to reach the renderer as a state and not as a missing number.
 */
export interface TrackHeatmapRow extends AnalysisRow {
  latitude: string | null
  longitude: string | null
  /** Knots over the ground: the efficiency numerator (ADR 0027), and the `SOG` overlay. */
  sog: string | null
  /** Course over the ground, degrees true: the `COG` overlay. */
  cog: string | null
  tws: string | null
  /** Signed, −180..180, positive = starboard (ADR 0008). */
  twa: string | null
}

/** The box ADR 0033 fixes the frame's *shape* at. The element is fluid; the projection is not. */
export const TRACK_BOX: TrackBox = { width: 360, height: 440, pad: 12 }

/** Where a fix lands in the frame. */
function at(projection: TrackProjection, lat: number, lon: number): { x: number; y: number } {
  return { x: projection.x(lon), y: projection.y(lat) }
}

/** `x,y` as a path string writes it, at the tenth of a unit a 360-unit frame can show. */
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
 * One row's values and verdicts, as every overlay and the readout both read them.
 *
 * The Polar is consulted through `computeRowEfficiency` rather than directly: a second reading of
 * it here would be a second chance for the map and the tiles below it to disagree about the same
 * race (ADR 0036). It is called once per row, and all six overlays are served from the result.
 */
function factsOf(row: TrackHeatmapRow, targets: PolarTargets | null): TrackRowFacts {
  const scored = targets === null ? null : computeRowEfficiency(row, targets)

  return {
    row_index: row.row_index,
    row_time: row.row_time,
    sog: channelValue(row.sog),
    tws: channelValue(row.tws),
    twa: channelValue(row.twa),
    cog: channelValue(row.cog),
    target_speed: scored?.target_speed?.knots ?? null,
    polar_efficiency: scored?.polar_efficiency ?? null,
    target_vmg: scored?.target_vmg?.estimated_knots ?? null,
    vmg_efficiency: scored?.vmg_efficiency ?? null,
    filler_anchored:
      (scored?.target_speed?.filler_anchored ?? false) ||
      (scored?.target_vmg?.filler_anchored ?? false),
    // `notCountableReason`'s own answer, assigned straight across — which is what keeps the map's
    // vocabulary from drifting from the rest of the app's.
    excluded: notCountableReason(row),
  }
}

function emptyOverlayCounts(): TrackOverlayCounts {
  return { scored: 0, flagged: 0, without_value: 0 }
}

function emptyCounts(rows: number): TrackHeatmapCounts {
  return {
    rows,
    with_fix: 0,
    frozen: 0,
    low_speed: 0,
    maneuver_window: 0,
    overlays: {
      target_speed: emptyOverlayCounts(),
      target_vmg: emptyOverlayCounts(),
      sog: emptyOverlayCounts(),
      tws: emptyOverlayCounts(),
      twa: emptyOverlayCounts(),
      cog: emptyOverlayCounts(),
    },
  }
}

/**
 * Every overlay's coverage of one row, tallied.
 *
 * Counted here rather than left to the legend, because the legend only sees the rows that were
 * *drawn* — a row with no position at all is in none of them and still has to be accounted for.
 */
function tally(counts: TrackHeatmapCounts, facts: TrackRowFacts, hasPolar: boolean): void {
  for (const overlay of TRACK_OVERLAYS) {
    const paint = overlayPaint(overlay, facts, hasPolar)
    const tallies = counts.overlays[overlay]

    if (paint.band !== null) {
      tallies.scored += 1
      if (paint.flagged) tallies.flagged += 1
    } else if (paint.not_scored === 'no_target' || paint.not_scored === 'no_reading') {
      tallies.without_value += 1
    }
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
 * races do. The two ratio overlays then colour nothing and say why; the four channel overlays are
 * unaffected, because a recorded speed does not depend on a certificate.
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

  const hasPolar = targets !== null
  const segments: TrackSegment[] = []
  const points: TrackPoint[] = []
  const rings: TrackRing[] = []
  const bridges: DropoutBridge[] = []
  const counts = emptyCounts(rows.length)

  /** The previous drawable point, or null where a break interrupted the run. */
  let previous: { x: number; y: number } | null = null
  /** The last row either side of a Dropout: where the bridge starts, and when. */
  let before: { x: number; y: number; seconds: number } | null = null
  /** Rows of the Dropout being crossed. Zero outside one. */
  let frozenRun = 0
  /** The run in progress: how many fixes long, and the first of them, in case it is the only one. */
  let runLength = 0
  let runFirst: TrackPoint | null = null

  /**
   * End the run of joined fixes, plotting it as a point if it turned out to be one fix long.
   *
   * A run of one cannot be a polyline, so without this the row would be in the counts and nowhere
   * on the map — and "every recorded row is drawn" would be false exactly where it matters most, on
   * a feed that surfaced for a single fix between two dropouts. Two rows of this archive are like
   * that.
   */
  const closeRun = (): void => {
    if (runLength === 1 && runFirst !== null) points.push(runFirst)
    runLength = 0
    runFirst = null
    previous = null
  }

  rows.forEach((row, index) => {
    const facts = factsOf(row, targets)

    if (facts.excluded !== null) counts[facts.excluded] += 1
    tally(counts, facts, hasPolar)

    const fix = fixes[index]
    const lat = fix.latitude
    const lon = fix.longitude

    if (lat !== null && lon !== null) counts.with_fix += 1

    if (row.quality.frozen) {
      // A frozen row still has a position — it is the previous row's, verbatim — and ringing it is
      // the only way the run is visible at all. The track breaks here, so nothing draws a line
      // through water the boat may not have crossed.
      if (lat !== null && lon !== null) {
        const ring = at(projection, lat, lon)
        rings.push({ cx: ring.x, cy: ring.y })
      }
      frozenRun += 1
      closeRun()
      return
    }

    if (lat === null || lon === null) {
      // A missing fix is a break too, but it is not a Dropout and carries no duration claim: the
      // boat was somewhere and the file does not say where.
      closeRun()
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
        x1: previous.x,
        y1: previous.y,
        x2: here.x,
        y2: here.y,
        row: facts,
      })
    }

    runLength += 1
    if (runLength === 1) runFirst = { x: here.x, y: here.y, row: facts }

    previous = here
    before = { ...here, seconds }
    frozenRun = 0
  })

  // The last run ends at the end of the window, which is a break like any other.
  closeRun()

  return {
    width: box.width,
    height: box.height,
    metres_per_unit: projection.metresPerUnit,
    segments,
    points,
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

/** Which overlays a race can colour at all, for a switcher that offers nothing it cannot draw. */
export function overlaysWithColour(counts: TrackHeatmapCounts): TrackOverlay[] {
  return TRACK_OVERLAYS.filter((overlay) => counts.overlays[overlay].scored > 0)
}

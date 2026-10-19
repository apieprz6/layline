/**
 * The **Race Track Heatmap** in time: how long each overlay spent in each band of its own scale,
 * what it left uncoloured and why, and the race as runs of one state (ADR 0037, ADR 0038).
 *
 * The map is a picture of rows; a sailor's question is about time. "Where did we lose it" is
 * answered by *how long* the boat sailed two bands below target and *when*, and a count of rows
 * cannot say either: the recording is event-triggered, so a row is thirty seconds on a beat and
 * four minutes inside a Dropout. So every figure here is seconds, and both the legend and the MCP's
 * `race_track` state them — one figure, from one function.
 *
 * ## Whose span a row is
 *
 * Each row is the interval it *arrives at*, from the row before it. That is the stretch of track
 * its own segment draws (`raceTrackHeatmap` attributes a leg to the row it arrives at), and it is
 * the attribution `raceCoverage` makes — so the frozen time here is the frozen time the coverage
 * readout prints for the same Race, rather than a second figure a minute away from it. The first
 * row arrives at nothing; what lies before it is the window the recording had not yet reached.
 *
 * ## Why every second is somewhere
 *
 * The window's two edges and the rows the map cannot draw are uncoloured reasons of their own, so
 * on every overlay the band time and the uncoloured time are the whole Race Window. An interval
 * the clock ran backwards over is no duration and holds nothing — `RaceCoverage.backwards_steps`
 * is where that is counted.
 *
 * Nothing here bands or gates a row. Each row's paint is `overlayPaint`'s, verbatim: this module
 * only measures how long it lasted.
 */

import { TRACK_OVERLAYS, TRACK_SCALES, overlayPaint } from '@/services/analysis/track-overlays'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { RaceWindow } from '@/services/recordings/row-quality'
import type {
  TrackBandToken,
  TrackHeatmapTime,
  TrackOverlay,
  TrackOverlayTime,
  TrackRowFacts,
  TrackRun,
  TrackUncolouredReason,
} from '@/types'

/** ADR 0025's three exclusions: the stretches a performance figure refuses to read. */
export const TRACK_EXCLUSIONS = ['frozen', 'low_speed', 'maneuver_window'] as const

/**
 * The reasons that are a want of a value rather than an exclusion: the Polar off its axis, a blank
 * channel, and the sail overlay's no-verdict reasons, each kept apart from Differs.
 */
export const TRACK_ABSENCES = [
  'no_target',
  'no_polar_version',
  'no_reading',
  'no_chart_version',
  'no_sail_recorded',
  'sail_unnamed',
  'no_chart_cell',
] as const

/** The two edges of the window the recording never reached, which the map has nothing to draw in. */
export const WINDOW_EDGES = ['before_first_row', 'after_last_row'] as const

/**
 * Each reason a stretch carries no colour, as a sailor would say it — kept one per reason, so a
 * sail the chart has no word for never reads as a sail that differed from it (ADR 0023).
 */
export const UNCOLOURED_WORDS: Readonly<Record<TrackUncolouredReason, string>> = {
  frozen: 'inside a dropout, where every value is a copy of the reading before it',
  low_speed: 'below the speed gate: parked, drifting or in irons',
  maneuver_window: 'mid-manoeuvre',
  no_target: 'in range of nothing the Polar can answer',
  no_polar_version: 'in a race that records no Polar Version',
  no_reading: 'with this channel left blank',
  no_chart_version: 'in a race that records no Crossover Chart Version',
  no_sail_recorded: 'with no sail written down',
  sail_unnamed: 'with a sail the chart has no word for',
  no_chart_cell: 'at an angle or wind speed below the chart’s own axes',
  no_position: 'with no position logged, so drawn nowhere',
  before_first_row: 'before the recording’s first reading',
  after_last_row: 'after the recording’s last reading',
}

/** How long an overlay left uncoloured for any of `reasons`. */
export function uncolouredFor(
  time: TrackOverlayTime,
  reasons: readonly TrackUncolouredReason[]
): number {
  return time.uncoloured
    .filter((part) => reasons.includes(part.reason))
    .reduce((total, part) => total + part.seconds, 0)
}

/** What the timing reads of a row: the map's own facts, and whether the map has a fix to draw. */
export interface TimedRow {
  facts: TrackRowFacts
  positioned: boolean
}

/** One stretch of the window, and the row whose state it carries. Null at the window's edges. */
interface Span {
  from: string
  to: string
  seconds: number
  row: TimedRow | null
  edge: 'before_first_row' | 'after_last_row' | null
}

/** A span's state on one overlay: a band, or the reason it has none. */
type SpanState =
  | { band: TrackBandToken; reason: null; flagged: boolean }
  | { band: null; reason: TrackUncolouredReason; flagged: false }

function stateOf(overlay: TrackOverlay, span: Span, hasPolar: boolean): SpanState {
  if (span.row === null) return { band: null, reason: span.edge ?? 'no_position', flagged: false }

  const paint = overlayPaint(overlay, span.row.facts, hasPolar)

  if (paint.band === null) {
    // `not_scored` is set exactly when `band` is null (`TrackPaint`).
    return { band: null, reason: paint.not_scored as TrackUncolouredReason, flagged: false }
  }
  // Coloured by the rules, and drawn nowhere: a row that logged no position is in no part of the
  // picture, so the map coloured none of its time.
  if (!span.row.positioned) return { band: null, reason: 'no_position', flagged: false }

  return { band: paint.band, reason: null, flagged: paint.flagged }
}

/**
 * The window as consecutive spans: the lead edge, each row's arrival interval, the tail edge.
 *
 * Without a window, the rows' own span — which is what a caller with no Race Window has.
 */
function spansOf(rows: readonly TimedRow[], window: RaceWindow | null): Span[] {
  const first = rows[0].facts.row_time
  const last = rows[rows.length - 1].facts.row_time
  const start = window?.window_start ?? first
  const finish = window?.window_finish ?? last
  const spans: Span[] = []

  const lead = wallClockSeconds(first) - wallClockSeconds(start)
  if (lead > 0) spans.push({ from: start, to: first, seconds: lead, row: null, edge: 'before_first_row' })

  for (let index = 1; index < rows.length; index += 1) {
    const from = rows[index - 1].facts.row_time
    const to = rows[index].facts.row_time
    const seconds = wallClockSeconds(to) - wallClockSeconds(from)
    // A clock stepping backwards is not a duration, and two rows on one stamp share no time.
    if (seconds > 0) spans.push({ from, to, seconds, row: rows[index], edge: null })
  }

  const tail = wallClockSeconds(finish) - wallClockSeconds(last)
  if (tail > 0) spans.push({ from: last, to: finish, seconds: tail, row: null, edge: 'after_last_row' })

  return spans
}

function overlayTime(overlay: TrackOverlay, spans: readonly Span[], hasPolar: boolean): TrackOverlayTime {
  const bands = TRACK_SCALES[overlay].bands.map((step) => ({
    band: step.band,
    seconds: 0,
    filler_anchored_seconds: 0,
  }))
  const uncoloured = new Map<TrackUncolouredReason, number>()

  for (const span of spans) {
    const state = stateOf(overlay, span, hasPolar)

    if (state.band === null) {
      uncoloured.set(state.reason, (uncoloured.get(state.reason) ?? 0) + span.seconds)
      continue
    }

    const band = bands.find((step) => step.band === state.band)
    if (band === undefined) continue
    band.seconds += span.seconds
    if (state.flagged) band.filler_anchored_seconds += span.seconds
  }

  const parts = [...uncoloured.entries()]
    .map(([reason, seconds]) => ({ reason, seconds }))
    .sort((left, right) => right.seconds - left.seconds)

  return {
    bands,
    coloured_seconds: bands.reduce((total, band) => total + band.seconds, 0),
    filler_anchored_seconds: bands.reduce((total, band) => total + band.filler_anchored_seconds, 0),
    uncoloured_seconds: parts.reduce((total, part) => total + part.seconds, 0),
    uncoloured: parts,
  }
}

/** Consecutive spans in one state, merged: a band and a reason never share a run. */
function overlayRuns(overlay: TrackOverlay, spans: readonly Span[], hasPolar: boolean): TrackRun[] {
  const runs: TrackRun[] = []

  for (const span of spans) {
    const state = stateOf(overlay, span, hasPolar)
    const previous = runs[runs.length - 1]
    const filler = state.flagged ? span.seconds : 0

    if (previous !== undefined && previous.band === state.band && previous.reason === state.reason) {
      previous.to = span.to
      previous.seconds += span.seconds
      previous.filler_anchored_seconds += filler
      continue
    }

    runs.push({
      from: span.from,
      to: span.to,
      seconds: span.seconds,
      band: state.band,
      reason: state.reason,
      filler_anchored_seconds: filler,
    })
  }

  return runs
}

/**
 * Every overlay's time and runs over one window.
 *
 * `rows` are the window's rows in file order, as the map draws them, and never empty: a window with
 * no row has no track to time. `hasPolar` is `overlayPaint`'s own argument.
 */
export function trackTimeline(
  rows: readonly TimedRow[],
  hasPolar: boolean,
  window: RaceWindow | null
): { time: TrackHeatmapTime; runs: Record<TrackOverlay, TrackRun[]> } {
  const spans = spansOf(rows, window)
  const start = window?.window_start ?? rows[0].facts.row_time
  const finish = window?.window_finish ?? rows[rows.length - 1].facts.row_time

  const each = <T>(of: (overlay: TrackOverlay) => T): Record<TrackOverlay, T> =>
    Object.fromEntries(TRACK_OVERLAYS.map((overlay) => [overlay, of(overlay)])) as Record<TrackOverlay, T>

  return {
    time: {
      window_seconds: wallClockSeconds(finish) - wallClockSeconds(start),
      overlays: each((overlay) => overlayTime(overlay, spans, hasPolar)),
    },
    runs: each((overlay) => overlayRuns(overlay, spans, hasPolar)),
  }
}

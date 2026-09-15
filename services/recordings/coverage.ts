/**
 * What a race covers, and what it has to say about itself.
 *
 * A race page states its coverage **in time and never in rows** (ADR 0009, ADR 0014). "6,337 rows"
 * cannot be checked against anything: it is meaningless without the cadence, it counts a dead
 * feed's verbatim copies as evidence, and one archive race is 49.8% fabricated while looking
 * complete by that measure. Minutes can be held against a sailor's memory of the afternoon.
 *
 * Nothing here is stored. Every figure is a function of a window and of rows that cannot change,
 * so it is recomputed at read — which is what lets the Dropout detector's gates move without a
 * migration, and what makes a note a redeploy rather than stale text in a column.
 *
 * All arithmetic is in the recording's own naive frame, in absolute seconds.
 */

import type { RaceWindowSeconds } from '@/services/recordings/race-window'
import { insideRaceWindow, rowsInWindow } from '@/services/recordings/race-window'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  DateOrderEvidence,
  RaceCoverage,
  RaceFinding,
  RecordingProvenance,
  RowQuality,
  TranscriptionQuality,
} from '@/types'

/** All coverage needs of a row: when it was, and whether its values were a copy. */
export interface CoverageRow {
  seconds: number
  frozen: boolean
}

/** Row Quality over a whole recording, as the rows coverage measures. */
export function coverageRowsFrom(quality: TranscriptionQuality): CoverageRow[] {
  return quality.rows.map((row) => ({
    seconds: wallClockSeconds(row.row_time),
    frozen: row.frozen,
  }))
}

/**
 * How much of a window the recording covers, split four ways.
 *
 * Hand this the **whole** recording; the window is applied here, by the same inclusive rule as
 * `withinRaceWindow`, so there is one definition of "inside" rather than two.
 *
 * The four figures partition the window exactly — `lead + live + frozen + tail === window` — which
 * is the property that makes stating all four honest rather than four numbers that happen to be
 * nearby. Each interval between consecutive rows is attributed by its *later* row: if that row's
 * values are a copy, no fresh reading arrived during the interval, so the time is frozen rather
 * than live.
 *
 * The one thing that breaks the partition is a naive clock stepping backwards, which is what an
 * autumn fall-back hour does. A negative interval averaged in would shorten the race and clamped
 * to zero would invent a duration, so it is counted in `backwards_steps` and excluded — and the
 * count is on the record precisely so a reader knows the four no longer sum.
 */
export function raceCoverage(
  rows: readonly CoverageRow[],
  window: RaceWindowSeconds
): RaceCoverage {
  const seconds = rows.map((row) => row.seconds)
  const { first, last, count } = rowsInWindow(seconds, window)

  if (count === 0) {
    // Refused before it ever reaches a race, but a page reading a window out of a URL is not the
    // wizard. Entirely a gap, all of it before the rows that never came — and no division by a
    // row count that is zero.
    return {
      window_seconds: window.finish - window.start,
      lead_gap_seconds: window.finish - window.start,
      tail_gap_seconds: 0,
      live_seconds: 0,
      frozen_seconds: 0,
      backwards_steps: 0,
      row_count: 0,
      median_interval_seconds: null,
    }
  }

  // In file order, which is the order the durations run in.
  const inside = rows.filter((row) => insideRaceWindow(row.seconds, window))

  const intervals: number[] = []
  let live = 0
  let frozen = 0
  let backwards = 0
  for (let at = 1; at < inside.length; at += 1) {
    const delta = inside[at].seconds - inside[at - 1].seconds
    if (delta < 0) {
      backwards += 1
      continue
    }
    intervals.push(delta)
    if (inside[at].frozen) frozen += delta
    else live += delta
  }

  return {
    window_seconds: window.finish - window.start,
    // Edges are measured to the earliest and latest row by *time*, which is what "its last row"
    // means to a sailor even where the file's last in-window row is not it.
    lead_gap_seconds: seconds[first] - window.start,
    tail_gap_seconds: window.finish - seconds[last],
    live_seconds: live,
    frozen_seconds: frozen,
    backwards_steps: backwards,
    row_count: count,
    median_interval_seconds: medianOf(intervals),
  }
}

/**
 * The middle of a sorted list, or null where there is nothing to take a middle of.
 *
 * The median and not the mean, because one dropout of an hour would drag a mean past every real
 * interval in the recording and make the cadence look like something no row ever arrived at.
 */
function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * A duration as a sailor states one.
 *
 * Seconds are dropped above an hour: nobody reads a distance race to the second, and "1h 23m 15s"
 * implies a precision the cadence does not have. Below a minute they are all there is.
 */
export function describeDuration(seconds: number): string {
  const whole = Math.abs(Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60

  const sign = seconds < 0 ? '-' : ''
  if (hours > 0) return `${sign}${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
  if (minutes > 0) return `${sign}${minutes}m${rest > 0 ? ` ${rest}s` : ''}`
  return `${sign}${rest}s`
}

/** A share of a whole as a percentage a sailor can read, rounded to a whole point. */
function share(part: number, whole: number): string {
  if (whole <= 0) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * What the file itself is worth saying, before any window exists.
 *
 * Every one of these is a **note** but one, and the exception is the duplicate content hash, which
 * is a **confirmation**: the same bytes twice is nearly always a mistake and is occasionally
 * deliberate — one race logged on two boats — so it stops and asks rather than refusing (ADR 0009).
 * There is no path from here to a refusal. The only two of those are the parse's and the window's,
 * and a note that blocked would be a third rule nobody agreed to.
 */
export function recordingFindings(input: {
  provenance: RecordingProvenance
  /** Assessed over the whole Transcription. */
  quality: TranscriptionQuality
  date_order_evidence: DateOrderEvidence
  /** Recordings already in the archive with these same bytes. */
  duplicate_filenames: readonly string[]
}): RaceFinding[] {
  const { provenance, quality, date_order_evidence, duplicate_filenames } = input
  const findings: RaceFinding[] = []

  if (duplicate_filenames.length > 0) {
    findings.push({
      severity: 'confirmation',
      message:
        `These are byte for byte the same as ${duplicate_filenames.join(', ')}, already in the ` +
        'archive. Upload it again only if this really is a second race from the same log.',
    })
  }

  if (provenance.median_cadence_seconds !== null) {
    findings.push({
      severity: 'note',
      message:
        `Rows arrive about every ${describeDuration(provenance.median_cadence_seconds)}. ` +
        'Every rate on this page is measured from the recorded times rather than assumed.',
    })
  }

  if (
    provenance.largest_gap_seconds !== null &&
    provenance.median_cadence_seconds !== null &&
    provenance.largest_gap_seconds > provenance.median_cadence_seconds * 4
  ) {
    findings.push({
      severity: 'note',
      message:
        `The longest gap between two rows is ${describeDuration(provenance.largest_gap_seconds)}. ` +
        'Nothing was recorded across it, so nothing is drawn across it either.',
    })
  }

  if (provenance.backwards_steps > 0) {
    findings.push({
      severity: 'note',
      message:
        `The recording's clock steps backwards ${provenance.backwards_steps} ` +
        `${provenance.backwards_steps === 1 ? 'time' : 'times'}. Layline reads it exactly as the ` +
        'file wrote it rather than converting it, so those steps are visible instead of hidden.',
    })
  }

  if (provenance.dead_channels.length > 0) {
    findings.push({
      severity: 'note',
      message:
        `No value anywhere in ${provenance.dead_channels.join(', ')}. A chart of one of those is ` +
        'empty because the boat never fed it, not because the race was quiet.',
    })
  }

  if (provenance.constant_channels.length > 0) {
    findings.push({
      severity: 'note',
      message:
        'One value throughout in ' +
        provenance.constant_channels
          .map((channel) => `${channel.column} (${channel.value})`)
          .join(', ') +
        '.',
    })
  }

  if (quality.dropout_channels.length === 0) {
    findings.push({
      severity: 'note',
      message:
        'This recording carries nothing to compare row to row, so a dead instrument feed could ' +
        'not be looked for at all. That is not the same as finding none.',
    })
  }

  if (date_order_evidence === 'assumed') {
    findings.push({
      severity: 'note',
      message:
        'Every day and month in this file is 12 or below, so the file cannot say which comes ' +
        'first. Month-first is assumed. Check the dates below before saving.',
    })
  }

  return findings
}

/**
 * The two Row Quality flags a window's notes are counted from, and the gate one of them names.
 *
 * A narrower shape than `TranscriptionQuality`, which it is a structural subset of, so the race
 * page passes its assessment straight in. It exists for the wizard: the client has `RaceChartSeries`
 * and never the Transcription, so it can supply these flags row for row but has no `row_time` or
 * `gap_seconds` to fill in. Widening the parameter is what lets both sides call one function
 * instead of the wizard growing a second, shorter list of notes that would read as a cleaner race.
 */
export interface WindowQuality {
  low_speed_sog_knots: number
  rows: readonly Pick<RowQuality, 'not_water_referenced' | 'low_speed'>[]
}

/**
 * Whether an edge gap is a thing that happened, or just where the handle landed.
 *
 * A drag is deliberately unsnapped, so an ordinary finish lands *between* two rows and leaves a gap
 * of up to one sampling interval at each end. Telling a sailor "the logger was stopped before the
 * race was over" about 12 seconds of a 30-second cadence would be a note on nearly every race, and
 * a note that fires on nearly every race trains them to skip the list. Above the cadence the gap is
 * a stretch of the race with no rows in it, which is the thing worth saying — 08-22-26-glr's window
 * finishes 1,155 seconds after its last row, and that is a logger stopped on the dock.
 *
 * Exported because the coverage readout has to draw the same line: below the cadence it states the
 * figure without the sentence, since the arithmetic is true either way and only the reading is not.
 */
export function statesAGap(gap: number, coverage: RaceCoverage): boolean {
  if (gap <= 0) return false
  // Nothing to compare against: one row in the window, or none. The gap is all there is to say.
  if (coverage.median_interval_seconds === null) return true

  return gap > coverage.median_interval_seconds
}

/**
 * What the chosen window is worth saying, once there is one.
 *
 * Shares of *time*, throughout. A window with a clean feed and rows either side of it produces
 * nothing at all, which is the point: a note is something to know, and eight of them on every race
 * would train the sailor to skip the list.
 */
export function windowFindings(
  coverage: RaceCoverage,
  /** Row Quality filtered to the window. */
  quality: WindowQuality
): RaceFinding[] {
  const findings: RaceFinding[] = []

  if (coverage.frozen_seconds > 0) {
    findings.push({
      severity: 'note',
      message:
        `${describeDuration(coverage.frozen_seconds)} of this window — ` +
        `${share(coverage.frozen_seconds, coverage.window_seconds)} of it — is a verbatim copy of ` +
        'the row before, which is an instrument feed that had died rather than a boat sitting ' +
        'still. Those stretches are ringed on the map and hatched on the chart.',
    })
  }

  if (statesAGap(coverage.lead_gap_seconds, coverage)) {
    findings.push({
      severity: 'note',
      message:
        `The recording's first row inside this window is ${describeDuration(
          coverage.lead_gap_seconds
        )} after the start, so that much of the race was never recorded.`,
    })
  }

  if (statesAGap(coverage.tail_gap_seconds, coverage)) {
    findings.push({
      severity: 'note',
      message:
        `The recording's last row is ${describeDuration(
          coverage.tail_gap_seconds
        )} before the finish — the logger was stopped before the race was over. The window is the ` +
        'race; the recording just does not reach the end of it.',
    })
  }

  const notWaterReferenced = quality.rows.filter((row) => row.not_water_referenced).length
  if (notWaterReferenced > 0 && quality.rows.length > 0) {
    findings.push({
      severity: 'note',
      message:
        `${share(notWaterReferenced, quality.rows.length)} of this window has no STW or CTW, so ` +
        'its wind figures were computed from GPS rather than measured through the water. They ' +
        'mean something different from their neighbours and are washed blue.',
    })
  }

  const lowSpeed = quality.rows.filter((row) => row.low_speed).length
  if (lowSpeed > 0 && quality.rows.length > 0) {
    findings.push({
      severity: 'note',
      message:
        `${share(lowSpeed, quality.rows.length)} of this window is below ` +
        `${quality.low_speed_sog_knots} knots over the ground. Wind angles are unreliable at ` +
        'that speed, whether or not the feed was alive.',
    })
  }

  if (coverage.backwards_steps > 0) {
    findings.push({
      severity: 'note',
      message:
        `The clock steps backwards ${coverage.backwards_steps} ` +
        `${coverage.backwards_steps === 1 ? 'time' : 'times'} inside this window, so the four ` +
        'coverage figures above do not add up to its length. Those steps are counted rather than ' +
        'measured, because a negative interval is not a duration.',
    })
  }

  return findings
}

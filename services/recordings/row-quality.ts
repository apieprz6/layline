/**
 * Row Quality and Gap Seconds, computed over a Transcription.
 *
 * This is the projection that stops a race page presenting a dead instrument feed as a clean
 * track. When the NMEA feed dies, qtVlm keeps writing rows on schedule with the last known fix
 * repeated verbatim — position is sticky state it needs in order to draw the boat, while the
 * instrument channels expire and log as blank. There is no gap in the timeline, so a **Dropout**
 * is invisible to anything that trusts timestamps: one archive race is 49.8% fabricated and
 * looks complete.
 *
 * Nothing here is stored (ADR 0008 ruling 2, ADR 0009). The constants below are a first guess at
 * values that will move, and the detector's rulings changed for 829 rows in a single upstream
 * commit; computed, that is a redeploy, and stored it would have been a migration.
 */

import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { DropoutChannel, RowQuality, TranscriptionQuality } from '@/types'

/**
 * The `SOG` a row is **Low-Speed** below, in knots.
 *
 * Gated on GPS speed rather than `STW` because paddlewheel calibration varies between sessions
 * while GPS speed is verifiable. It is emphatically not a dropout test: 856 of the archive's 870
 * in-window frozen rows sit at or above this figure, because the feed latched at a sailing speed.
 */
export const LOW_SPEED_SOG_KNOTS = 2

/**
 * How many verbatim repeats a run needs before it is a **Dropout**.
 *
 * One duplicate is a boat parked in a hole — the smallest move the archive recorded below 1.5
 * knots is 0.78m, and a single 30-second sample can round to none at all. Two is a feed that
 * stopped. They are counted rather than required to be adjacent, because a blank sample between
 * two of them is not evidence that the boat moved.
 */
export const DROPOUT_MIN_ROWS = 2

/**
 * Which rules produced a set of figures, so a page can say.
 *
 * Bump this whenever a constant above or a rule below changes. A race page shows recomputed
 * numbers and nothing warns a reader that yesterday's screenshot was computed differently.
 */
export const ROW_QUALITY_DETECTOR_VERSION = 'row-quality/1'

/**
 * The four channels a Dropout freezes together, and the reason the test wants all of them: qtVlm
 * repeats the last fix wholesale. A boat drifting on a stopped log holds course and speed while
 * its position moves, and that is a reading.
 */
const DROPOUT_CHANNELS: readonly DropoutChannel[] = ['latitude', 'longitude', 'cog', 'sog']

/**
 * The two without which there is no detection at all.
 *
 * Position is what makes the run conclusive — ten decimal places identical twice over is not a
 * boat — and `SOG` alone is not evidence of anything, since two consecutive samples of 5.1 knots
 * is an ordinary afternoon.
 */
const REQUIRED_DROPOUT_CHANNELS: readonly DropoutChannel[] = ['latitude', 'longitude']

/** What one row says about whether the feed that wrote it was still alive. */
type Evidence =
  /** A channel present in both rows changed, so something was still being measured. */
  | 'moved'
  /** Every compared channel repeats the row above verbatim. */
  | 'repeated'
  /** Nothing changed and not everything was there to compare: no evidence either way. */
  | 'silent'

/**
 * The fields Row Quality reads. `TranscriptionRow` satisfies it, which is what callers hand over;
 * it is written as its own interface so this module cannot quietly grow a dependency on a channel
 * it has no rule about.
 *
 * Every value is text, exactly as the file wrote it, so a repeat is compared verbatim rather than
 * as a number. The two agree on all 6,337 rows of the archive — a latched feed writes the same
 * bytes — and verbatim is the comparison that makes no claim about what the text means.
 */
export interface QualityAssessableRow {
  row_index: number
  row_time: string
  latitude: string | null
  longitude: string | null
  cog: string | null
  sog: string | null
  stw: string | null
  ctw: string | null
}

/** A Race Window, in the recording's own naive wall clock. The `races` columns, by their names. */
export interface RaceWindow {
  window_start: string
  window_finish: string
}

/**
 * Which of the four channels this recording feeds at all.
 *
 * A channel absent from the header and a channel blank in every row are the same fact — nothing
 * to compare — and a recording is not required to carry all four: the parser accepts an export
 * whose header is `Date;Longitude;Latitude;SOG;HEEL;RUDDER;TRIM;LEEWAY`, with no `COG` anywhere.
 * Comparing the three such a file does feed is the strongest test available on it, and silently
 * comparing a column it never wrote would report a dead feed as a clean track forever.
 */
function comparableChannels(rows: readonly QualityAssessableRow[]): DropoutChannel[] {
  const carried = DROPOUT_CHANNELS.filter((channel) => rows.some((row) => row[channel] !== null))

  // Without position there is nothing conclusive left, so nothing is claimed. A page reads the
  // empty list and says detection was not possible rather than reading zero dropouts as good news.
  return REQUIRED_DROPOUT_CHANNELS.every((channel) => carried.includes(channel)) ? carried : []
}

/**
 * What `row` says about the feed, next to the row above it.
 *
 * A blank breaks nothing and confirms nothing. An empty field is the instrument saying nothing
 * (ADR 0008), and treating it as a change would end a Dropout every time one channel dropped a
 * sample — which is how a five-row latch with one blank `SOG` in it reports a spotless track.
 */
function evidenceFrom(
  row: QualityAssessableRow,
  previous: QualityAssessableRow,
  channels: readonly DropoutChannel[]
): Evidence {
  let repeated = 0

  for (const channel of channels) {
    const value = row[channel]
    const before = previous[channel]
    if (value === null || before === null) continue
    if (value !== before) return 'moved'
    repeated += 1
  }

  return repeated === channels.length ? 'repeated' : 'silent'
}

/**
 * Row Quality and Gap Seconds for the rows given, in their order.
 *
 * Hand this the **whole** Transcription and filter afterwards with `withinRaceWindow`. Clipping
 * first is cheaper and strictly worse: it is what has been hiding one archive recording's 146
 * frozen rows, all of which fall after its finish, and it costs another recording the frozen row
 * whose first in-window sample genuinely repeats the row before the start.
 */
export function assessRowQuality(rows: readonly QualityAssessableRow[]): TranscriptionQuality {
  const channels = comparableChannels(rows)

  // Marked in two passes, because a repeat only becomes Frozen once the run it sits in is known:
  // one row cannot say yet whether it began a Dropout or was a boat briefly not moving.
  //
  // The first row has nothing above it to repeat, and a recording with nothing comparable in it
  // says nothing about any of its rows — both read as movement, which starts no run.
  const evidence: Evidence[] = rows.map((row, index) =>
    index > 0 && channels.length > 0 ? evidenceFrom(row, rows[index - 1], channels) : 'moved'
  )

  const frozen = rows.map(() => false)
  let runStart = 0
  let repeated = 0
  for (let index = 0; index <= evidence.length; index += 1) {
    // A run ends only on evidence of movement: a blank channel is not that, so a Dropout with a
    // sample missing out of the middle of it stays one Dropout.
    if (index < evidence.length && evidence[index] !== 'moved') {
      if (evidence[index] === 'repeated') repeated += 1
      continue
    }
    // Verbatim repeats are the positive evidence, so the minimum run counts those and not the
    // rows that merely failed to contradict them. Everything in the run sits inside the Dropout.
    if (repeated >= DROPOUT_MIN_ROWS) {
      for (let at = runStart; at < index; at += 1) frozen[at] = true
    }
    runStart = index + 1
    repeated = 0
  }

  const assessed: RowQuality[] = []
  // The last row that was measured rather than repeated, which is what Gap Seconds is measured
  // from. Row 1 never repeats anything, so only the first row in hand is ever without one.
  let lastLiveSeconds: number | null = null

  rows.forEach((row, index) => {
    const seconds = wallClockSeconds(row.row_time)

    assessed.push({
      row_index: row.row_index,
      row_time: row.row_time,
      frozen: frozen[index],
      // The stored generated column's predicate, expressed once more over text. `STW` and `CTW`
      // are what makes the wind columns a measurement rather than a GPS calculation.
      not_water_referenced: row.stw === null || row.ctw === null,
      // Computed independently of `frozen`, and deliberately not suppressed on a frozen row:
      // these are three tests over what was recorded, and a reader consults `frozen` first
      // because it is what says the recorded values are a copy.
      low_speed: row.sog !== null && Number(row.sog) < LOW_SPEED_SOG_KNOTS,
      // Across the seam of a dropout this is hours, which is the whole point of the field.
      // Negative where a naive clock stepped back an hour, because the recording is never
      // converted out of the sailor's own wall clock to hide that (see `describeRecording`).
      gap_seconds: lastLiveSeconds === null ? null : seconds - lastLiveSeconds,
    })

    if (!frozen[index]) lastLiveSeconds = seconds
  })

  return {
    detector_version: ROW_QUALITY_DETECTOR_VERSION,
    low_speed_sog_knots: LOW_SPEED_SOG_KNOTS,
    dropout_min_rows: DROPOUT_MIN_ROWS,
    dropout_channels: channels,
    rows: assessed,
  }
}

/**
 * The rows inside a Race Window, out of quality already computed over the whole recording.
 *
 * Both bounds are inclusive, matching the window a sailor annotates: a row at the start is in the
 * race. Every figure each row carries was computed before this filter ran, so a dropout that
 * began before the start is still marked and Gap Seconds on the first in-window row measures back
 * across the start rather than restarting at null.
 */
export function withinRaceWindow(
  quality: TranscriptionQuality,
  window: RaceWindow
): TranscriptionQuality {
  const start = wallClockSeconds(window.window_start)
  const finish = wallClockSeconds(window.window_finish)

  return {
    ...quality,
    rows: quality.rows.filter((row) => {
      const seconds = wallClockSeconds(row.row_time)
      return seconds >= start && seconds <= finish
    }),
  }
}

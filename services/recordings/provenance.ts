/**
 * What a recording is, computed from its rows.
 *
 * Which columns the sailor logged, how often the logger fired, where it stopped, and which
 * channels the boat never fed are all facts a race page has to state — and all of them are
 * functions of rows that cannot change, so none of them is a stored column (ADR 0009). A
 * figure in the database would be a second copy to fall out of step with the rows it
 * describes, and a cached cadence is exactly the sort of number that outlives its truth.
 *
 * Everything here takes the rows it is given rather than a recording id, because the figures a
 * race states are about the rows inside its Race Window, not about the whole file. The median
 * cadence of one archive recording is 75 seconds inside its window; nothing may assume 30.
 */

import { DATE_COLUMN, recordedValue } from '@/services/recordings/qtvlm'
import type { RecordingProvenance, TranscriptionRow } from '@/types'

/** Rows in hand and the header they were read under. A whole Transcription satisfies this. */
export interface DescribableRecording {
  source_columns: string[]
  rows: TranscriptionRow[]
}

const NAIVE_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

/**
 * A naive stamp as seconds, for subtracting one from another.
 *
 * `Date.UTC` is the arithmetic and not a timezone claim: it is the one frame in which an hour
 * is always an hour, so an interval measured across a daylight-saving change is the interval
 * the sailor's own clock showed. Reading these stamps as local time would make a 30-second
 * cadence read as 3,630 seconds once a year.
 */
function wallClockSeconds(row_time: string): number {
  const match = NAIVE_TIMESTAMP.exec(row_time)
  if (!match) {
    throw new TypeError(`row_time is not a naive timestamp: ${JSON.stringify(row_time)}`)
  }
  const [, year, month, day, hour, minute, second] = match.map(Number)
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000
}

/** The middle value, or the mean of the middle pair. Null when there is nothing to take. */
function median(values: number[]): number | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The format and cadence figures for whatever rows are in hand. */
export function describeRecording(recording: DescribableRecording): RecordingProvenance {
  const { source_columns, rows } = recording

  const seconds = rows.map((row) => wallClockSeconds(row.row_time))
  // Between consecutive rows as recorded, so the file's own order is what is measured.
  const intervals = seconds.slice(1).map((at, index) => at - seconds[index])

  const dead_channels: string[] = []
  const constant_channels: { column: string; value: string }[] = []

  for (const column of source_columns) {
    // The Date is every row's identity rather than a channel, so it is neither dead nor
    // constant in any sense worth reporting.
    if (column === DATE_COLUMN) continue

    const distinct = new Set<string>()
    let present = 0
    for (const row of rows) {
      const value = recordedValue(row, column)
      if (value === null) continue
      present += 1
      distinct.add(value)
    }

    if (present === 0) {
      dead_channels.push(column)
      continue
    }
    // A channel is only constant if it reported in every row: one that reported the same
    // figure twice and nothing the rest of the time is a gappy channel, not a constant one.
    // And a single row makes every channel constant, which says nothing about any of them.
    if (rows.length > 1 && present === rows.length && distinct.size === 1) {
      constant_channels.push({ column, value: [...distinct][0] })
    }
  }

  return {
    column_set: source_columns,
    row_count: rows.length,
    median_cadence_seconds: median(intervals),
    largest_gap_seconds: intervals.length === 0 ? null : Math.max(...intervals),
    span_seconds: seconds.length === 0 ? null : Math.max(...seconds) - Math.min(...seconds),
    dead_channels,
    constant_channels,
  }
}

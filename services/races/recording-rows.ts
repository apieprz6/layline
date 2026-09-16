/**
 * A stored Transcription, read whole, a page at a time.
 *
 * Extracted because two screens need the same rows and neither may have a different version of them.
 * A race's own page derives Row Quality, Coverage and Gap Seconds from these rows at read (ADR 0009);
 * amending that race draws the very same rows as charts so the sailor can move the window against
 * them. Two copies of this read would eventually disagree, and the disagreement would show up as a
 * window a sailor cropped on one picture and Layline scored against another.
 *
 * The rows are read, never written. Nothing in this module — and no path in the app — sends a value
 * back to `recording_rows`: the Transcription is what the file said, and an amendment is what the
 * sailor said about it (ADR 0010, and its Amendment 1).
 */

import type { createClient } from '@/lib/supabase/server'
import type { QualityAssessableRow } from '@/services/recordings/row-quality'

/**
 * One row of a Transcription as everything downstream of this module needs it.
 *
 * Row Quality's eight fields, and the three channels the charts draw beside SOG. Eleven of a
 * Transcription's twenty-one columns, and the other ten are read by nobody here — a Transcription is
 * stored whole and consulted narrowly, which is the difference between keeping a file and using it.
 */
export interface RecordedRow extends QualityAssessableRow {
  /** Also the channel the mean logged wind is derived from, for the Wind Band finding. */
  tws: string | null
  /** `TWA`, signed negative to port — never `TWA (calc)`, which Layline stores and reads nowhere. */
  twa: string | null
  /** `AWA (calc)`: the boat never measured it, and the column's name is the provenance (ADR 0008). */
  awa_calc: string | null
}

/**
 * The eleven fields, cast to `text`.
 *
 * The cast is not decoration. Left as JSON numbers these would arrive as JavaScript doubles, and a
 * Dropout is found by comparing a row against the one above it *verbatim* — `20.10` and `20.1` are
 * one double and two different things a file said. The `::text` keeps what Postgres holds, which by
 * `qtvlm.ts`'s round trip is what the file wrote.
 */
export const RECORDED_ROW_SELECT =
  'row_index, row_time, latitude::text, longitude::text, cog::text, sog::text, stw::text, ctw::text, ' +
  'tws::text, twa::text, awa_calc::text'

/** PostgREST's own default ceiling on a response, which is what makes paging necessary at all. */
const PAGE_ROWS = 1000

/**
 * A cast column, as the cast promises it: text, or absent.
 *
 * A number here means the `::text` in `RECORDED_ROW_SELECT` stopped being honoured, which would turn
 * every verbatim comparison into a comparison of doubles quietly. Throwing makes that a failed page
 * with a line in the log instead of Row Quality that is subtly wrong forever.
 */
function recordedText(value: unknown, column: string, rowIndex: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value

  throw new TypeError(
    `${column} of row ${rowIndex} came back as ${typeof value}; the ::text cast in ` +
      'RECORDED_ROW_SELECT is what keeps a recorded value comparable verbatim'
  )
}

/**
 * The whole Transcription, or null when it could not be read in full.
 *
 * All-or-nothing, and that is the whole reason this pages. A race is at most a few thousand rows, but
 * PostgREST caps a response at 1,000 by default, and a silently truncated Transcription would produce
 * a coverage figure that looked fine and described a third of the race — so the row count is checked
 * against the Recording's own, and a disagreement returns null rather than a shorter race.
 *
 * Ordered by `row_index`, which is file order and half the primary key, so the pages join back into
 * the file rather than into whatever order the planner liked.
 */
export async function readRecordingRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number
): Promise<RecordedRow[] | null> {
  const rows: RecordedRow[] = []

  // `row_count` is a fact about the file written once and immutable, so this bound is the file's
  // own and cannot loop away on a moving target.
  while (rows.length < rowCount) {
    const { data, error } = await supabase
      .from('recording_rows')
      .select(RECORDED_ROW_SELECT)
      .eq('recording_id', recordingId)
      .order('row_index', { ascending: true })
      .range(rows.length, rows.length + PAGE_ROWS - 1)
      .returns<Record<string, unknown>[]>()

    if (error) {
      console.error('Race: Transcription read failed:', error.message)
      return null
    }

    if (!data || data.length === 0) break

    try {
      for (const row of data) {
        const rowIndex = Number(row.row_index)
        rows.push({
          row_index: rowIndex,
          row_time: String(row.row_time),
          latitude: recordedText(row.latitude, 'latitude', rowIndex),
          longitude: recordedText(row.longitude, 'longitude', rowIndex),
          cog: recordedText(row.cog, 'cog', rowIndex),
          sog: recordedText(row.sog, 'sog', rowIndex),
          stw: recordedText(row.stw, 'stw', rowIndex),
          ctw: recordedText(row.ctw, 'ctw', rowIndex),
          tws: recordedText(row.tws, 'tws', rowIndex),
          twa: recordedText(row.twa, 'twa', rowIndex),
          awa_calc: recordedText(row.awa_calc, 'awa_calc', rowIndex),
        })
      }
    } catch (thrown: unknown) {
      // The cast stopped being honoured, which is a deployment fault and not a bad race. Caught
      // here so it is one line in the log and a not-found page, rather than an exception thrown
      // through a Server Component.
      console.error(
        'Race: a recorded value did not arrive as text:',
        thrown instanceof Error ? thrown.message : thrown
      )
      return null
    }
  }

  if (rows.length !== rowCount) {
    // Either the read was truncated or the Transcription is short of what the Recording claims.
    // Both make every figure derived from it a claim about rows nobody has, so neither is drawn.
    console.error(
      `Race: read ${rows.length} rows of a Transcription the Recording says is ${rowCount}`
    )
    return null
  }

  return rows
}

/**
 * Every recorded row's time, and nothing else.
 *
 * What a Server Action needs to enforce the window's two refusals (ADR 0009), which is a comparison
 * between two stamps and the times the recording actually holds. All of them, deliberately: the point of
 * an amendment is often to reach rows the stored window excludes, so a list cropped to the old window
 * would refuse exactly the correction the sailor came to make.
 *
 * One column rather than eleven. The other ten are read by nobody in this comparison, and paging a few
 * thousand rows of them out of the database to look at a timestamp is a cost with nothing bought.
 *
 * All-or-nothing for `readRecordingRows`'s reason: a truncated list of times would refuse a window over
 * rows that are there, or accept one over rows that are not.
 */
export async function readRecordingRowTimes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number
): Promise<string[] | null> {
  const times: string[] = []

  while (times.length < rowCount) {
    const { data, error } = await supabase
      .from('recording_rows')
      .select('row_time')
      .eq('recording_id', recordingId)
      .order('row_index', { ascending: true })
      .range(times.length, times.length + PAGE_ROWS - 1)
      .returns<{ row_time: string }[]>()

    if (error) {
      console.error('Race: Transcription read failed:', error.message)
      return null
    }

    if (!data || data.length === 0) break

    for (const row of data) times.push(String(row.row_time))
  }

  if (times.length !== rowCount) {
    console.error(
      `Race: read ${times.length} rows of a Transcription the Recording says is ${rowCount}`
    )
    return null
  }

  return times
}

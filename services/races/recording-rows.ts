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
 * Every row of one Recording, in file order, or null when they could not be read in full.
 *
 * The paging and the all-or-nothing are here rather than in each caller because both are properties of
 * the *table* and not of the columns anybody wants from it. PostgREST caps a response at 1,000 rows by
 * default, and a silently truncated Transcription reads as a shorter recording: a coverage figure that
 * looks fine and describes a third of the race, or a window accepted over rows that are not there. So
 * the count is checked against the Recording's own — a fact about the file written once and never
 * updated, which is also why the loop's bound cannot move under it.
 *
 * Ordered by `row_index`, which is file order and half the primary key, so the pages join back into the
 * file rather than into whatever order the planner liked. `row_time` would be a different order on any
 * recording whose naive clock steps back an hour.
 *
 * `select` is the only thing that varies, and each caller shapes its own rows from what comes back.
 */
async function readRecordingPages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number,
  select: string
): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = []

  while (rows.length < rowCount) {
    const { data, error } = await supabase
      .from('recording_rows')
      .select(select)
      .eq('recording_id', recordingId)
      .order('row_index', { ascending: true })
      .range(rows.length, rows.length + PAGE_ROWS - 1)
      .returns<Record<string, unknown>[]>()

    if (error) {
      console.error('Race: Transcription read failed:', error.message)
      return null
    }

    if (!data || data.length === 0) break

    rows.push(...data)
  }

  if (rows.length !== rowCount) {
    // Either the read was truncated or the Transcription is short of what the Recording claims. Both
    // make every figure derived from it a claim about rows nobody has, so neither is drawn.
    console.error(
      `Race: read ${rows.length} rows of a Transcription the Recording says is ${rowCount}`
    )
    return null
  }

  return rows
}

/**
 * The whole Transcription in the eleven columns anything downstream reads, or null.
 *
 * A race's own page derives Row Quality, Coverage and Gap Seconds from these at read (ADR 0009), and the
 * amend flow draws the same rows as charts so a sailor can move the window against them.
 */
export async function readRecordingRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number
): Promise<RecordedRow[] | null> {
  const data = await readRecordingPages(supabase, recordingId, rowCount, RECORDED_ROW_SELECT)

  if (data === null) return null

  try {
    return data.map((row) => {
      const rowIndex = Number(row.row_index)
      return {
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
      }
    })
  } catch (thrown: unknown) {
    // The cast stopped being honoured, which is a deployment fault and not a bad race. Caught here so
    // it is one line in the log and a not-found page, rather than an exception thrown through a Server
    // Component.
    console.error(
      'Race: a recorded value did not arrive as text:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
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
 */
export async function readRecordingRowTimes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number
): Promise<string[] | null> {
  const data = await readRecordingPages(supabase, recordingId, rowCount, 'row_time')

  return data === null ? null : data.map((row) => String(row.row_time))
}

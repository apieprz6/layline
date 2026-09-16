/**
 * Reading a Transcription's row times, whole, for the one thing a Server Action needs them for.
 *
 * `readRecordingRows` is exercised through `readRace` and `readRaceAmendment`, which is where its
 * eleven columns are actually consumed. What is checked here is `readRecordingRowTimes`, the one-column
 * read the amend action asks the window's two refusals against, and the two properties whose failure
 * mode is silent: the paging, and the all-or-nothing.
 *
 * Both matter for the same reason they matter in `readRecordingRows`. PostgREST caps a response at
 * 1,000 rows by default, so an unpaged read of a 1,500-row recording answers with the first two thirds
 * of it and no error — and a window checked against two thirds of a recording refuses a correction over
 * rows that are there, or accepts one over rows that are not. Neither shows up as a fault; both show up
 * as a race scored over the wrong stretch.
 *
 * Nothing here writes, and there is no path that could: the stub answers `select`, `eq`, `order` and
 * `range` and nothing else, so a line that reached for `update` or `delete` fails rather than passing
 * (ADR 0010 — the Transcription is what the file said).
 */

import { readRecordingRowTimes } from '../recording-rows'

/** A stamp `index` cadences after 11:00, in the recording's own naive frame. */
function stamp(index: number): string {
  const total = 11 * 3600 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-08-22T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(
    total % 60
  )}`
}

/**
 * A `recording_rows` that pages exactly as PostgREST would, and remembers how it was asked.
 *
 * `columns` and `ordered` are recorded because the two of them are the whole claim about the query:
 * one column rather than eleven, and file order rather than whatever the planner liked.
 */
function client(options: {
  rows?: { row_time: unknown }[]
  error?: { message: string }
  /** A ceiling the stub applies on top of the range, standing in for PostgREST's own. */
  cap?: number
} = {}) {
  const ranges: [number, number][] = []
  const tables: string[] = []
  let columns: string | null = null
  let ordered: [string, { ascending: boolean }] | null = null

  const supabase = {
    from: (table: string) => {
      tables.push(table)
      return {
        select: (select: string) => {
          columns = select
          return {
            eq: (_column: string, _value: unknown) => ({
              order: (column: string, direction: { ascending: boolean }) => {
                ordered = [column, direction]
                return {
                  range: (fromRow: number, toRow: number) => {
                    ranges.push([fromRow, toRow])
                    return {
                      returns: async () => {
                        if (options.error) return { data: null, error: options.error }

                        const all = options.rows ?? []
                        const ceiling =
                          options.cap === undefined
                            ? toRow + 1
                            : Math.min(toRow + 1, fromRow + options.cap)

                        return { data: all.slice(fromRow, ceiling), error: null }
                      },
                    }
                  },
                }
              },
            }),
          }
        },
      }
    },
  }

  return {
    supabase: supabase as unknown as Parameters<typeof readRecordingRowTimes>[0],
    ranges,
    tables,
    asked: () => ({ columns, ordered }),
  }
}

describe('readRecordingRowTimes', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('pages past PostgREST’s ceiling and joins the pages back into file order', async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => ({ row_time: stamp(index) }))
    const fake = client({ rows, cap: 1000 })

    const times = await readRecordingRowTimes(fake.supabase, 'recording-1', 1500)

    expect(fake.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(times).toHaveLength(1500)
    // The two ends and the row either side of the page boundary: an off-by-one in the paging shows up
    // as a duplicate or a hole at exactly this seam and nowhere else.
    expect(times?.[0]).toBe(stamp(0))
    expect(times?.[999]).toBe(stamp(999))
    expect(times?.[1000]).toBe(stamp(1000))
    expect(times?.[1499]).toBe(stamp(1499))
  })

  it('asks for one column, in file order, of one table', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ row_time: stamp(index) }))
    const fake = client({ rows })

    await readRecordingRowTimes(fake.supabase, 'recording-1', 3)

    // One column, because the other ten are read by nobody in a comparison between two stamps.
    expect(fake.asked().columns).toBe('row_time')
    // `row_index` and not `row_time`: file order is half the primary key, and a naive clock that steps
    // back an hour makes the two different orders.
    expect(fake.asked().ordered).toEqual(['row_index', { ascending: true }])
    expect(fake.tables).toEqual(['recording_rows'])
  })

  it('keeps each stamp exactly as stored, with no clock between', async () => {
    // The digits the instruments showed, in the recording's own naive frame (ADR 0008): a `Date` here
    // would put the reader's offset between the sailor and their own log.
    const fake = client({ rows: [{ row_time: '2026-08-22T11:00:00' }] })

    const times = await readRecordingRowTimes(fake.supabase, 'recording-1', 1)

    expect(times).toEqual(['2026-08-22T11:00:00'])
  })

  it('answers null for a failed read rather than a shorter recording', async () => {
    const fake = client({ error: { message: 'connection reset' } })

    expect(await readRecordingRowTimes(fake.supabase, 'recording-1', 8)).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Race: Transcription read failed:', 'connection reset')
  })

  it('answers null when fewer rows came back than the Recording claims', async () => {
    // The silent failure this exists for. Three rows of an eight-row recording is a window checked
    // against five sixteenths of the race, and nothing about the response says so.
    const rows = Array.from({ length: 3 }, (_, index) => ({ row_time: stamp(index) }))
    const fake = client({ rows })

    expect(await readRecordingRowTimes(fake.supabase, 'recording-1', 8)).toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Race: read 3 rows of a Transcription the Recording says is 8',
    )
  })

  it('asks for nothing at all when the Recording says it has no rows', async () => {
    const fake = client({ rows: [] })

    expect(await readRecordingRowTimes(fake.supabase, 'recording-1', 0)).toEqual([])
    expect(fake.ranges).toEqual([])
  })
})

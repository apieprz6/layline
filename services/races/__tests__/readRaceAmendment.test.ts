/**
 * A stored race, read back into the shape the flow draws — and the three things that read must not do.
 *
 * This is the amend path's answer to `stageRecording`, and the difference between the two is the whole
 * of ADR 0010 Amendment 1: no bytes are opened, no hash is taken, nothing is written to `tmp/`, and the
 * duplicate-content question cannot arise. So the first claim tested here is negative — the tables this
 * read touches, and the fact that nothing about the file's bytes is even selected.
 *
 * The second is the window. The charts get the **whole** Transcription rather than the rows inside the
 * stored window, because the window is the thing about to be moved: a sailor whose start was two minutes
 * late has to see the rows they are moving it onto, and a window cropped to itself cannot be widened.
 *
 * The third is the sharpest, and it is why this read is all-or-nothing. An annotation list that came
 * back empty because the read *failed* would be handed to the flow, the sailor would correct the window,
 * and the one Save would write that empty list over what they had actually said — a failed read turned
 * into deleted Testimony, with nothing to recover it from.
 */

import { readRaceAmendment } from '../readRaceAmendment'

const raceMaybeSingle = jest.fn()

/** What the `races` read asked for, so "nothing about the bytes" is an assertion and not a hope. */
let raceSelect: string | null = null

/** The rows the stubbed `recording_rows` holds, paged over exactly as PostgREST would. */
let stored: Record<string, unknown>[] = []
let pageError: { message: string } | null = null
const ranges: [number, number][] = []

let sailEntries: Record<string, unknown>[] = []
let seaStateEntries: Record<string, unknown>[] = []
let sailError: { message: string } | null = null
let seaStateError: { message: string } | null = null

const range = jest.fn((fromRow: number, toRow: number) => {
  ranges.push([fromRow, toRow])
  return {
    returns: async () =>
      pageError !== null
        ? { data: null, error: pageError }
        : { data: stored.slice(fromRow, toRow + 1), error: null },
  }
})

const annotationTable = (
  rows: () => Record<string, unknown>[],
  failure: () => { message: string } | null
) => ({
  select: () => ({
    eq: () => ({
      order: () => ({
        returns: async () => {
          const error = failure()
          return error !== null ? { data: null, error } : { data: rows(), error: null }
        },
      }),
    }),
  }),
})

const from = jest.fn((table: string) => {
  if (table === 'races') {
    return {
      select: (select: string) => {
        raceSelect = select
        return { eq: () => ({ maybeSingle: raceMaybeSingle }) }
      },
    }
  }
  if (table === 'recording_rows') {
    // No `update`, no `insert`, no `delete`, no `upsert`, and that absence is the test: a line that
    // reached for one would throw here rather than pass (ADR 0010 — the Transcription is immutable).
    return { select: () => ({ eq: () => ({ order: () => ({ range }) }) }) }
  }
  if (table === 'race_sail_entries') {
    return annotationTable(
      () => sailEntries,
      () => sailError
    )
  }
  if (table === 'race_sea_state_entries') {
    return annotationTable(
      () => seaStateEntries,
      () => seaStateError
    )
  }
  throw new Error(`readRaceAmendment asked for an unexpected table: ${table}`)
})

// No `storage` at all: a read that reached for the bucket fails with a TypeError rather than quietly
// opening a file the amendment has no business touching.
const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

/** A stamp `index` half-minutes after 11:00, in the recording's own naive frame. */
function stamp(index: number): string {
  const total = 11 * 3600 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-08-22T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(
    total % 60
  )}`
}

/** A row as the `::text` cast delivers one: every measurement a string, exactly as recorded. */
function dbRow(index: number, values: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    row_index: index,
    row_time: stamp(index),
    latitude: (41.85 + index * 0.0001).toFixed(6),
    longitude: (-87.55 - index * 0.0001).toFixed(6),
    cog: String(10 + index),
    sog: '6.2',
    stw: '6.0',
    ctw: '12',
    tws: '11.0',
    twa: String(40 + index),
    awa_calc: String(30 + index),
    ...values,
  }
}

const EIGHT_ROWS = Array.from({ length: 8 }, (_, index) => dbRow(index))

function raceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'race-1',
    title: 'Verve Cup',
    // Rows 3 to 5 of eight: the recording holds rows on both sides of the window, which is what makes
    // widening it possible at all.
    window_start: stamp(3),
    window_finish: stamp(5),
    polar_version_id: 'polar-v2',
    crossover_chart_version_id: 'chart-v1',
    rig_tune_version_id: 'tune-v3',
    instrument_calibration_version_id: null,
    rig_tune_band_id: 'tune-v3-base',
    recordings: {
      id: 'recording-1',
      first_row_time: stamp(0),
      last_row_time: stamp(7),
      row_count: 8,
    },
    ...overrides,
  }
}

describe('readRaceAmendment', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    raceSelect = null
    ranges.length = 0
    stored = EIGHT_ROWS
    pageError = null
    sailEntries = [{ at: stamp(1), definition_number: 4, note: 'set on the way out' }]
    seaStateEntries = [{ at: stamp(4), sea_state: 'moderate' }]
    sailError = null
    seaStateError = null
    raceMaybeSingle.mockResolvedValue({ data: raceRow(), error: null })
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('hands the flow the race as stored: its window, its five pointers and its Testimony', async () => {
    const amendment = await readRaceAmendment('race-1')

    expect(amendment?.race_id).toBe('race-1')
    expect(amendment?.title).toBe('Verve Cup')
    expect(amendment?.window_start).toBe(stamp(3))
    expect(amendment?.window_finish).toBe(stamp(5))
    // All five, including the null one: *not recorded* is an answer and the flow shows it as one
    // (ADR 0008), rather than defaulting it to whatever is in force now.
    expect(amendment?.setup).toEqual({
      polar_version_id: 'polar-v2',
      crossover_chart_version_id: 'chart-v1',
      rig_tune_version_id: 'tune-v3',
      instrument_calibration_version_id: null,
      rig_tune_band_id: 'tune-v3-base',
    })
  })

  it('carries each annotation exactly as stored, and the Definition number rather than its words', async () => {
    // The words belong to the chart Version (ADR 0023), and the flow is already handed every Version the
    // boat has with its own vocabulary. Resolving them here would give the flow a second list of words
    // that could disagree with the pickers' about the same number.
    sailEntries = [
      { at: stamp(1), definition_number: 4, note: 'set on the way out' },
      { at: stamp(6), definition_number: null, note: 'something the chart does not name' },
      { at: stamp(7), definition_number: 1, note: null },
    ]

    const amendment = await readRaceAmendment('race-1')

    expect(amendment?.sails).toEqual([
      { at: stamp(1), definition_number: 4, note: 'set on the way out' },
      { at: stamp(6), definition_number: null, note: 'something the chart does not name' },
      // Null stays null: a blank field is no note, and the flow turns it into '' for a text input.
      { at: stamp(7), definition_number: 1, note: null },
    ])
    expect(amendment?.sea_state).toEqual([{ at: stamp(4), sea_state: 'moderate' }])
  })

  it('gives the charts the whole Transcription, not the stretch inside the window', async () => {
    // The point of amending: a window cropped to itself cannot be widened, and a sailor moving the
    // start earlier has to be able to see the rows they are moving it onto.
    const amendment = await readRaceAmendment('race-1')

    expect(amendment?.series.row_seconds).toHaveLength(8)
    expect(amendment?.series.first_row_time).toBe(stamp(0))
    expect(amendment?.series.last_row_time).toBe(stamp(7))
    // Two rows before the stored start and two after its finish, all of them drawn.
    expect(amendment?.series.channels.sog.filter((each) => each !== null)).toHaveLength(8)
  })

  it('reads the rows paged against the Recording’s own count', async () => {
    await readRaceAmendment('race-1')

    expect(ranges).toEqual([[0, 999]])
  })

  it('asks for nothing about the file’s bytes, because the amendment cannot touch them', async () => {
    // AC 8, as the shape of the query. The filename and the hash are the two things a path and a
    // duplicate check are made of, and neither question exists on this side of the parse boundary.
    await readRaceAmendment('race-1')

    expect(raceSelect).not.toMatch(/filename/)
    expect(raceSelect).not.toMatch(/content_sha256/)
    expect(raceSelect).not.toMatch(/byte/)
    // What it does need of the Recording: the id that bounds the row read, the count that bounds the
    // paging, and the two stamps the chart axis is padded from.
    expect(raceSelect).toMatch(/recordings!inner\(id, first_row_time, last_row_time, row_count\)/)
  })

  it('touches four tables and no others, and never Storage', async () => {
    await readRaceAmendment('race-1')

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'races',
      'recording_rows',
      'race_sail_entries',
      'race_sea_state_entries',
    ])
  })

  it('refuses the whole amendment when an annotation list could not be read', async () => {
    // The trap this read exists to close. An empty list here is indistinguishable from a race whose
    // sailor recorded nothing, and one Save would make it true.
    sailError = { message: 'connection reset' }

    expect(await readRaceAmendment('race-1')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Amend: annotation read failed:', 'connection reset')
  })

  it('refuses it when the sea state list could not be read either', async () => {
    seaStateError = { message: 'statement timeout' }

    expect(await readRaceAmendment('race-1')).toBeNull()
  })

  it('refuses a Transcription that came back short of what the Recording claims', async () => {
    // A window offered over rows nobody has, saved, is a race scored against a stretch of recording
    // holding a third of it.
    stored = EIGHT_ROWS.slice(0, 3)

    expect(await readRaceAmendment('race-1')).toBeNull()
  })

  it('refuses a Transcription that could not be read at all', async () => {
    pageError = { message: 'connection reset' }

    expect(await readRaceAmendment('race-1')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Race: Transcription read failed:', 'connection reset')
  })

  it('answers null for a race that is not there, and for one this account may not read', async () => {
    // One answer for both, deliberately: `maybeSingle()` cannot tell a missing row from a row RLS hid,
    // and either way there is no race here for this sailor to amend.
    raceMaybeSingle.mockResolvedValue({ data: null, error: null })

    expect(await readRaceAmendment('race-1')).toBeNull()
    // And nothing was read on the strength of a race that is not there.
    expect(from.mock.calls.map(([table]) => table)).toEqual(['races'])
  })

  it('answers null when the race itself could not be read', async () => {
    raceMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    expect(await readRaceAmendment('race-1')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Amend: race read failed:', 'connection reset')
  })

  it('answers null for a stored time the wall clock refuses', async () => {
    // A stamp with an offset, or a fractional second, in a column Layline only ever writes whole naive
    // seconds to: a fault in the archive rather than in the amendment, and still not something to draw
    // a window over.
    stored = [dbRow(0, { row_time: '2026-08-22T11:00:00+05:00' }), ...EIGHT_ROWS.slice(1)]

    expect(await readRaceAmendment('race-1')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Amend: a recorded time is not a naive wall-clock stamp:',
      expect.any(String)
    )
  })

  it('answers null when the Supabase client cannot be made at all', async () => {
    createClient.mockRejectedValueOnce(new Error('no cookies here'))

    expect(await readRaceAmendment('race-1')).toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Amend: Supabase client unavailable:',
      'no cookies here'
    )
  })

  it('reads a race with no title and no Testimony at all as exactly that', async () => {
    // A legal race (ADR 0010): two empty lists and a page that says neither kind was recorded. The flow
    // has to be handed them empty rather than refused, or an untouched race could never be amended.
    raceMaybeSingle.mockResolvedValue({ data: raceRow({ title: null }), error: null })
    sailEntries = []
    seaStateEntries = []

    const amendment = await readRaceAmendment('race-1')

    expect(amendment?.title).toBeNull()
    expect(amendment?.sails).toEqual([])
    expect(amendment?.sea_state).toEqual([])
  })
})

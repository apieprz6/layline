/**
 * What one race page is allowed to state, and what it refuses to state instead of guessing.
 *
 * Two claims here are the reason this file exists rather than the read being checked by eye. Row
 * Quality is assessed over the **whole** Transcription and filtered afterwards, which is the order
 * that finds a dropout beginning before the start — clipping first is cheaper, passes a casual
 * reading, and hid one archive recording's frozen rows. And the read is paged against the
 * Recording's own `row_count`, because a silently truncated Transcription produces a coverage figure
 * that looks fine and describes a third of the race.
 */

import { readRace } from '../readRace'

const raceMaybeSingle = jest.fn()

/** The ranges asked for, in order, so the paging is checked rather than assumed. */
const ranges: [number, number][] = []
/** What the stubbed `recording_rows` holds. Paged over exactly as PostgREST would. */
let stored: Record<string, unknown>[] = []
let pageError: { message: string } | null = null

const range = jest.fn((fromRow: number, toRow: number) => {
  ranges.push([fromRow, toRow])
  return {
    // `.returns<T>()` is a type-level cast in supabase-js and resolves to the same `{ data, error }`.
    returns: async () =>
      pageError !== null
        ? { data: null, error: pageError }
        : { data: stored.slice(fromRow, toRow + 1), error: null },
  }
})

/** The sailor's Testimony, as the two annotation tables hold it. Empty by default. */
let sailEntries: Record<string, unknown>[] = []
let seaStateEntries: Record<string, unknown>[] = []
let annotationError: { message: string } | null = null

/**
 * The vocabulary the Race's own Crossover Chart Version defines, and which Version was asked for.
 *
 * The Version asked for is recorded because that is the claim: the words come from the Version the
 * Race points at, never from whichever chart is current now (ADR 0012).
 */
let definitions: Record<string, unknown>[] = []
let definitionsError: { message: string } | null = null
const versionsAsked: unknown[] = []

/** Both annotation reads have the same shape: select, eq, order, and no paging. */
const annotationTable = (rows: () => Record<string, unknown>[]) => ({
  select: () => ({
    eq: () => ({
      order: () => ({
        returns: async () =>
          annotationError !== null
            ? { data: null, error: annotationError }
            : { data: rows(), error: null },
      }),
    }),
  }),
})

const from = jest.fn((table: string) => {
  if (table === 'races') {
    return { select: () => ({ eq: () => ({ maybeSingle: raceMaybeSingle }) }) }
  }
  if (table === 'recording_rows') {
    return { select: () => ({ eq: () => ({ order: () => ({ range }) }) }) }
  }
  if (table === 'race_sail_entries') {
    return annotationTable(() => sailEntries)
  }
  if (table === 'race_sea_state_entries') {
    return annotationTable(() => seaStateEntries)
  }
  if (table === 'crossover_sail_definitions') {
    return {
      select: () => ({
        eq: (_column: string, value: unknown) => {
          versionsAsked.push(value)
          return {
            returns: async () =>
              definitionsError !== null
                ? { data: null, error: definitionsError }
                : { data: definitions, error: null },
          }
        },
      }),
    }
  }
  throw new Error(`readRace asked for an unexpected table: ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

/** A stamp `n` seconds after 11:00, in the recording's own naive frame. */
function stamp(seconds: number): string {
  const total = 11 * 3600 + seconds
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-08-22T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(
    total % 60
  )}`
}

/** The cadence every fixture below is written at, so a row index is a time. */
const CADENCE_SECONDS = 30

/** A row as the `::text` cast delivers one: every measurement a string, exactly as recorded. */
function dbRow(index: number, values: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    row_index: index,
    row_time: stamp(index * CADENCE_SECONDS),
    latitude: (41.85 + index * 0.0001).toFixed(6),
    longitude: (-87.55 - index * 0.0001).toFixed(6),
    cog: String(10 + index),
    sog: '6.2',
    stw: '6.0',
    ctw: '12',
    ...values,
  }
}

/**
 * Eight rows whose 3rd, 4th and 5th repeat the 2nd verbatim: a Dropout that **begins before** the
 * window below starts, which is the case the assessment order exists for.
 */
const LATCHED_FEED: Record<string, unknown>[] = [
  dbRow(0),
  dbRow(1),
  dbRow(2, { latitude: dbRow(1).latitude, longitude: dbRow(1).longitude, cog: dbRow(1).cog }),
  dbRow(3, { latitude: dbRow(1).latitude, longitude: dbRow(1).longitude, cog: dbRow(1).cog }),
  dbRow(4, { latitude: dbRow(1).latitude, longitude: dbRow(1).longitude, cog: dbRow(1).cog }),
  dbRow(5),
  dbRow(6),
  dbRow(7),
]

function raceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'race-1',
    title: 'Verve Cup',
    // Row 3 to row 7: the window opens in the middle of the latch.
    window_start: stamp(3 * CADENCE_SECONDS),
    window_finish: stamp(7 * CADENCE_SECONDS),
    /** The Version the sails are named in, frozen at upload (ADR 0023). */
    crossover_chart_version_id: 'chart-v1',
    recordings: {
      id: 'recording-1',
      filename: '08-22-26-glr.csv',
      first_row_time: stamp(0),
      last_row_time: stamp(7 * CADENCE_SECONDS),
      source_columns: ['Date', 'Latitude', 'Longitude', 'COG', 'SOG', 'STW', 'CTW'],
      row_count: 8,
    },
    ...overrides,
  }
}

describe('readRace', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    ranges.length = 0
    stored = LATCHED_FEED
    pageError = null
    sailEntries = []
    seaStateEntries = []
    annotationError = null
    definitions = [
      { number: 1, label: 'Main + Jib 1' },
      { number: 4, label: 'Main + A2' },
    ]
    definitionsError = null
    versionsAsked.length = 0
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    raceMaybeSingle.mockResolvedValue({ data: raceRow(), error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('states the window in the recording’s own digits, with no conversion either way', async () => {
    const race = await readRace('race-1')

    expect(race?.window_start).toBe('2026-08-22T11:01:30')
    expect(race?.window_finish).toBe('2026-08-22T11:03:30')
    expect(race?.recording).toEqual({
      id: 'recording-1',
      filename: '08-22-26-glr.csv',
      first_row_time: '2026-08-22T11:00:00',
      last_row_time: '2026-08-22T11:03:30',
      source_columns: ['Date', 'Latitude', 'Longitude', 'COG', 'SOG', 'STW', 'CTW'],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('assesses the whole Transcription and filters after, so a latch that began earlier is marked', async () => {
    const race = await readRace('race-1')

    // Rows 3 and 4 are the tail of a run that started at row 2, outside the window. Assessed over
    // the clipped rows instead, row 3 would have nothing above it to repeat and row 4 would be a
    // single repeat — under `DROPOUT_MIN_ROWS` — and both would read as measured.
    expect(race?.quality.rows.map((row) => row.row_index)).toEqual([3, 4, 5, 6, 7])
    expect(race?.quality.rows.map((row) => row.frozen)).toEqual([true, true, false, false, false])
  })

  it('states coverage in time, split so the frozen stretch cannot hide inside the total', async () => {
    const race = await readRace('race-1')

    expect(race?.coverage).toEqual({
      window_seconds: 120,
      lead_gap_seconds: 0,
      tail_gap_seconds: 0,
      // The interval into row 4 is a copy of row 3; the three after it are readings.
      live_seconds: 90,
      frozen_seconds: 30,
      backwards_steps: 0,
      row_count: 5,
      // The cadence the four intervals were actually sampled at, which is what an edge gap gets
      // compared against before anything is read into it.
      median_interval_seconds: CADENCE_SECONDS,
    })
  })

  it('notes the dropout and nothing else on a recording with nothing else wrong with it', async () => {
    const race = await readRace('race-1')

    // Every note is a note (ADR 0009): a race page has no refusal to make, since the window was
    // refused at upload. And a clean feed either side would produce no list at all.
    expect(race?.findings.map((finding) => finding.severity)).toEqual(['note'])
    expect(race?.findings[0].message).toMatch(/verbatim copy of the row before/)
  })

  it('states the gap where the window reaches past the last row', async () => {
    // Legal and ordinary: the logger was stopped on the dock. The window is the race.
    raceMaybeSingle.mockResolvedValue({
      data: raceRow({ window_start: stamp(0), window_finish: stamp(7 * CADENCE_SECONDS + 600) }),
      error: null,
    })

    const race = await readRace('race-1')

    expect(race?.coverage.tail_gap_seconds).toBe(600)
    expect(race?.findings.map((finding) => finding.message)).toContainEqual(
      expect.stringMatching(/10m before the finish/)
    )
  })

  it('pages the Transcription against the Recording’s own row count', async () => {
    // PostgREST caps a response at 1,000, so a race longer than that arrives in pieces — and the
    // pieces have to join back into the file rather than into whatever the first page happened to be.
    const long = Array.from({ length: 1_200 }, (_, index) => dbRow(index))
    stored = long
    raceMaybeSingle.mockResolvedValue({
      data: raceRow({
        window_start: stamp(0),
        window_finish: stamp(1_199 * CADENCE_SECONDS),
        recordings: { ...raceRow().recordings, row_count: 1_200 },
      }),
      error: null,
    })

    const race = await readRace('race-1')

    expect(ranges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ])
    expect(race?.coverage.row_count).toBe(1_200)
    expect(race?.quality.rows[1_000].row_index).toBe(1_000)
  })

  it('refuses the page when it read fewer rows than the Recording claims', async () => {
    // A truncated read produces a coverage figure that looks fine and describes part of the race,
    // which is worse than no page: the figure is the one thing the page exists to state.
    stored = LATCHED_FEED.slice(0, 6)

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('read 6 rows of a Transcription the Recording says is 8')
    )
  })

  it('refuses the page when a measurement arrives as a number rather than as text', async () => {
    // The `::text` cast is what keeps a verbatim comparison verbatim. Left as a JSON number, `sog`
    // would arrive as a double and every Dropout would be found by comparing doubles — quietly.
    stored = [dbRow(0), dbRow(1, { sog: 6.2 }), ...LATCHED_FEED.slice(2)]

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Race: a recorded value did not arrive as text:',
      expect.stringContaining('sog of row 1 came back as number')
    )
  })

  it('refuses the page when a window is not a naive wall-clock stamp', async () => {
    // An offset in a `timestamp` column means something other than Layline wrote it, and reading it
    // as Chicago-local would move the race by hours on a page that promises it did not.
    raceMaybeSingle.mockResolvedValue({
      data: raceRow({ window_start: '2026-08-22T11:01:30+00:00' }),
      error: null,
    })

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalledWith(
      'Race: a recorded time is not a naive wall-clock stamp:',
      expect.stringContaining('not a naive timestamp')
    )
  })

  it('reads nothing, quietly, where there is no race to read', async () => {
    // A row RLS hid and a race that never existed are the same answer through `maybeSingle()`, and
    // both are "there is no race here for you" — which is a not-found page and not a fault.
    raceMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('reads nothing when the race read fails', async () => {
    raceMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when a page of the Transcription fails', async () => {
    pageError = { message: 'statement timeout' }

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no Supabase environment to read from', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    await expect(readRace('race-1')).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  describe('the sailor’s Testimony', () => {
    it('states an unannotated race as two empty lists', async () => {
      // Which the page renders as "not recorded". An empty list is a legal, ordinary race (ADR
      // 0010), so this is not a failure and does not read like one here either.
      const race = await readRace('race-1')

      expect(race?.annotations).toEqual({ sails: [], sea_state: [] })
    })

    it('reads each kind as one ordered list, naming a sail in its own Version’s words', async () => {
      sailEntries = [
        { at: '2026-08-22 10:40:00', definition_number: 1, note: null },
        { at: '2026-08-22 11:02:00', definition_number: 4, note: 'jib was blown out' },
      ]
      seaStateEntries = [{ at: '2026-08-22 11:01:30', sea_state: 'moderate' }]

      const race = await readRace('race-1')

      expect(race?.annotations.sails).toEqual([
        { at: '2026-08-22 10:40:00', definition_number: 1, label: 'Main + Jib 1', note: null },
        {
          at: '2026-08-22 11:02:00',
          definition_number: 4,
          label: 'Main + A2',
          note: 'jib was blown out',
        },
      ])
      expect(race?.annotations.sea_state).toEqual([
        { at: '2026-08-22 11:01:30', sea_state: 'moderate' },
      ])
      // The Race's own frozen pointer, not the artifact's current one.
      expect(versionsAsked).toEqual(['chart-v1'])
    })

    it('states a note-only entry as what was written, with no label nobody chose', async () => {
      // The chart does not name everything the boat has ever flown (ADR 0023). Putting the nearest
      // Definition's words on this entry would be Layline deciding what was up.
      sailEntries = [{ at: '2026-08-22 11:00:00', definition_number: null, note: 'delivery main' }]

      const race = await readRace('race-1')

      expect(race?.annotations.sails).toEqual([
        { at: '2026-08-22 11:00:00', definition_number: null, label: null, note: 'delivery main' },
      ])
      // Nothing named a Definition, so no vocabulary was needed and none was asked for.
      expect(versionsAsked).toEqual([])
    })

    it('asks for no vocabulary at all when the Race records no chart Version', async () => {
      // A Race with a null pointer can hold no Sail Configurations, which
      // `races_id_crossover_chart_version_key` makes structural.
      raceMaybeSingle.mockResolvedValue({
        data: raceRow({ crossover_chart_version_id: null }),
        error: null,
      })

      const race = await readRace('race-1')

      expect(race?.annotations.sails).toEqual([])
      expect(versionsAsked).toEqual([])
    })

    it('refuses the page when a named Definition has no words in that Version', async () => {
      // The composite key makes this unreachable, so it means the vocabulary read came back short.
      // Rendering the bare number would be the page inventing a sail name out of an integer.
      sailEntries = [{ at: '2026-08-22 11:00:00', definition_number: 9, note: null }]

      await expect(readRace('race-1')).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
    })

    it('refuses the page when the vocabulary cannot be read', async () => {
      sailEntries = [{ at: '2026-08-22 11:00:00', definition_number: 1, note: null }]
      definitionsError = { message: 'statement timeout' }

      await expect(readRace('race-1')).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalledWith(
        'Race: Sail Definition read failed:',
        'statement timeout'
      )
    })

    it('keeps an entry timestamped before the window, because the sails were set before the start', async () => {
      sailEntries = [{ at: '2026-08-22 10:40:00', definition_number: 1, note: null }]

      const race = await readRace('race-1')

      expect(race?.annotations.sails[0].at).toBe('2026-08-22 10:40:00')
    })

    it('refuses the page when the Testimony cannot be read, rather than saying none was given', async () => {
      // The failure mode this exists for: an empty list means the sailor recorded nothing, so a
      // failed read rendered as one would have Layline state that the sailor said nothing.
      annotationError = { message: 'statement timeout' }

      await expect(readRace('race-1')).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalledWith(
        'Race: annotation read failed:',
        'statement timeout'
      )
    })
  })
})

/**
 * The archive read, asked about its **shape** rather than its arithmetic.
 *
 * Every figure this module produces is tested over hand-built rows elsewhere — `filter.test.ts`,
 * `coverage-ledger.test.ts`, `polar-performance.test.ts`, `efficiency.test.ts`. What is only
 * testable here, and what this file exists for, is how many times it goes to the database and in
 * what order, because that is the entire cost of the two screens that call it: 6,337 rows through
 * Row Quality, Maneuvers and the scoring is single-digit milliseconds, and the first version of
 * this function spent 9.1 seconds on a preview deployment making about thirty-nine round trips in
 * series.
 *
 * So these are regression tests in the strict sense. A serial `for … await` over the races passes
 * every other suite in this directory and fails the first test below, which is the point: nothing
 * else in the repo can tell the two apart.
 */

import { readAnalysisArchive, readRecentRaceRows } from '@/services/analysis/readArchive'

/** A promise somebody else decides when to settle, so a request can be caught mid-flight. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => {}
  const wait = new Promise<void>((resolve) => {
    open = resolve
  })
  return { wait, open }
}

/**
 * Let every promise already in the queue run.
 *
 * A macrotask, because the read's chain is several `await`s deep before it reaches the row
 * requests and a microtask would only get partway down it. Nothing here waits on a clock, so the
 * zero is a yield rather than a delay.
 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let pages = gate()
/** One entry per `recording_rows` request, in the order they were issued. */
let pagesAsked: string[] = []
/** Every `crossover_sail_definitions` request's id list — the claim is that there is one. */
let definitionsAsked: unknown[] = []
/** What `.limit()` was asked for on `races`, or null where it was not called. */
let limitAsked: number | null = null

const RACES = [
  {
    id: 'race-3',
    title: 'Chicago–St Joe',
    window_start: '2026-09-04T15:00:00',
    window_finish: '2026-09-04T15:05:00',
    polar_version_id: 'polar-v1',
    crossover_chart_version_id: 'chart-v1',
    recordings: { id: 'rec-3', row_count: 4 },
  },
  {
    id: 'race-2',
    title: null,
    window_start: '2026-08-22T11:00:00',
    window_finish: '2026-08-22T11:05:00',
    polar_version_id: 'polar-v1',
    crossover_chart_version_id: 'chart-v1',
    recordings: { id: 'rec-2', row_count: 4 },
  },
  {
    id: 'race-1',
    title: 'Beer can',
    window_start: '2026-06-03T19:00:00',
    window_finish: '2026-06-03T19:05:00',
    // The oldest races predate every Boat Setup artifact the boat has (ADR 0012).
    polar_version_id: null,
    crossover_chart_version_id: null,
    recordings: { id: 'rec-1', row_count: 4 },
  },
]

/** Four rows inside each window, a minute apart, with every channel a Transcription casts to text. */
function storedRows(day: string, hour: string): Record<string, unknown>[] {
  return [0, 1, 2, 3].map((minute) => ({
    row_index: minute + 1,
    row_time: `${day} ${hour}:0${minute}:00`,
    latitude: `41.85${minute}`,
    longitude: '-87.556',
    cog: `${20 + minute}`,
    sog: `${6 + minute * 0.1}`,
    stw: `${5.9 + minute * 0.1}`,
    ctw: `${22 + minute}`,
    tws: `${11 + minute}`,
    twa: `${42 + minute}`,
    awa_calc: `${38 + minute}`,
  }))
}

const STORED: Record<string, Record<string, unknown>[]> = {
  'rec-1': storedRows('2026-06-03', '19'),
  'rec-2': storedRows('2026-08-22', '11'),
  'rec-3': storedRows('2026-09-04', '15'),
}

/** A grid small enough to read and real enough for `polarTargets` to answer off. */
const GRID = {
  twa_axis: [40, 90, 135],
  tws_axis: [6, 10, 14],
  boat_speed: [
    [4.1, 5.4, 6.0],
    [5.2, 6.6, 7.1],
    [4.4, 5.8, 6.5],
  ],
}

const from = jest.fn((table: string) => {
  if (table === 'races') {
    const ordered = {
      limit: (count: number) => {
        limitAsked = count
        return { returns: async () => ({ data: RACES.slice(0, count), error: null }) }
      },
      returns: async () => ({ data: RACES, error: null }),
    }
    return { select: () => ({ order: () => ordered }) }
  }

  if (table === 'recording_rows') {
    return {
      select: () => ({
        eq: (_column: string, recordingId: string) => ({
          order: () => ({
            range: () => ({
              returns: async () => {
                pagesAsked.push(recordingId)
                // Held open so a test can count what is in flight at once.
                await pages.wait
                return { data: STORED[recordingId], error: null }
              },
            }),
          }),
        }),
      }),
    }
  }

  if (table === 'race_sail_entries') {
    return {
      select: () => ({
        eq: (_column: string, raceId: string) => ({
          order: () => ({
            returns: async () => ({
              // The oldest race records no chart Version, so it can hold no Sail Configuration at
              // all — `races_id_crossover_chart_version_key` makes that structural rather than
              // merely unlikely, and a fixture that broke it would be testing an impossible row.
              data:
                raceId === 'race-1'
                  ? []
                  : [{ at: '2026-01-01 00:00:00', definition_number: 1, note: null }],
              error: null,
            }),
          }),
        }),
      }),
    }
  }

  if (table === 'race_sea_state_entries') {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            returns: async () => ({
              data: [{ at: '2026-01-01 00:00:00', sea_state: 'calm' }],
              error: null,
            }),
          }),
        }),
      }),
    }
  }

  if (table === 'crossover_sail_definitions') {
    return {
      select: () => ({
        in: (_column: string, values: unknown) => {
          definitionsAsked.push(values)
          return {
            returns: async () => ({
              data: [{ version_id: 'chart-v1', number: 1, label: 'Main + Jib 1' }],
              error: null,
            }),
          }
        },
      }),
    }
  }

  throw new Error(`the archive read asked for an unexpected table: ${table}`)
})

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ from: (table: string) => from(table) })),
}))

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarVersion: jest.fn(async () => ({ payload: GRID })),
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartScreen: jest.fn(async () => ({
    list: { current_version_id: 'chart-v1', versions: [] },
    current: {
      payload: {
        sail_definitions: [
          { number: 1, label: 'Main + Jib 1' },
          { number: 2, label: 'Reef + Jib 2' },
        ],
      },
    },
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()
  pages = gate()
  pagesAsked = []
  definitionsAsked = []
  limitAsked = null
})

describe('how many round trips, and in what order', () => {
  it('asks for every race’s rows at once rather than one race at a time', async () => {
    const reading = readAnalysisArchive()

    // Every step before the races' own reads is a resolved mock, so flushing the queue gets us to
    // the moment the row requests have gone out and none has come back.
    await flush()

    // Three races in flight. A serial loop would have asked for one and be waiting on it — which
    // is what this file exists to catch, because every other suite passes either way.
    expect(pagesAsked).toHaveLength(3)
    expect(new Set(pagesAsked)).toEqual(new Set(['rec-1', 'rec-2', 'rec-3']))

    pages.open()
    expect(await reading).not.toBeNull()
  })

  it('reads the sail vocabulary once for the whole archive, not once per race', async () => {
    pages.open()
    await readAnalysisArchive()

    // One request, naming the one Version these races share. Thirteen races against one chart was
    // thirteen serial round trips to learn one answer.
    expect(definitionsAsked).toEqual([['chart-v1']])
  })

  it('resolves each Polar once however many races name it', async () => {
    const { readPolarVersion } = jest.requireMock('@/services/boat/readPolarVersions')
    pages.open()
    await readAnalysisArchive()

    // Two races name `polar-v1` and the third names none.
    expect(readPolarVersion).toHaveBeenCalledTimes(1)
    expect(readPolarVersion).toHaveBeenCalledWith('polar-v1')
  })
})

describe('what the read returns', () => {
  it('keeps the races newest first and each race’s rows in file order', async () => {
    pages.open()
    const archive = await readAnalysisArchive()

    expect(archive?.races.map((race) => race.id)).toEqual(['race-3', 'race-2', 'race-1'])
    expect(archive?.rows.map((row) => row.race_id).slice(0, 4)).toEqual([
      'race-3',
      'race-3',
      'race-3',
      'race-3',
    ])
    expect(archive?.rows.slice(0, 4).map((row) => row.row_index)).toEqual([1, 2, 3, 4])
  })

  it('states how much sailing each race contributed, measured rather than counted', async () => {
    pages.open()
    const archive = await readAnalysisArchive()

    // Four rows a minute apart: three measured intervals of 60 s, and the last row of the window
    // has none (`rowIntervalSeconds`), so a race reads 3m rather than 4.
    expect(archive?.races.every((race) => race.seconds === 180)).toBe(true)
    expect(archive?.rows).toHaveLength(12)
  })

  it('resolves each row’s annotations and its own race’s Polar', async () => {
    pages.open()
    const archive = await readAnalysisArchive()
    const row = archive?.rows[0]

    expect(row?.sea_state).toBe('calm')
    expect(row?.sail).toEqual({ recorded: 'definition', label: 'Main + Jib 1' })
    expect(row?.efficiency.target_speed).not.toBeNull()
  })

  it('leaves a race that records no Polar unscored rather than scoring it against another’s', async () => {
    pages.open()
    const archive = await readAnalysisArchive()
    const oldest = archive?.rows.filter((row) => row.race_id === 'race-1') ?? []

    expect(oldest).not.toHaveLength(0)
    expect(oldest.every((row) => row.efficiency.target_speed === null)).toBe(true)
    // And no Sail Configuration either: with no chart Version there is nothing to say a sail in.
    expect(oldest.every((row) => row.sail.recorded === 'not-recorded')).toBe(true)
  })

  it('offers the boat’s current sails as the vocabulary, including one never raced', async () => {
    pages.open()
    const archive = await readAnalysisArchive()

    expect(archive?.vocabulary.sails).toEqual(['Main + Jib 1', 'Reef + Jib 2'])
    expect(archive?.vocabulary.months).toEqual(['2026-06', '2026-08', '2026-09'])
  })
})

describe('the teaser’s own read', () => {
  it('asks the database for the races it wants rather than reading the archive and slicing it', async () => {
    pages.open()
    const recent = await readRecentRaceRows(2)

    expect(limitAsked).toBe(2)
    expect(recent?.races.map((race) => race.id)).toEqual(['race-3', 'race-2'])
    // The third race's Transcription was never read, which is the whole saving.
    expect(pagesAsked).not.toContain('rec-1')
  })

  it('does not read the Crossover Chart, which only a filter rail needs', async () => {
    const { readCrossoverChartScreen } = jest.requireMock(
      '@/services/boat/readCrossoverChartVersions'
    )
    pages.open()
    await readRecentRaceRows(2)

    expect(readCrossoverChartScreen).not.toHaveBeenCalled()
  })

  it('reads the whole archive when nothing is limited', async () => {
    pages.open()
    await readAnalysisArchive()

    expect(limitAsked).toBeNull()
  })
})

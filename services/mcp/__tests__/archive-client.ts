/**
 * A caller's Supabase client over a small in-memory archive, for the race tools' suites.
 *
 * Stubbed at the table rather than at the reads, so `readRace`, `readRaces` and
 * `readAnalysisArchive` run as they do for a screen and the tools are tested through them. Only
 * the query-builder calls those reads make are answered: `select`, `eq`, `in`, `order`, `range`
 * and `limit`, ending in `returns`, `maybeSingle` or an `await`. The `select` string is ignored;
 * each table's rows are stored already shaped as PostgREST would embed them.
 *
 * The Polar is the one read stubbed at the reader (`readPolarVersion`), as `readRace.test.ts`
 * does, because it is its own read with its own suite. A suite using this file mocks that module.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CrossoverChartPayload, PolarPayload } from '@/types'

type Row = Record<string, unknown>

export interface ArchiveTables {
  [table: string]: Row[]
}

export interface ArchiveClient {
  client: SupabaseClient
  /** Tables every read was asked of, in order, so a suite can see the caller's client was used. */
  asked: string[]
}

/** A client over `tables`; a table named in `failing` answers every query with an error. */
export function archiveClient(tables: ArchiveTables, failing: readonly string[] = []): ArchiveClient {
  const asked: string[] = []

  const from = (table: string) => {
    asked.push(table)
    let rows = [...(tables[table] ?? [])]
    let window: [number, number] | null = null

    const answer = (): { data: Row[] | null; error: { message: string } | null } => {
      if (failing.includes(table)) return { data: null, error: { message: `${table} is down` } }
      return { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null }
    }

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value)
        return builder
      },
      in: (column: string, values: readonly unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]))
        return builder
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        const direction = options?.ascending === false ? -1 : 1
        // Numbers as numbers: `row_index` 10 sorts after 2, as Postgres sorts an integer.
        rows.sort((a, b) => {
          const left = a[column] as string | number
          const right = b[column] as string | number
          return left === right ? 0 : left < right ? -direction : direction
        })
        return builder
      },
      range: (fromRow: number, toRow: number) => {
        window = [fromRow, toRow]
        return builder
      },
      limit: (count: number) => {
        rows = rows.slice(0, count)
        return builder
      },
      returns: async () => answer(),
      maybeSingle: async () => {
        const { data, error } = answer()
        return { data: data?.[0] ?? null, error }
      },
      then: (resolve: (value: ReturnType<typeof answer>) => unknown) => resolve(answer()),
    }

    return builder
  }

  return { client: { from } as unknown as SupabaseClient, asked }
}

/**
 * A grid whose lightest two angles are a manufactured ramp, so a row sailed at 45° is
 * **Filler-Anchored** and one at 55° is not — the dev harness's grid, for the same reason.
 */
export const FIXTURE_POLAR: PolarPayload = {
  twa_axis: [30, 40, 50, 60, 90, 135],
  tws_axis: [8, 12],
  boat_speed: [
    [1, 1.5],
    [2, 3],
    [6, 7],
    [6.5, 7.5],
    [7.2, 8.1],
    [6.8, 7.6],
  ],
}

/**
 * The Crossover Chart Version the fixture Race names: Jib 1 below 12 knots, Jib 3 above. The
 * fixture's rows log 10 knots, so Jib 1 is the chart's sail for them.
 */
export const FIXTURE_CHART: CrossoverChartPayload = {
  twa_axis: [40, 90, 135],
  tws_axis: [6, 12],
  cells: [
    [1, 3],
    [1, 3],
    [1, 3],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 3, label: 'Main + Jib 3' },
  ],
}

const CADENCE_SECONDS = 30

/** A stamp `index` rows after 14:20 on a Saturday, in the recording's own naive frame. */
export function fixtureStamp(index: number): string {
  const total = 14 * 3600 + 20 * 60 + index * CADENCE_SECONDS
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-08-22T${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

/**
 * Twenty rows of one Race: starboard at 55° and 45°, a tack at row 10, then port the same way,
 * with a Dropout at rows 13 to 15, which repeat row 12's fix verbatim. The window is rows 2 to 17.
 *
 * Every measurement a string, as the `::text` cast delivers it.
 */
function recordingRows(): Row[] {
  const rows = Array.from({ length: 20 }, (_, index) => {
    const side = index < 10 ? 1 : -1
    const angle = index % 2 === 0 ? 55 : 45
    return {
      recording_id: 'recording-1',
      row_index: index,
      row_time: fixtureStamp(index),
      latitude: (41.85 + index * 0.0002).toFixed(6),
      longitude: (-87.55 - index * 0.0001).toFixed(6),
      cog: String(20 + index),
      sog: '5.8',
      stw: '5.6',
      ctw: String(22 + index),
      tws: '10.0',
      twa: String(side * angle),
      awa_calc: String(side * (angle - 15)),
    }
  })

  for (const index of [13, 14, 15]) {
    const { latitude, longitude, cog, sog } = rows[12]
    rows[index] = { ...rows[index], latitude, longitude, cog, sog }
  }

  return rows
}

export const FIXTURE_RACE_ID = '7b0e7d3c-3a6f-4d64-9a51-8f2f0a7f1c01'
export const OLDER_RACE_ID = '7b0e7d3c-3a6f-4d64-9a51-8f2f0a7f1c02'

/** The archive: the fixture Race, sailed under Polar v1, and an older untitled one with no setup. */
export function fixtureArchive(): ArchiveTables {
  return {
    races: [
      {
        id: FIXTURE_RACE_ID,
        title: 'Saturday Lake Series 4',
        window_start: fixtureStamp(2),
        window_finish: fixtureStamp(17),
        polar_version_id: 'polar-v1',
        crossover_chart_version_id: 'chart-v1',
        rig_tune_version_id: null,
        instrument_calibration_version_id: null,
        rig_tune_band_id: null,
        recordings: {
          id: 'recording-1',
          filename: '08-22-26-lake-series.csv',
          first_row_time: fixtureStamp(0),
          last_row_time: fixtureStamp(19),
          source_columns: ['Date', 'Latitude', 'Longitude', 'COG', 'SOG', 'STW', 'CTW', 'TWS', 'TWA'],
          row_count: 20,
        },
      },
      {
        id: OLDER_RACE_ID,
        title: null,
        window_start: '2025-07-09T19:00:00',
        window_finish: '2025-07-09T19:02:00',
        polar_version_id: null,
        crossover_chart_version_id: null,
        rig_tune_version_id: null,
        instrument_calibration_version_id: null,
        rig_tune_band_id: null,
        recordings: {
          id: 'recording-0',
          filename: '07-09-25.csv',
          first_row_time: '2025-07-09T19:00:00',
          last_row_time: '2025-07-09T19:01:00',
          source_columns: ['Date', 'Latitude', 'Longitude', 'COG', 'SOG'],
          row_count: 3,
        },
      },
    ],
    recording_rows: [
      ...recordingRows(),
      ...[0, 1, 2].map((index) => ({
        recording_id: 'recording-0',
        row_index: index,
        row_time: `2025-07-09T19:0${Math.floor(index / 2)}:${index % 2 === 0 ? '00' : '30'}`,
        latitude: (41.85 + index * 0.0002).toFixed(6),
        longitude: '-87.550000',
        cog: String(180 + index),
        sog: '4.1',
        stw: null,
        ctw: null,
        tws: null,
        twa: null,
        awa_calc: null,
      })),
    ],
    // The sailor's Testimony: a sail named in the chart's words, one with a note, and one the
    // chart does not name at all. The older Race has none, which is "not recorded".
    race_sail_entries: [
      { race_id: FIXTURE_RACE_ID, at: fixtureStamp(1), definition_number: 1, note: null },
      { race_id: FIXTURE_RACE_ID, at: fixtureStamp(12), definition_number: 3, note: ' eased early ' },
      { race_id: FIXTURE_RACE_ID, at: fixtureStamp(16), definition_number: null, note: 'Borrowed code zero' },
    ],
    race_sea_state_entries: [
      { race_id: FIXTURE_RACE_ID, at: fixtureStamp(2), sea_state: 'slight' },
      { race_id: FIXTURE_RACE_ID, at: fixtureStamp(14), sea_state: 'moderate' },
    ],
    crossover_sail_definitions: FIXTURE_CHART.sail_definitions.map((definition) => ({
      version_id: 'chart-v1',
      ...definition,
    })),
    boat_setup_versions: [
      { id: 'polar-v1', kind: 'polar', version_number: 1, effective_from: '2026-03-01' },
      { id: 'chart-v1', kind: 'crossover_chart', version_number: 1, effective_from: '2026-03-01' },
      // A newer Polar the Race does not name, so a summary that resolved "the current one" fails.
      { id: 'polar-v2', kind: 'polar', version_number: 2, effective_from: '2026-09-01' },
    ],
    rig_tune_bands: [],
    // The Instrument Calibration artifact, with nothing recorded against it: a legitimate empty
    // Calibration Log, so every channel has one Era over the whole archive.
    boat_setup_artifacts: [{ id: 'artifact-calibration', kind: 'instrument_calibration' }],
    calibration_events: [],
  }
}

/**
 * The race archive's row and enum types.
 *
 * Mostly a compile-time test: it asserts that every table and every enum in
 * 20260910183000_create_race_archive_and_boat_setup.sql has a type, importable through `@/`,
 * with the database's own column names. The runtime expectations are there so jest reports
 * something when it passes.
 *
 * A few assertions are load-bearing rather than decorative, and are commented where they are.
 */

import type {
  Boat,
  BoatSetupArtifact,
  BoatSetupKind,
  BoatSetupPayload,
  BoatSetupVersion,
  CalibrationChannel,
  CalibrationEvent,
  CalibrationEventType,
  CrossoverChartPayload,
  CrossoverChartVersion,
  FileBackedBoatSetupKind,
  InstrumentCalibrationPayload,
  InstrumentCalibrationVersion,
  PolarPayload,
  PolarVersion,
  Race,
  RaceSailEntry,
  RaceSailEntrySail,
  RaceSeaStateEntry,
  Recording,
  RecordingDateOrder,
  RecordingRow,
  RecordingRowExtras,
  ReefState,
  RigTuneBand,
  RigTunePayload,
  RigTuneShrouds,
  RigTuneVersion,
  Sail,
  SeaState,
  ShroudPosition,
} from '@/types'

describe('the six enums', () => {
  it('name every value the database will accept, and no others', () => {
    const kinds: BoatSetupKind[] = [
      'polar',
      'crossover_chart',
      'rig_tune',
      'instrument_calibration',
    ]
    const channels: CalibrationChannel[] = ['AWA', 'AWS', 'STW', 'HDG']
    const eventTypes: CalibrationEventType[] = ['autocompensation', 'other']
    const seaStates: SeaState[] = ['calm', 'slight', 'moderate', 'rough']
    const reefs: ReefState[] = ['full', 'reef-1']
    const dateOrders: RecordingDateOrder[] = ['MDY', 'DMY']
    const positions: ShroudPosition[] = ['V1', 'D1', 'D2']

    expect([
      kinds.length,
      channels.length,
      eventTypes.length,
      seaStates.length,
      reefs.length,
      dateOrders.length,
      positions.length,
    ]).toEqual([4, 4, 2, 4, 2, 2, 3])
  })

  it('admits only the two file-backed kinds as a Storage path kind', () => {
    // The type half of boat_setup_versions' file_backed_kinds_only. A Rig Tune and an
    // Instrument Calibration are entered by hand and reach Storage never, so asking for a
    // path for one should not compile.
    const backed: FileBackedBoatSetupKind[] = ['polar', 'crossover_chart']
    // @ts-expect-error rig_tune is not file-backed
    const notBacked: FileBackedBoatSetupKind = 'rig_tune'

    expect(backed).toHaveLength(2)
    expect(notBacked).toBe('rig_tune')
  })
})

describe('the twelve row types', () => {
  it('use the database’s own snake_case column names', () => {
    // Rows are handed straight to and from PostgREST, so a camelCase field here would be a
    // mapping layer nobody asked for and a silent undefined at runtime.
    const boat: Boat = {
      id: 'b',
      name: 'Handsome Pete',
      model: 'Beneteau 10R',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }
    const sail: Sail = {
      id: 's',
      boat_id: 'b',
      key: 'A2',
      label: 'A2',
      sort_order: 5,
      retired_on: null,
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }
    const artifact: BoatSetupArtifact = {
      id: 'a',
      boat_id: 'b',
      kind: 'polar',
      current_version_id: null,
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }

    expect([boat.model, sail.key, artifact.current_version_id]).toEqual([
      'Beneteau 10R',
      'A2',
      null,
    ])
  })

  it('give a Recording an id the caller supplies and a header stored verbatim', () => {
    const recording: Recording = {
      id: 'r',
      filename: '07-22-26-beer-can.csv',
      content_sha256: 'a'.repeat(64),
      // The header as recorded, not the SQL names. 'TWA (calc)' keeps its space and
      // parentheses, because recovering the original from the column name is not possible.
      source_columns: ['DATE', 'LONGITUDE', 'TWA (calc)'],
      date_order: 'MDY',
      trailing_newline: true,
      row_count: 3,
      first_row_time: '2026-07-22 18:00:00',
      last_row_time: '2026-07-22 18:02:00',
      uploaded_by: 'u',
      created_at: '2026-09-10T00:00:00Z',
    }

    expect(recording.source_columns).toContain('TWA (calc)')
  })

  it('lets every recorded channel of a row be absent, because absent is not zero', () => {
    const extras: RecordingRowExtras = { 'SOMETHING NEW': '' }
    const row: RecordingRow = {
      recording_id: 'r',
      row_index: 2,
      date_verbatim: '07/22/2026 18:01:00',
      row_time: '2026-07-22 18:01:00',
      longitude: -87.5568333333,
      latitude: 41.8528333333,
      cog: null,
      sog: 5.6,
      twd: null,
      tws: 11,
      twa: null,
      gwd: 190,
      gws: 10,
      ctw: null,
      stw: null,
      pol: null,
      pre: null,
      xte: null,
      rpm: null,
      twa_calc: null,
      awa_calc: null,
      aws_calc: null,
      alarm: 'None',
      observations: null,
      extras,
      // Generated by Postgres. Present on a read, never sent on a write.
      water_referenced: false,
    }

    expect([row.stw, row.ctw, row.water_referenced]).toEqual([null, null, false])
  })

  it('makes all five of a Race’s frozen pointers nullable', () => {
    // NULL means not recorded. Every race in the existing archive has no Rig Tune Version,
    // because v1 of the Rig Tune is the boat's own unmeasured tune (ADR 0012).
    const race: Race = {
      id: 'race',
      boat_id: 'b',
      recording_id: 'r',
      title: null,
      window_start: '2026-07-22 18:00:30',
      window_finish: '2026-07-22 18:21:15',
      polar_version_id: null,
      crossover_chart_version_id: null,
      rig_tune_version_id: null,
      instrument_calibration_version_id: null,
      rig_tune_band_id: null,
      created_by: 'u',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }

    expect(race.rig_tune_version_id).toBeNull()
  })

  it('types the annotations, including the join table that carries the set', () => {
    const entry: RaceSailEntry = {
      id: 'e',
      race_id: 'race',
      // Deliberately unbounded by the window: the sails were set before the start.
      at: '2026-07-22 17:55:00',
      reef: 'full',
      created_at: '2026-09-10T00:00:00Z',
    }
    const member: RaceSailEntrySail = { entry_id: 'e', sail_id: 's' }
    const sea: RaceSeaStateEntry = {
      id: 'q',
      race_id: 'race',
      at: '2026-07-22 18:00:00',
      sea_state: 'moderate',
      created_at: '2026-09-10T00:00:00Z',
    }

    expect([entry.reef, member.sail_id, sea.sea_state]).toEqual(['full', 's', 'moderate'])
  })

  it('requires both figures for both sides of all three shroud positions', () => {
    // ADR 0007: turns re-gear the rig at the dock, the gap restores it when nothing is
    // trusted, and neither derives from the other because no thread pitch is recorded.
    const side = { gap_mm: 12.5, turns_from_base: 0 }
    const shrouds: RigTuneShrouds = {
      V1: { port: side, starboard: side },
      D1: { port: side, starboard: side },
      D2: { port: side, starboard: side },
    }
    const band: RigTuneBand = {
      id: 'band',
      version_id: 'v',
      kind: 'rig_tune',
      low_kt: 8,
      high_kt: 15,
      is_base: false,
      label: 'medium',
      note: null,
      shrouds,
    }

    expect(Object.keys(band.shrouds)).toEqual(['V1', 'D1', 'D2'])
    expect(band.shrouds.V1.starboard.turns_from_base).toBe(0)
  })

  it('types a calibration event as a dated act with channels and an account of itself', () => {
    const event: CalibrationEvent = {
      id: 'ev',
      artifact_id: 'a',
      kind: 'instrument_calibration',
      occurred_on: '2026-07-04',
      type: 'autocompensation',
      channels: ['HDG'],
      note: 'swung the compass off Navy Pier',
      created_by: 'u',
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    }

    expect(event.channels).toEqual(['HDG'])
  })
})

describe('the Version union', () => {
  it('carries a filename on the two file-backed kinds', () => {
    const polar: PolarVersion = {
      id: 'v1',
      artifact_id: 'a',
      kind: 'polar',
      version_number: 1,
      effective_from: '2026-05-01',
      recorded_at: '2026-09-10T00:00:00Z',
      note: null,
      created_by: 'u',
      filename: 'Beneteau10R.pol',
      content_sha256: 'a'.repeat(64),
      payload: { twa_axis: [30], tws_axis: [4], boat_speed: [[3.2]] },
    }
    const crossover: CrossoverChartVersion = {
      ...polar,
      kind: 'crossover_chart',
      filename: 'Beneteau10R.sailselect',
      payload: {
        twa_axis: [30],
        tws_axis: [4],
        cells: [[1]],
        sail_definitions: [{ number: 1, label: 'Jib 1' }],
      },
    }

    expect([polar.filename, crossover.filename]).toEqual([
      'Beneteau10R.pol',
      'Beneteau10R.sailselect',
    ])
  })

  it('refuses one on the two that are entered by hand', () => {
    const rigTune: RigTuneVersion = {
      id: 'v2',
      artifact_id: 'a',
      kind: 'rig_tune',
      version_number: 1,
      effective_from: '2026-05-01',
      recorded_at: '2026-09-10T00:00:00Z',
      // Required on a Rig Tune: its numbers do not stand without it (ADR 0007).
      note: 'spread is one to three turns because the headstay is fixed',
      created_by: 'u',
      filename: null,
      content_sha256: null,
      // The content is in rig_tune_bands, so the payload is empty.
      payload: {},
    }

    // @ts-expect-error a Rig Tune has no file, which is file_backed_kinds_only in the type
    const withFile: RigTuneVersion = { ...rigTune, filename: 'Wayward_Wind.rig' }

    expect(rigTune.filename).toBeNull()
    expect(withFile.filename).toBe('Wayward_Wind.rig')
  })

  it('narrows on kind, which is what makes the union worth having', () => {
    const versions: BoatSetupVersion[] = []
    const filenames = versions
      .filter((v): v is PolarVersion | CrossoverChartVersion =>
        v.kind === 'polar' || v.kind === 'crossover_chart'
      )
      // Reachable only because the narrowing above proved filename is a string here.
      .map((v) => v.filename.toUpperCase())

    expect(filenames).toEqual([])
  })

  it('gives a calibration payload every channel, and a multiplier only where one exists', () => {
    // AWA and HDG have no multiplier on the display, so the field is absent rather than
    // null: a null would be a value the display never showed.
    const payload: InstrumentCalibrationPayload = {
      AWA: { offset: 2.0 },
      AWS: { multiplier: 1.02, offset: 0 },
      STW: { multiplier: 1.02, offset: 0 },
      HDG: { offset: 0 },
    }
    const calibration: InstrumentCalibrationVersion = {
      id: 'v3',
      artifact_id: 'a',
      kind: 'instrument_calibration',
      version_number: 1,
      effective_from: '2026-05-01',
      recorded_at: '2026-09-10T00:00:00Z',
      note: 'off the display',
      created_by: 'u',
      filename: null,
      content_sha256: null,
      payload,
    }

    expect(calibration.payload.AWA.multiplier).toBeUndefined()
    expect(calibration.payload.AWS.multiplier).toBe(1.02)
  })

  it('has a payload type for each kind, and a union of the four', () => {
    const polar: PolarPayload = { twa_axis: [], tws_axis: [], boat_speed: [] }
    const crossover: CrossoverChartPayload = {
      twa_axis: [],
      tws_axis: [],
      cells: [],
      sail_definitions: [],
    }
    const rigTune: RigTunePayload = {}
    const payloads: BoatSetupPayload[] = [polar, crossover, rigTune]

    expect(payloads).toHaveLength(3)
  })
})

import { readInstrumentCalibration } from '../readInstrumentCalibration'
import type { CalibrationEvent, InstrumentCalibrationVersion } from '@/types'

const artifactMaybeSingle = jest.fn()
const versionsReturns = jest.fn()
const eventsReturns = jest.fn()

const artifactEq = jest.fn(() => ({ maybeSingle: artifactMaybeSingle }))
const versionsOrder = jest.fn(() => ({ returns: versionsReturns }))
const eventsOrder = jest.fn(() => ({ returns: eventsReturns }))

/** Any write at all would be the one thing a read-time projection must never do. */
const insert = jest.fn()
const update = jest.fn()
const upsert = jest.fn()

const from = jest.fn((table: string) => {
  if (table === 'boat_setup_artifacts') {
    return { select: () => ({ eq: artifactEq }), insert, update, upsert }
  }
  if (table === 'boat_setup_versions') {
    return { select: () => ({ eq: () => ({ order: versionsOrder }) }), insert, update, upsert }
  }
  if (table === 'calibration_events') {
    return { select: () => ({ eq: () => ({ order: eventsOrder }) }), insert, update, upsert }
  }
  throw new Error(`readInstrumentCalibration asked for an unexpected table: ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

const ARTIFACT = { id: 'artifact-1', current_version_id: 'v1' }

const V1 = {
  id: 'v1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  version_number: 1,
  effective_from: '2026-05-02',
  recorded_at: '2026-05-03T01:00:00Z',
  note: null,
  created_by: 'admin-1',
  filename: null,
  content_sha256: null,
  payload: {
    AWA: { offset: 2 },
    AWS: { multiplier: 1.02, offset: 0 },
    STW: { multiplier: 1.02, offset: 0 },
    HDG: { offset: 0 },
  },
} satisfies InstrumentCalibrationVersion

const EVENT = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Swung the compass.',
  created_by: 'admin-1',
  created_at: '2026-07-05T02:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
} satisfies CalibrationEvent

describe('readInstrumentCalibration', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    artifactMaybeSingle.mockResolvedValue({ data: ARTIFACT, error: null })
    versionsReturns.mockResolvedValue({ data: [V1], error: null })
    eventsReturns.mockResolvedValue({ data: [EVENT], error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reads the artifact, its Versions and its Events', async () => {
    await expect(readInstrumentCalibration()).resolves.toEqual({
      artifactId: 'artifact-1',
      currentVersionId: 'v1',
      versions: [V1],
      events: [EVENT],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('finds the artifact by kind alone — there is one boat and one row per kind', async () => {
    await readInstrumentCalibration()

    expect(artifactEq).toHaveBeenCalledWith('kind', 'instrument_calibration')
  })

  it('asks the database for Versions in mint order, which is what the diffs need', async () => {
    await readInstrumentCalibration()

    expect(versionsOrder).toHaveBeenCalledWith('version_number', { ascending: true })
  })

  it('writes nothing — the Calibration Log is a projection, not a table', async () => {
    await readInstrumentCalibration()

    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('reads an artifact with nothing recorded against it as empty, not as a failure', async () => {
    // The state the app ships in: the four artifact rows exist and none has a Version.
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-1', current_version_id: null },
      error: null,
    })
    versionsReturns.mockResolvedValue({ data: [], error: null })
    eventsReturns.mockResolvedValue({ data: [], error: null })

    await expect(readInstrumentCalibration()).resolves.toEqual({
      artifactId: 'artifact-1',
      currentVersionId: null,
      versions: [],
      events: [],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('reads nothing rather than half a Log when the Versions read fails', async () => {
    versionsReturns.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readInstrumentCalibration()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing rather than half a Log when the Events read fails', async () => {
    // Half a timeline reads as a complete history with entries silently missing.
    eventsReturns.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readInstrumentCalibration()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when the artifact read fails', async () => {
    artifactMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readInstrumentCalibration()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no artifact row at all', async () => {
    artifactMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readInstrumentCalibration()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no Supabase environment to read from', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    await expect(readInstrumentCalibration()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })
})

import { readRigTune } from '../readRigTune'
import type { RigTuneShrouds } from '@/types'

const boatMaybeSingle = jest.fn()
const artifactMaybeSingle = jest.fn()

const from = jest.fn((table: string) => {
  if (table === 'boats') {
    return { select: () => ({ maybeSingle: boatMaybeSingle }) }
  }
  if (table === 'boat_setup_artifacts') {
    return {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: artifactMaybeSingle }) }) }),
    }
  }
  throw new Error(`readRigTune asked for an unexpected table: ${table}`)
})

const createClient = jest.fn(async () => ({ from }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => createClient(),
}))

const BOAT = {
  id: 'boat-1',
  name: 'Handsome Pete',
  model: 'Beneteau 10R',
  created_at: '2026-09-10T18:30:00Z',
  updated_at: '2026-09-10T18:30:00Z',
}

function shrouds(gap: number): RigTuneShrouds {
  const both = { port: { gap_mm: gap, turns_from_base: 0 }, starboard: { gap_mm: gap, turns_from_base: 0 } }
  return { V1: both, D1: both, D2: both }
}

/** A band as PostgREST returns it: every column of the row, in no promised order. */
function bandRow(over: Record<string, unknown> = {}) {
  return {
    id: 'band-base',
    version_id: 'v2',
    kind: 'rig_tune' as const,
    low_kt: 9,
    high_kt: null,
    is_base: true,
    label: 'Mac base',
    note: null,
    gaps_stale: false,
    shrouds: shrouds(72),
    ...over,
  }
}

function versionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'v2',
    version_number: 2,
    effective_from: '2026-08-01',
    recorded_at: '2026-08-02T14:00:00Z',
    note: 'retuned after the shrouds were reset',
    created_by: 'admin-1',
    bands: [bandRow()],
    ...over,
  }
}

describe('readRigTune', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    boatMaybeSingle.mockResolvedValue({ data: BOAT, error: null })
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-rig', current_version_id: 'v2', versions: [versionRow()] },
      error: null,
    })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reads the boat, the artifact and its Versions', async () => {
    await expect(readRigTune()).resolves.toEqual({
      boat: BOAT,
      artifact_id: 'artifact-rig',
      current_version_id: 'v2',
      versions: [versionRow()],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('orders the Versions newest first and each Version bands up the wind axis', async () => {
    // PostgREST promises no ordering without an ORDER BY, and neither order is the
    // database's to choose: the history reads newest first and a band table reads upwards.
    artifactMaybeSingle.mockResolvedValue({
      data: {
        id: 'artifact-rig',
        current_version_id: 'v3',
        versions: [
          versionRow({ id: 'v1', version_number: 1 }),
          versionRow({
            id: 'v3',
            version_number: 3,
            bands: [
              bandRow({ id: 'top', low_kt: 16, high_kt: null, is_base: false, label: 'Heavy' }),
              bandRow({ id: 'base', low_kt: 9, high_kt: 16, is_base: true }),
              bandRow({ id: 'light', low_kt: 0, high_kt: 9, is_base: false, label: 'Light' }),
            ],
          }),
          versionRow({ id: 'v2', version_number: 2 }),
        ],
      },
      error: null,
    })

    const page = await readRigTune()

    expect(page?.versions.map((v) => v.version_number)).toEqual([3, 2, 1])
    expect(page?.versions[0].bands.map((b) => b.low_kt)).toEqual([0, 9, 16])
  })

  it('reads an artifact that has no Version yet as an empty history', async () => {
    artifactMaybeSingle.mockResolvedValue({
      data: { id: 'artifact-rig', current_version_id: null, versions: null },
      error: null,
    })

    await expect(readRigTune()).resolves.toEqual({
      boat: BOAT,
      artifact_id: 'artifact-rig',
      current_version_id: null,
      versions: [],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('reads nothing rather than half a table when the artifact read fails', async () => {
    artifactMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readRigTune()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when the boat read fails, and nothing when there is no boat', async () => {
    boatMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(readRigTune()).resolves.toBeNull()

    boatMaybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(readRigTune()).resolves.toBeNull()

    expect(consoleError).toHaveBeenCalledTimes(2)
  })

  it('reads nothing when the rig_tune artifact row is missing: there is nothing to write against', async () => {
    artifactMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readRigTune()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no Supabase environment to read from', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    await expect(readRigTune()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })
})

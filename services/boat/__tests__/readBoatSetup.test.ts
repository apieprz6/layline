import { readBoatSetup } from '../readBoatSetup'
import { BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'

const boatMaybeSingle = jest.fn()
const artifactsEq = jest.fn()

const from = jest.fn((table: string) => {
  if (table === 'boats') {
    return { select: () => ({ maybeSingle: boatMaybeSingle }) }
  }
  if (table === 'boat_setup_artifacts') {
    // `.returns<T>()` is a type-level cast in supabase-js and resolves to the same
    // `{ data, error }`, so the stub hangs the result off it either way.
    return { select: () => ({ eq: () => ({ returns: artifactsEq }) }) }
  }
  throw new Error(`readBoatSetup asked for an unexpected table: ${table}`)
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

/** The four rows the migration seeds, in the order the database happens to hold them. */
function seededArtifacts(
  current: Partial<Record<string, { version_number: number; effective_from: string }>> = {}
) {
  return BOAT_SETUP_ORDER.map((kind) => ({ kind, current: current[kind] ?? null }))
}

describe('readBoatSetup', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    boatMaybeSingle.mockResolvedValue({ data: BOAT, error: null })
    artifactsEq.mockResolvedValue({ data: seededArtifacts(), error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('reads the boat and its four artifacts, all unrecorded on an empty archive', async () => {
    await expect(readBoatSetup()).resolves.toEqual({
      boat: BOAT,
      artifacts: [
        { kind: 'polar', current: null },
        { kind: 'crossover_chart', current: null },
        { kind: 'rig_tune', current: null },
        { kind: 'instrument_calibration', current: null },
      ],
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('carries the Version in force where an artifact has one', async () => {
    artifactsEq.mockResolvedValue({
      data: seededArtifacts({ polar: { version_number: 2, effective_from: '2026-06-14' } }),
      error: null,
    })

    const page = await readBoatSetup()

    expect(page?.artifacts[0]).toEqual({
      kind: 'polar',
      current: { version_number: 2, effective_from: '2026-06-14' },
    })
  })

  it('orders the four rows itself, whatever order the database returns them in', async () => {
    // PostgREST makes no ordering promise without an ORDER BY, and the reading
    // order of Boat Setup is Polar, Crossover Chart, Rig Tune, Instrument
    // Calibration — a property of the vocabulary, not of the table.
    artifactsEq.mockResolvedValue({
      data: [
        { kind: 'rig_tune', current: null },
        { kind: 'instrument_calibration', current: null },
        { kind: 'polar', current: null },
        { kind: 'crossover_chart', current: null },
      ],
      error: null,
    })

    const page = await readBoatSetup()

    expect(page?.artifacts.map((a) => a.kind)).toEqual([
      'polar',
      'crossover_chart',
      'rig_tune',
      'instrument_calibration',
    ])
  })

  it('still lists a kind whose artifact row is missing, as unrecorded, and says so', async () => {
    // Four rows exist forever, so this is a broken invariant rather than a state.
    // The screen keeps its shape and the log carries the breakage: "not recorded"
    // is true of an artifact with no row, and inventing a Version is the one thing
    // that would not be.
    artifactsEq.mockResolvedValue({
      data: [{ kind: 'polar', current: null }],
      error: null,
    })

    const page = await readBoatSetup()

    expect(page?.artifacts).toHaveLength(4)
    expect(page?.artifacts.every((a) => a.current === null)).toBe(true)
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing rather than half a page when the artifacts read fails', async () => {
    artifactsEq.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readBoatSetup()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when the boat read fails', async () => {
    boatMaybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    await expect(readBoatSetup()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no boat row at all', async () => {
    // A row RLS hides is indistinguishable from a row that does not exist, and
    // neither is a boat this screen may name.
    boatMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(readBoatSetup()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reads nothing when there is no Supabase environment to read from', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    await expect(readBoatSetup()).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })
})

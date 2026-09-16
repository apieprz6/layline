/**
 * Deleting a race, at the seam the page calls.
 *
 * Two things this suite is really about, both of them ADR 0013's:
 *
 *   * the delete is expressed against the **Recording** — one statement, which takes the Race, its
 *     annotations, its sail join rows and its whole Transcription with it;
 *   * the transaction commits **first** and the object goes **second**, so a failure at the second
 *     step leaves bytes with no row and never a row with no bytes.
 *
 * The cascade itself is the database's, and a mock cannot prove it — that is
 * `scripts/verify-race-delete-cascade.sql`. What this proves is that Layline asks for the one
 * statement that triggers it, in the right order, and says so honestly when the bytes stay behind.
 */

import { amendRaceBoatSetup, deleteRace } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { RaceBoatSetupPointers } from '@/types'

const RACE_ID = '9a1b2c3d-0000-4000-8000-00000000aaaa'
const RECORDING_ID = '9a1b2c3d-0000-4000-8000-00000000bbbb'
const FILENAME = '08-22-26-glr.csv'

/** Every call that reached Supabase, in order, so "commit first, object second" is observable. */
let calls: string[] = []

const raceMaybeSingle = jest.fn()
const deleteSelect = jest.fn()
const remove = jest.fn()

const deleteEq = jest.fn(() => ({ select: deleteSelect }))

const from = jest.fn((table: string) => {
  if (table === 'races') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: raceMaybeSingle }) }),
    }
  }

  if (table === 'recordings') {
    return {
      delete: () => {
        calls.push('delete recordings')
        return { eq: deleteEq }
      },
    }
  }

  throw new Error(`the race delete touched ${table}`)
})

const storageFrom = jest.fn(() => ({ remove }))

const rpc = jest.fn()

const createClient = jest.fn(async () => ({ from, rpc, storage: { from: storageFrom } }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

const ADMIN = { ...CREW, role: 'admin' as const }

describe('deleteRace', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    calls = []
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    raceMaybeSingle.mockResolvedValue({
      data: { id: RACE_ID, recordings: { id: RECORDING_ID, filename: FILENAME } },
      error: null,
    })
    deleteSelect.mockImplementation(async () => {
      calls.push('committed')
      return { data: [{ id: RECORDING_ID }], error: null }
    })
    remove.mockImplementation(async () => {
      calls.push('remove object')
      return { data: [{ name: FILENAME }], error: null }
    })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('deletes the Recording, which is the one statement the cascade hangs off', async () => {
    const result = await deleteRace(RACE_ID)

    expect(result).toEqual({ ok: true, bytes_removed: true })
    // Against the Recording and never against the Race: the foreign key runs the other way, and
    // `races.recording_id` is UNIQUE, so there is no second Race to orphan.
    expect(from).toHaveBeenCalledWith('recordings')
    expect(deleteEq).toHaveBeenCalledWith('id', RECORDING_ID)
  })

  it('removes the bytes at the path derived from the Recording and its verbatim filename', async () => {
    await deleteRace(RACE_ID)

    expect(remove).toHaveBeenCalledWith([`recordings/${RECORDING_ID}/${FILENAME}`])
  })

  it('commits the transaction before it touches the object', async () => {
    await deleteRace(RACE_ID)

    // The order is the whole of ADR 0013 on this path. Reversed, a failed commit would leave a
    // Recording whose bytes had already gone.
    expect(calls).toEqual(['delete recordings', 'committed', 'remove object'])
  })

  it('reports the bytes left behind when the object delete fails, and keeps the race deleted', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'storage unreachable' } })

    const result = await deleteRace(RACE_ID)

    // Not a failure: the row is gone, which is what was asked for. The bytes are orphaned, which is
    // invisible, harmless and what the sweeper is for.
    expect(result).toEqual({ ok: true, bytes_removed: false })
    // The path is logged, so a sweep has something to go on even before it lists the bucket.
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(`recordings/${RECORDING_ID}/${FILENAME}`),
      'storage unreachable'
    )
  })

  it('refuses a viewer with a sentence, and touches nothing', async () => {
    resolveAccount.mockResolvedValue(CREW)

    expect(await deleteRace(RACE_ID)).toEqual({
      ok: false,
      message: 'Only an admin can delete a race.',
    })
    // The Role is re-checked here because a Server Action is a public endpoint. RLS refuses the same
    // write a second time and is the authority; this exists so the answer is a sentence.
    expect(from).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('refuses a Guest', async () => {
    resolveAccount.mockResolvedValue(null)

    expect(await deleteRace(RACE_ID)).toEqual({
      ok: false,
      message: 'Only an admin can delete a race.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('leaves the bytes alone when the row-level policy declines the delete', async () => {
    // What an account without the write policy actually gets: a successful response that deleted
    // nothing. RLS filters a DELETE rather than raising on it, so an empty result is the refusal.
    deleteSelect.mockResolvedValue({ data: [], error: null })

    expect(await deleteRace(RACE_ID)).toEqual({
      ok: false,
      message: 'Only an admin can delete a race.',
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('answers a race that is not there, or that RLS is hiding, the same way', async () => {
    raceMaybeSingle.mockResolvedValue({ data: null, error: null })

    expect(await deleteRace(RACE_ID)).toEqual({
      ok: false,
      message: 'That race is not in the archive.',
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('answers a malformed race id without asking the database about it', async () => {
    // `id=eq.not-a-uuid` is a 22P02 from PostgREST, which reads here as a fault in the archive for
    // what is only a stale link.
    expect(await deleteRace('not-a-uuid')).toEqual({
      ok: false,
      message: 'That race is not in the archive.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('says the bytes stayed when Storage removed nothing without complaining', async () => {
    // `remove` on a path that holds no object answers with an empty list and no error, which is not
    // the same thing as having removed it.
    remove.mockResolvedValue({ data: [], error: null })

    expect(await deleteRace(RACE_ID)).toEqual({ ok: true, bytes_removed: false })
  })
})

/**
 * Amending which Boat Setup Versions a race was sailed under, at the seam the panel calls.
 *
 * One statement, one transaction, and all five answers in it. The rules the database holds are the
 * database's and a mock cannot prove them — the composite key that refuses a foreign band, the kind tag
 * that refuses a Version of the wrong sort, the admin-only write policy the function's own lock runs
 * under: those are `scripts/verify-race-upload-rpc.sql` and `verify-race-archive-schema.sql`.
 *
 * What this proves is what Layline *sends*. Chiefly that it sends all five keys every time: `->>` on an
 * absent key answers NULL, which is indistinguishable from the sailor setting a pointer back to not
 * recorded, so a payload short of one would silently erase it. And that the clearing count the sailor
 * agreed to travels with the call, because repointing the Crossover Chart deletes Testimony nothing can
 * recover (ADR 0023).
 */
describe('amendRaceBoatSetup', () => {
  const POLAR = '9a1b2c3d-0000-4000-8000-00000000c001'
  const CHART = '9a1b2c3d-0000-4000-8000-00000000c002'
  const TUNE = '9a1b2c3d-0000-4000-8000-00000000c003'
  const CAL = '9a1b2c3d-0000-4000-8000-00000000c004'
  const BAND = '9a1b2c3d-0000-4000-8000-00000000c005'

  function setupOf(overrides: Partial<RaceBoatSetupPointers> = {}): RaceBoatSetupPointers {
    return {
      polar_version_id: POLAR,
      crossover_chart_version_id: CHART,
      rig_tune_version_id: TUNE,
      instrument_calibration_version_id: CAL,
      rig_tune_band_id: BAND,
      ...overrides,
    }
  }

  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    rpc.mockResolvedValue({ data: 0, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('sends all five answers and the clearing count in one call', async () => {
    const result = await amendRaceBoatSetup(RACE_ID, setupOf(), 0)

    expect(result).toEqual({ ok: true, cleared_sail_entries: 0 })
    expect(rpc).toHaveBeenCalledWith('amend_race_boat_setup', {
      p_race_id: RACE_ID,
      p_setup: {
        polar_version_id: POLAR,
        crossover_chart_version_id: CHART,
        rig_tune_version_id: TUNE,
        instrument_calibration_version_id: CAL,
        rig_tune_band_id: BAND,
      },
      p_clearing: 0,
    })
  })

  it('sends a cleared pointer as an explicit null rather than leaving the key out', async () => {
    // The failure this exists for: an absent key reads as NULL inside the function and would clear a
    // pointer nobody meant to clear, so the five keys are always present and "not recorded" is a null.
    await amendRaceBoatSetup(RACE_ID, setupOf({ polar_version_id: null, rig_tune_band_id: null }), 0)

    const sent = rpc.mock.calls[0][1].p_setup
    expect(Object.keys(sent).sort()).toEqual([
      'crossover_chart_version_id',
      'instrument_calibration_version_id',
      'polar_version_id',
      'rig_tune_band_id',
      'rig_tune_version_id',
    ])
    expect(sent.polar_version_id).toBeNull()
    expect(sent.rig_tune_band_id).toBeNull()
  })

  it('reports how many Sail Configurations the chart move took with it', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })

    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), 3)).toEqual({
      ok: true,
      cleared_sail_entries: 3,
    })
    expect(rpc.mock.calls[0][1].p_clearing).toBe(3)
  })

  it('refuses a viewer before it asks the database anything', async () => {
    resolveAccount.mockResolvedValue(CREW)

    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), 0)).toEqual({
      ok: false,
      message: 'Only an admin can change which Versions a race was sailed under.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('turns the function’s own refusal of a viewer into that same sentence', async () => {
    // The authority, not this check: SECURITY INVOKER means the admin-only write policy applies to the
    // function's `SELECT ... FOR UPDATE`, and a viewer reaching the endpoint directly finds no row.
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no such Race' } })

    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), 0)).toEqual({
      ok: false,
      message: 'Only an admin can change which Versions a race was sailed under.',
    })
  })

  it('answers a malformed race id without asking the database about it', async () => {
    expect(await amendRaceBoatSetup('not-a-uuid', setupOf(), 0)).toEqual({
      ok: false,
      message: 'That race is not in the archive.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers a malformed pointer without asking the database about it', async () => {
    // A bad uuid is a 22P02 out of the cast inside the function, which would surface as "the archive is
    // broken" for what is a bad request.
    expect(
      await amendRaceBoatSetup(RACE_ID, setupOf({ rig_tune_band_id: 'not-a-uuid' }), 0)
    ).toEqual({
      ok: false,
      message: 'The Boat Setup could not be saved, and nothing about this race was changed. Try again.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a clearing count that is not a number of rows', async () => {
    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), -1)).toMatchObject({ ok: false })
    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), 1.5)).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says nothing was changed when the transaction failed, and logs why', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint races_rig_tune_band_fkey' },
    })

    expect(await amendRaceBoatSetup(RACE_ID, setupOf(), 0)).toEqual({
      ok: false,
      message: 'The Boat Setup could not be saved, and nothing about this race was changed. Try again.',
    })
    expect(consoleError).toHaveBeenCalledWith(
      'Race Boat Setup: the amendment failed:',
      'violates foreign key constraint races_rig_tune_band_fkey'
    )
  })
})

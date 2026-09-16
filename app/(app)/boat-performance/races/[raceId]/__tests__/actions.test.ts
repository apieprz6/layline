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

import { deleteRace } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'

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

const createClient = jest.fn(async () => ({ from, storage: { from: storageFrom } }))

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

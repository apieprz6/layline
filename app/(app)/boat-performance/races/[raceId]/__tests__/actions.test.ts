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

import { amendRace, deleteRace } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { AmendRaceInput } from '@/types'

const RACE_ID = '9a1b2c3d-0000-4000-8000-00000000aaaa'
const RECORDING_ID = '9a1b2c3d-0000-4000-8000-00000000bbbb'
const FILENAME = '08-22-26-glr.csv'

/** Every call that reached Supabase, in order, so "commit first, object second" is observable. */
let calls: string[] = []

const raceMaybeSingle = jest.fn()
const deleteSelect = jest.fn()
const remove = jest.fn()

const deleteEq = jest.fn(() => ({ select: deleteSelect }))

/** The Transcription's row times, paged. The amendment reads these and nothing else of a recording. */
const rowTimesReturns = jest.fn()
const rowTimesRange = jest.fn(() => ({ returns: rowTimesReturns }))

/** The chart Version's vocabulary, for the Sail Definition numbers an amendment may name. */
const definitionsReturns = jest.fn()

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

  // Read-only, and shaped so it cannot be anything else: there is no `update`, `insert`, `delete` or
  // `upsert` on this object, so an amendment that tried to write a Transcription would throw here
  // rather than pass quietly (ADR 0010).
  if (table === 'recording_rows') {
    calls.push('select recording_rows')
    return {
      select: () => ({ eq: () => ({ order: () => ({ range: rowTimesRange }) }) }),
    }
  }

  if (table === 'crossover_sail_definitions') {
    return { select: () => ({ eq: () => ({ returns: definitionsReturns }) }) }
  }

  throw new Error(`a race action touched ${table}`)
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
 * Amending a whole race, at the seam the flow calls.
 *
 * One transaction, and every answer in it: the title, the window, the five Boat Setup pointers and both
 * lists of Testimony (ADR 0010 Amendment 1). A sailor who moves the start two minutes later and takes
 * off the sail change now on the wrong side of it has corrected one thing, so a half-applied version of
 * that is a race that never happened — which is why this suite counts RPC calls as well as reading them.
 *
 * The two window refusals are the upload flow's own, asked by the same function over the recording's own
 * row times: a rule a sailor met while filing a race and did not meet while correcting one would be a
 * second, laxer set reachable by a different door.
 *
 * What it also pins is what an amendment *cannot* reach. There is no parameter here for a recorded
 * value, `recording_rows` is read and never written, and nothing in it touches Storage — a Transcription
 * is what the file said, and an amendment is what the sailor said about it.
 *
 * The database's own rules stay the database's, as ever: the deferred window trigger, the four
 * kind-tagged Version keys, the Definition foreign key, the admin-only write policy the function's lock
 * runs under. Those are `scripts/verify-race-archive-schema.sql`. This proves what Layline sends.
 */
describe('amendRace', () => {
  const POLAR = '9a1b2c3d-0000-4000-8000-00000000d001'
  const CHART = '9a1b2c3d-0000-4000-8000-00000000d002'
  const TUNE = '9a1b2c3d-0000-4000-8000-00000000d003'
  const CAL = '9a1b2c3d-0000-4000-8000-00000000d004'
  const BAND = '9a1b2c3d-0000-4000-8000-00000000d005'

  /** Four rows a minute apart: the whole recording, which is what every window below is checked against. */
  const ROW_TIMES = [
    '2026-06-03T18:55:00',
    '2026-06-03T18:56:00',
    '2026-06-03T18:57:00',
    '2026-06-03T18:58:00',
  ]

  function inputOf(overrides: Partial<AmendRaceInput> = {}): AmendRaceInput {
    return {
      race_id: RACE_ID,
      window_start: '2026-06-03T18:55:00',
      window_finish: '2026-06-03T18:58:00',
      title: 'Wednesday 3',
      polar_version_id: POLAR,
      crossover_chart_version_id: CHART,
      rig_tune_version_id: TUNE,
      instrument_calibration_version_id: CAL,
      rig_tune_band_id: BAND,
      sails: [{ at: '2026-06-03T18:56:00', definition_number: 3, note: null }],
      sea_state: [{ at: '2026-06-03T18:57:00', sea_state: 'moderate' }],
      ...overrides,
    }
  }

  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    calls = []
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    raceMaybeSingle.mockResolvedValue({
      data: { id: RACE_ID, recordings: { id: RECORDING_ID, row_count: ROW_TIMES.length } },
      error: null,
    })
    rowTimesReturns.mockResolvedValue({
      data: ROW_TIMES.map((row_time) => ({ row_time })),
      error: null,
    })
    definitionsReturns.mockResolvedValue({ data: [{ number: 1 }, { number: 3 }], error: null })
    rpc.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('sends the whole amendment in one call', async () => {
    expect(await amendRace(inputOf())).toEqual({ ok: true })

    // One, and named: two calls could half-apply a correction that is one thing to the sailor.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('amend_race', {
      p_race_id: RACE_ID,
      p_race: {
        title: 'Wednesday 3',
        window_start: '2026-06-03T18:55:00',
        window_finish: '2026-06-03T18:58:00',
      },
      // All five, every time. `->>` on an absent key answers NULL, which is what "the sailor set this
      // back to not recorded" looks like — so a payload short of one would silently erase a pointer.
      p_setup: {
        polar_version_id: POLAR,
        crossover_chart_version_id: CHART,
        rig_tune_version_id: TUNE,
        instrument_calibration_version_id: CAL,
        rig_tune_band_id: BAND,
      },
      p_sails: [{ at: '2026-06-03T18:56:00', definition_number: 3, note: null }],
      p_sea_state: [{ at: '2026-06-03T18:57:00', sea_state: 'moderate' }],
    })
  })

  it('sends both annotation lists whole, so an entry can be taken off at all', async () => {
    // The empty list is the point: it is the only way "nobody wrote down what was up" can be said after
    // the fact, and it only works because the lists replace what is stored rather than adding to it.
    await amendRace(inputOf({ sails: [], sea_state: [] }))

    expect(rpc).toHaveBeenCalledWith(
      'amend_race',
      expect.objectContaining({ p_sails: [], p_sea_state: [] })
    )
  })

  it('leaves every annotation timestamp exactly where it was when the window moves', async () => {
    // A window moved onto the last two rows, with a sail entry on the second. Moving a window is a
    // statement about the race and not about the entry, so nothing rewrites, clamps or drops the entry's
    // time — an out-of-window entry is retained, and read-time resolution is what makes that safe.
    await amendRace(
      inputOf({ window_start: '2026-06-03T18:57:00', window_finish: '2026-06-03T18:58:00' })
    )

    expect(rpc).toHaveBeenCalledWith(
      'amend_race',
      expect.objectContaining({
        p_sails: [{ at: '2026-06-03T18:56:00', definition_number: 3, note: null }],
        p_sea_state: [{ at: '2026-06-03T18:57:00', sea_state: 'moderate' }],
      })
    )
  })

  it('refuses a finish that is not after its start, in the upload flow’s own words', async () => {
    expect(
      await amendRace(
        inputOf({ window_start: '2026-06-03T18:58:00', window_finish: '2026-06-03T18:55:00' })
      )
    ).toEqual({
      ok: false,
      message:
        'The finish has to come after the start. Drag the right-hand handle later, or type a ' +
        'finish time further on.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a window holding no recorded row, in the upload flow’s own words', async () => {
    expect(
      await amendRace(
        inputOf({ window_start: '2026-06-03T20:00:00', window_finish: '2026-06-03T20:30:00' })
      )
    ).toEqual({
      ok: false,
      message:
        'There are no recorded rows between those two times, so there is no race in there to ' +
        'save. Widen the window until the track lights up.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('checks the window against the whole recording, not against the window it is replacing', async () => {
    // The point of an amendment is often to reach rows the stored window excludes, so the row times are
    // read for the Recording and never filtered by the window still standing.
    await amendRace(inputOf())

    expect(rowTimesRange).toHaveBeenCalledWith(0, 999)
    expect(calls).toContain('select recording_rows')
  })

  it('reads the Transcription, writes nothing to it, and never touches Storage', async () => {
    await amendRace(inputOf())

    // The tables an amendment may name, and the whole list. `recordings` is absent — not one column of
    // it is writable from here — and the `recording_rows` mock offers no way to write at all.
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'races',
      'recording_rows',
      'crossover_sail_definitions',
    ])
    expect(storageFrom).not.toHaveBeenCalled()
  })

  it('refuses a Crossover Chart Version the archive does not hold, and blames the Version', async () => {
    // A read that succeeded and found nothing: `mint_boat_setup_version` refuses a chart Version that
    // defines no sail, so an empty vocabulary means the id names no Version this account can read. Said
    // about the Version, because refusing each Definition instead would blame the sailor's sails.
    definitionsReturns.mockResolvedValue({ data: [], error: null })

    expect(await amendRace(inputOf())).toEqual({
      ok: false,
      message:
        'That Crossover Chart Version is not one this archive holds. Choose the chart again on the ' +
        'Sails section, then save.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a Sail Configuration naming a number the chosen Version does not define', async () => {
    expect(
      await amendRace(inputOf({ sails: [{ at: ROW_TIMES[1], definition_number: 9, note: null }] }))
    ).toEqual({ ok: false, message: expect.stringContaining('9') })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves a race that names no sail even when the chart could not be read', async () => {
    // A failed read says nothing about the pointer either way, and six of the archive's recordings have
    // no sail record at all. Refusing one because a chart was unreachable would make the flow's own
    // promise false.
    definitionsReturns.mockResolvedValue({ data: null, error: { message: 'unreachable' } })

    expect(await amendRace(inputOf({ sails: [] }))).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses a viewer with a sentence, and touches nothing', async () => {
    resolveAccount.mockResolvedValue(CREW)

    expect(await amendRace(inputOf())).toEqual({
      ok: false,
      message: 'Only an admin can amend a race.',
    })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('turns the function’s own lock refusing the write into that same sentence', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not writable', code: '42501' } })

    expect(await amendRace(inputOf())).toEqual({
      ok: false,
      message: 'Only an admin can amend a race.',
    })
  })

  it('answers a race that is not there, or that RLS is hiding, the same way', async () => {
    raceMaybeSingle.mockResolvedValue({ data: null, error: null })

    expect(await amendRace(inputOf())).toEqual({
      ok: false,
      message: 'That race is not in the archive.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a Transcription that could not be read whole rather than an unchecked window', async () => {
    // A truncated read would accept a window over rows nobody has, which is how a race ends up scored
    // over a stretch of recording holding nothing.
    rowTimesReturns
      .mockResolvedValueOnce({ data: [{ row_time: ROW_TIMES[0] }], error: null })
      .mockResolvedValue({ data: [], error: null })

    expect(await amendRace(inputOf())).toEqual({
      ok: false,
      message:
        'The amendment could not be saved, and nothing about this race was changed. Try again.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a malformed pointer without asking the database about it', async () => {
    expect(await amendRace(inputOf({ rig_tune_band_id: 'not-a-uuid' }))).toEqual({
      ok: false,
      message:
        'The amendment could not be saved, and nothing about this race was changed. Try again.',
    })
    expect(from).not.toHaveBeenCalled()
  })
})

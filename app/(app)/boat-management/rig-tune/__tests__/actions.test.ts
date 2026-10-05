import { correctRigTuneVersion, saveRigTuneVersion } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { RigTuneBandDraft, RigTuneDraft, RigTunePositionDraft, ShroudPosition } from '@/types'

const rpc = jest.fn()
const versionsEq = jest.fn()
const racesIn = jest.fn()
const from = jest.fn((table: string) => {
  if (table === 'boat_setup_versions') return { select: () => ({ eq: versionsEq }) }
  if (table === 'races') return { select: () => ({ in: racesIn }) }
  throw new Error(`unexpected table: ${table}`)
})
const createClient = jest.fn(async () => ({ rpc, from }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
const { revalidatePath } = jest.requireMock('next/cache')

const ADMIN = { ...CREW, role: 'admin' as const }

function side(gap: string, turns = '0') {
  return { gap_mm: gap, turns_from_base: turns }
}

function evenShrouds(turns = '0'): Record<ShroudPosition, RigTunePositionDraft> {
  const at = (gap: string) => ({ port: side(gap, turns), starboard: side(gap, turns) })
  return { V1: at('72'), D1: at('64'), D2: at('61') }
}

/**
 * The smallest table that is a Rig Tune: one band, from 0 kt and open at the top, and it
 * is the Base Tune because the Turns have to be counted from somewhere (ADR 0007).
 */
function draft(over: Partial<RigTuneDraft> = {}): RigTuneDraft {
  return {
    effective_from: '2026-07-12',
    change_reason: 'First tune measured off the boat with a caliper.',
    bands: [
      {
        key: 'band-1',
        label: 'Mac tune',
        low_kt: '0',
        high_kt: '',
        is_base: true,
        note: '',
        shrouds: evenShrouds(),
        gaps_stale: false,
        seed: null,
      },
    ],
    ...over,
  }
}

/** Nothing was written and nothing was claimed to have been. */
function expectNoWrite() {
  expect(rpc).not.toHaveBeenCalled()
  expect(revalidatePath).not.toHaveBeenCalled()
}

describe('saveRigTuneVersion', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    rpc.mockResolvedValue({ data: 'version-3', error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('mints the whole table in one call and revalidates the screen', async () => {
    // One RPC, because a Version is the whole table or none of it: three separate writes
    // through supabase-js could leave a Version with half its bands (ADR 0011).
    await expect(saveRigTuneVersion(draft())).resolves.toEqual({ ok: true })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('mint_rig_tune_version', {
      p_effective_from: '2026-07-12',
      p_note: 'First tune measured off the boat with a caliper.',
      p_bands: [
        {
          low_kt: 0,
          high_kt: null,
          is_base: true,
          label: 'Mac tune',
          note: null,
          gaps_stale: false,
          shrouds: {
            V1: { port: { gap_mm: 72, turns_from_base: 0 }, starboard: { gap_mm: 72, turns_from_base: 0 } },
            D1: { port: { gap_mm: 64, turns_from_base: 0 }, starboard: { gap_mm: 64, turns_from_base: 0 } },
            D2: { port: { gap_mm: 61, turns_from_base: 0 }, starboard: { gap_mm: 61, turns_from_base: 0 } },
          },
        },
      ],
    })
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management/rig-tune')
    // And the list the sailor came from, which names the Version in force on its Rig Tune
    // row — it would otherwise still show the superseded one.
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
  })

  it('refuses a viewer, and writes nothing', async () => {
    // ADR 0019: every signed-in sailor reads every Version; only an admin mints one. RLS
    // refuses this a second time, but a Server Action is a public endpoint on its own.
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const result = await saveRigTuneVersion(draft())

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/admin/i), problems: [] })
    expectNoWrite()
  })

  it('refuses a Guest, and writes nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    const result = await saveRigTuneVersion(draft())

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('hands back the validator’s problems rather than writing a table it refused', async () => {
    const result = await saveRigTuneVersion(draft({ change_reason: '   ' }))

    expect(result).toEqual({
      ok: false,
      message: expect.any(String),
      problems: [{ band_key: null, message: 'Say why this Version exists.' }],
    })
    expectNoWrite()
  })

  it('refuses a band table with a hole in it, naming the wind speeds nothing covers', async () => {
    const result = await saveRigTuneVersion(
      draft({
        bands: [
          { ...draft().bands[0], high_kt: '9' },
          {
            key: 'band-2',
            label: 'Heavy',
            low_kt: '12',
            high_kt: '',
            is_base: false,
            note: '',
            shrouds: evenShrouds('-1'),
            gaps_stale: false,
            seed: null,
          },
        ],
      })
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.problems).toEqual([
      { band_key: null, message: 'No band covers 9 to 12 kt.' },
    ])
    expectNoWrite()
  })

  it('reports a refused mint rather than claiming a Version exists', async () => {
    // What RLS returns when the Profile says admin and the database disagrees, and what
    // the RPC raises when the artifact is not lockable by this account.
    rpc.mockResolvedValue({ data: null, error: { message: 'the Rig Tune artifact is not writable by this account' } })

    const result = await saveRigTuneVersion(draft())

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('refuses when there is no Supabase environment to write to', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    const result = await saveRigTuneVersion(draft())

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('correctRigTuneVersion', () => {
  let consoleError: jest.SpyInstance

  const SHROUDS = {
    V1: { port: { gap_mm: 72, turns_from_base: 0 }, starboard: { gap_mm: 72, turns_from_base: 0 } },
    D1: { port: { gap_mm: 64, turns_from_base: 0 }, starboard: { gap_mm: 64, turns_from_base: 0 } },
    D2: { port: { gap_mm: 61, turns_from_base: 0 }, starboard: { gap_mm: 61, turns_from_base: 0 } },
  }

  /** v1, v2 and v3 of the Rig Tune as the database holds them; v2 is the one corrected. */
  const VERSIONS = [
    {
      id: 'v1',
      version_number: 1,
      effective_from: '2026-05-04',
      bands: [{ id: 'v1-base', low_kt: 0, high_kt: null }],
    },
    {
      id: 'v2',
      version_number: 2,
      effective_from: '2026-07-12',
      bands: [
        { id: 'band-base', low_kt: 0, high_kt: 10 },
        { id: 'band-breeze', low_kt: 10, high_kt: null },
      ],
    },
    {
      id: 'v3',
      version_number: 3,
      effective_from: '2026-09-01',
      bands: [{ id: 'v3-base', low_kt: 0, high_kt: null }],
    },
  ]

  /** One recorded band of v2, opened for correction: its key is its row id, and it has a seed. */
  function recorded(over: Partial<RigTuneBandDraft>): RigTuneBandDraft {
    return {
      key: 'band-base',
      label: 'Mac base',
      low_kt: '0',
      high_kt: '10',
      is_base: true,
      note: '',
      shrouds: evenShrouds(),
      gaps_stale: false,
      seed: { shrouds: SHROUDS, gaps_stale: false, was_base: true },
      ...over,
    }
  }

  /** v2 opened for correction, with the band that was never entered added between the two. */
  function corrected(over: Partial<RigTuneDraft> = {}): RigTuneDraft {
    return {
      effective_from: '2026-07-12',
      change_reason: 'First tune measured off the boat with a caliper.',
      bands: [
        recorded({ high_kt: '6' }),
        {
          key: 'band-local-1',
          label: 'Forgotten',
          low_kt: '6',
          high_kt: '10',
          is_base: false,
          note: '',
          shrouds: evenShrouds('-0.5'),
          gaps_stale: false,
          seed: null,
        },
        recorded({
          key: 'band-breeze',
          label: 'Breeze',
          low_kt: '10',
          high_kt: '',
          is_base: false,
          shrouds: evenShrouds('1'),
          gaps_stale: true,
          seed: { shrouds: SHROUDS, gaps_stale: true, was_base: false },
        }),
      ],
      ...over,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(ADMIN)
    versionsEq.mockResolvedValue({ data: VERSIONS, error: null })
    racesIn.mockResolvedValue({ data: [], error: null })
    rpc.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('corrects the Version in place in one call, sending kept bands under their own ids', async () => {
    await expect(correctRigTuneVersion('v2', corrected())).resolves.toEqual({ ok: true })

    expect(versionsEq).toHaveBeenCalledWith('kind', 'rig_tune')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('correct_rig_tune_version')
    expect(args.p_version_id).toBe('v2')
    expect(args.p_effective_from).toBe('2026-07-12')
    expect(args.p_note).toBe('First tune measured off the boat with a caliper.')
    // Kept bands keep their row, so every Race set to one still is; the added band has none.
    // The breeze band's flag is the sailor's, carried as stated rather than recomputed.
    expect(
      args.p_bands.map((b: { id: string | null; low_kt: number; gaps_stale: boolean }) => [
        b.id,
        b.low_kt,
        b.gaps_stale,
      ])
    ).toEqual([
      ['band-base', 0, false],
      [null, 6, false],
      ['band-breeze', 10, true],
    ])
  })

  it('revalidates the Rig Tune, the Boat Setup list, and every Race page that shows a band', async () => {
    await correctRigTuneVersion('v2', corrected())

    expect(revalidatePath).toHaveBeenCalledWith('/boat-management/rig-tune')
    expect(revalidatePath).toHaveBeenCalledWith('/boat-management')
    expect(revalidatePath).toHaveBeenCalledWith('/boat-performance/races/[raceId]', 'layout')
  })

  it('refuses a viewer, and writes nothing', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const result = await correctRigTuneVersion('v2', corrected())

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/admin/i), problems: [] })
    expectNoWrite()
  })

  it('refuses a table a new Version would refuse', async () => {
    const draft = corrected()
    const result = await correctRigTuneVersion('v2', {
      ...draft,
      bands: [draft.bands[0], draft.bands[2]],
    })

    expect(result.ok === false && result.problems).toEqual([
      { band_key: null, message: 'No band covers 6 to 10 kt.' },
    ])
    expectNoWrite()
  })

  it('refuses a date before the previous Version took effect, naming it', async () => {
    const result = await correctRigTuneVersion('v2', corrected({ effective_from: '2026-05-03' }))

    expect(result.ok === false && result.problems).toEqual([
      {
        band_key: null,
        message: 'v1 took effect on 4 May 2026, so v2 cannot take effect before it.',
      },
    ])
    expectNoWrite()
  })

  it('refuses a date after the next Version took effect, naming it', async () => {
    const result = await correctRigTuneVersion('v2', corrected({ effective_from: '2026-09-02' }))

    expect(result.ok === false && result.problems).toEqual([
      {
        band_key: null,
        message: 'v3 took effect on 1 Sep 2026, so v2 cannot take effect after it.',
      },
    ])
    expectNoWrite()
  })

  it('accepts a date on the very day a neighbour took effect', async () => {
    await expect(
      correctRigTuneVersion('v2', corrected({ effective_from: '2026-09-01' }))
    ).resolves.toEqual({ ok: true })
    await expect(
      correctRigTuneVersion('v2', corrected({ effective_from: '2026-05-04' }))
    ).resolves.toEqual({ ok: true })
  })

  it('refuses to remove a band a Race was set to, naming the Races to amend first', async () => {
    racesIn.mockResolvedValue({
      data: [
        { title: 'Beer can', window_start: '2026-07-22T18:00:30', rig_tune_band_id: 'band-breeze' },
        { title: null, window_start: '2026-08-05T18:10:00', rig_tune_band_id: 'band-breeze' },
      ],
      error: null,
    })
    const draft = corrected()

    const result = await correctRigTuneVersion('v2', {
      ...draft,
      bands: [draft.bands[0], { ...draft.bands[1], high_kt: '' }],
    })

    expect(racesIn).toHaveBeenCalledWith('rig_tune_band_id', ['band-breeze'])
    expect(result.ok === false && result.problems).toEqual([
      {
        band_key: null,
        message:
          'The 10 kt and up band cannot be removed: Beer can (22 Jul 2026) and an untitled race (5 Aug 2026) were sailed set to it. Amend those Races onto another band first.',
      },
    ])
    expectNoWrite()
  })

  it('removes a band no Race was set to', async () => {
    const draft = corrected()

    await expect(
      correctRigTuneVersion('v2', {
        ...draft,
        bands: [draft.bands[0], { ...draft.bands[1], high_kt: '' }],
      })
    ).resolves.toEqual({ ok: true })

    expect(rpc.mock.calls[0][1].p_bands).toHaveLength(2)
  })

  it('refuses a Version that is not a Rig Tune Version it can read', async () => {
    const result = await correctRigTuneVersion('v9', corrected())

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('refuses a band id that is not one of this Version’s, rather than sending it', async () => {
    // A recorded band's key is its row id, and a crafted request could name another
    // Version's band. The database refuses it too; this says so without the round trip.
    const draft = corrected()
    const result = await correctRigTuneVersion('v2', {
      ...draft,
      bands: [{ ...draft.bands[0], key: 'v1-base' }, draft.bands[1], draft.bands[2]],
    })

    expect(result.ok).toBe(false)
    expectNoWrite()
  })

  it('reports a refused correction rather than claiming the Version changed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'violates foreign key constraint' } })

    const result = await correctRigTuneVersion('v2', corrected())

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('reports a failed read rather than guessing the neighbours', async () => {
    versionsEq.mockResolvedValue({ data: null, error: { message: 'permission denied' } })

    const result = await correctRigTuneVersion('v2', corrected())

    expect(result.ok).toBe(false)
    expectNoWrite()
    expect(consoleError).toHaveBeenCalled()
  })
})

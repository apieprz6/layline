import { saveRigTuneVersion } from '../actions'
import { CREW } from '@/__tests__/fixtures/accounts'
import type { RigTuneDraft, RigTunePositionDraft, ShroudPosition } from '@/types'

const rpc = jest.fn()
const createClient = jest.fn(async () => ({ rpc }))

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

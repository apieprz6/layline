/**
 * @jest-environment node
 */

/**
 * POST /api/storage/sweep — who may run the sweep, and what they get back.
 *
 * The sweep's decisions are tested where they are made. What matters here is that a viewer cannot
 * start one and that an admin is told what it did: a sweeper that removes things and answers "ok"
 * gives nobody a way to know whether it was working.
 */

import { POST } from '../route'
import { CREW } from '@/__tests__/fixtures/accounts'

const runSweep = jest.fn()

jest.mock('@/services/storage/runSweep', () => ({ runSweep: (...args: unknown[]) => runSweep(...args) }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn(async () => ({ marker: 'client' })) }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

const OWNER = { ...CREW, role: 'admin' as const }

const REPORT = {
  removed: [
    { path: 'tmp/user-1/upload-1/08-22-26-glr.csv', reason: 'abandoned-upload', age_seconds: 90_000 },
  ],
  kept: [{ path: 'recordings/abc/', reason: 'recording-exists', age_seconds: null }],
  failed: [],
  grace: { tmp_seconds: 86_400, recording_seconds: 900 },
}

describe('POST /api/storage/sweep', () => {
  let consoleError: jest.SpyInstance
  let consoleWarn: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(OWNER)
    runSweep.mockResolvedValue(REPORT)
  })

  afterEach(() => {
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  it('runs the sweep for an admin and reports what it removed', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(REPORT)
    expect(runSweep).toHaveBeenCalledTimes(1)
  })

  it('refuses a viewer without sweeping anything', async () => {
    resolveAccount.mockResolvedValue(CREW)

    const response = await POST()

    expect(response.status).toBe(403)
    // The Storage policies would refuse the deletes anyway, but a sweep that got as far as listing
    // the bucket and then removed nothing would report a clean bucket to someone who cannot clean it.
    expect(runSweep).not.toHaveBeenCalled()
  })

  it('refuses a Guest', async () => {
    resolveAccount.mockResolvedValue(null)

    const response = await POST()

    expect(response.status).toBe(401)
    expect(runSweep).not.toHaveBeenCalled()
  })

  it('says the sweep failed rather than reporting an empty one', async () => {
    runSweep.mockRejectedValue(new Error('the recordings table could not be read: no rows returned'))

    const response = await POST()

    expect(response.status).toBe(500)
    // Named, because the one person who can read this is the one person who can act on it.
    await expect(response.json()).resolves.toEqual({
      error: 'the recordings table could not be read: no rows returned',
    })
  })

  it('never answers a GET', () => {
    // A sweep deletes objects, so it is not something a prefetch, a crawler or a pasted URL can start.
    const route = jest.requireActual('../route') as Record<string, unknown>

    expect(route.GET).toBeUndefined()
  })
})

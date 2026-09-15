/**
 * @jest-environment node
 */

import { GET } from '../route'
import { CREW } from '@/__tests__/fixtures/accounts'

const versionMaybeSingle = jest.fn()
const createSignedUrl = jest.fn()

const from = jest.fn((table: string) => {
  if (table !== 'boat_setup_versions') throw new Error(`the Polar download touched ${table}`)
  return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: versionMaybeSingle }) }) }) }
})

const createClient = jest.fn(async () => ({
  from,
  storage: { from: () => ({ createSignedUrl }) },
}))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

const VERSION_ID = '3f1b2c4d-0000-4000-8000-000000000001'

const SIGNED = 'https://project.supabase.co/storage/v1/object/sign/boat/x?token=abc'

function request(): Request {
  return new Request(`http://localhost/api/boat-setup/polar/${VERSION_ID}/download`)
}

function context(versionId = VERSION_ID): { params: Promise<{ versionId: string }> } {
  return { params: Promise.resolve({ versionId }) }
}

describe('GET /api/boat-setup/polar/{versionId}/download', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(CREW)
    versionMaybeSingle.mockResolvedValue({
      data: { id: VERSION_ID, filename: 'FIRST_10R.pol' },
      error: null,
    })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('redirects a signed-in sailor to the bytes', async () => {
    const response = await GET(request(), context())

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(SIGNED)
  })

  it('signs the path derived from the id and the stored filename', async () => {
    await GET(request(), context())

    // The path is derived, never stored: `lib/storage/paths.ts` owns the convention.
    expect(createSignedUrl).toHaveBeenCalledWith(
      `boat-setup/polar/${VERSION_ID}/FIRST_10R.pol`,
      60,
      { download: 'FIRST_10R.pol' }
    )
  })

  it('never lets a one-off location be cached', async () => {
    const response = await GET(request(), context())

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('gives a viewer the same bytes as an admin', async () => {
    // Role governs writes only (ADR 0019): every signed-in sailor reads every Version.
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const response = await GET(request(), context())

    expect(response.status).toBe(302)
  })

  it('refuses a Guest, and reads nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    const response = await GET(request(), context())

    // A 401 rather than a redirect to the Auth Sheet: this is not a screen, and a browser
    // following a download link has nowhere to put a sign-in offer.
    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('has nothing to offer for a uuid that is no Version of the Polar', async () => {
    // The row is not there: a stale link, or the id of another artifact's Version.
    versionMaybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(request(), context('3f1b2c4d-0000-4000-8000-00000000ffff'))

    expect(response.status).toBe(404)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('answers a malformed id itself, without asking the database', async () => {
    // `id=eq.not-a-version` is a 22P02 error, which would come back as a 500 and a logged fault
    // of ours. A malformed id is a Version that does not exist, and that is a 404.
    const response = await GET(request(), context('not-a-version'))

    expect(response.status).toBe(404)
    expect(from).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('has nothing to offer for a Version whose file was never recorded', async () => {
    // `filename` is nullable on the table — a Version of an artifact that is not file-backed.
    // There is no path to derive and so nothing to download.
    versionMaybeSingle.mockResolvedValue({ data: { id: VERSION_ID, filename: null }, error: null })

    const response = await GET(request(), context())

    expect(response.status).toBe(404)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('reports a failed read as a failure, not as a missing Version', async () => {
    versionMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const response = await GET(request(), context())

    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalled()
  })

  it('says so loudly when the row exists and the bytes do not', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })

    const response = await GET(request(), context())

    // ADR 0013 accepts bytes with no row; a row with no bytes is the case it works to avoid.
    expect(response.status).toBe(502)
    expect(consoleError).toHaveBeenCalled()
  })

  it('degrades to a 500 with no Supabase environment', async () => {
    createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

    const response = await GET(request(), context())

    expect(response.status).toBe(500)
  })
})

/**
 * @jest-environment node
 */

import { GET } from '../route'
import { CREW } from '@/__tests__/fixtures/accounts'

const versionSelect = jest.fn()
const versionMaybeSingle = jest.fn()
const createSignedUrl = jest.fn()

const from = jest.fn((table: string) => {
  if (table !== 'boat_setup_versions') {
    throw new Error(`the Crossover Chart download touched ${table}`)
  }
  return {
    select: (columns: string) => {
      versionSelect(columns)
      return { eq: () => ({ eq: () => ({ maybeSingle: versionMaybeSingle }) }) }
    },
  }
})

const createClient = jest.fn(async () => ({
  from,
  storage: { from: () => ({ createSignedUrl }) },
}))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

const VERSION_ID = '7c1b2c4d-0000-4000-8000-000000000001'

const SIGNED = 'https://project.supabase.co/storage/v1/object/sign/boat/x?token=abc'

const ROW = {
  id: VERSION_ID,
  filename: 'HandsomePete_2026.sailselect',
  payload: {
    source: {
      format: 'qtvlm-sailselect',
      header_token: 'TWA/TWS',
      definitions: {
        format: 'qtvlm-saildesc',
        filename: 'HandsomePete_2026.saildef',
        content_sha256: 'b'.repeat(64),
      },
    },
  },
}

function request(query = ''): Request {
  return new Request(
    `http://localhost/api/boat-setup/crossover-chart/${VERSION_ID}/download${query}`
  )
}

function context(versionId = VERSION_ID): { params: Promise<{ versionId: string }> } {
  return { params: Promise.resolve({ versionId }) }
}

/**
 * Downloading either half of a **Crossover Chart Version**.
 *
 * The permission, the private bucket, the derived path and the 302 are `boatSetupDownload`'s, and
 * the Polar's own route test exercises all of them. What is tested here is this route's own job:
 * that both files come back, that they come from the one prefix, and that a selector nobody
 * recognises is refused rather than answered with the wrong file.
 */
describe('GET /api/boat-setup/crossover-chart/{versionId}/download', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(CREW)
    versionMaybeSingle.mockResolvedValue({ data: ROW, error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('serves the grid by default, under the filename on the row', async () => {
    const response = await GET(request(), context())

    expect(response.status).toBe(302)
    expect(createSignedUrl).toHaveBeenCalledWith(
      `boat-setup/crossover_chart/${VERSION_ID}/HandsomePete_2026.sailselect`,
      60,
      { download: 'HandsomePete_2026.sailselect' }
    )
  })

  it('reads no payload at all to serve the grid', async () => {
    await GET(request(), context())

    expect(versionSelect).toHaveBeenCalledWith(expect.not.stringContaining('payload'))
  })

  it('serves the definitions from the same prefix, under their own filename', async () => {
    const response = await GET(request('?file=definitions'), context())

    expect(response.status).toBe(302)
    // One Version, one prefix, two objects. The definitions half has no filename column of its
    // own, so its name comes out of the payload's provenance (ADR 0022).
    expect(createSignedUrl).toHaveBeenCalledWith(
      `boat-setup/crossover_chart/${VERSION_ID}/HandsomePete_2026.saildef`,
      60,
      { download: 'HandsomePete_2026.saildef' }
    )
  })

  it('accepts the grid named explicitly', async () => {
    const response = await GET(request('?file=grid'), context())

    expect(response.status).toBe(302)
    expect(createSignedUrl).toHaveBeenCalledWith(
      expect.stringContaining('HandsomePete_2026.sailselect'),
      60,
      expect.anything()
    )
  })

  it('refuses a selector it does not recognise rather than guessing', async () => {
    const response = await GET(request('?file=saildef'), context())

    // Answering with the grid would hand the sailor the wrong file without saying so.
    expect(response.status).toBe(400)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('has nothing to offer when the payload records no definitions filename', async () => {
    versionMaybeSingle.mockResolvedValue({
      data: { ...ROW, payload: { source: { format: 'qtvlm-sailselect' } } },
      error: null,
    })

    const response = await GET(request('?file=definitions'), context())

    expect(response.status).toBe(404)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('still serves the definitions when the payload no longer passes the schema', async () => {
    // The stored bytes of both files are retained and downloadable. A payload rule tightened years
    // after the upload must not take the sailor's own file down with it: the filename is
    // provenance, not validity.
    versionMaybeSingle.mockResolvedValue({
      data: { ...ROW, payload: { ...ROW.payload, cells: [[9]], sail_definitions: [] } },
      error: null,
    })

    const response = await GET(request('?file=definitions'), context())

    expect(response.status).toBe(302)
  })

  it('refuses a Guest, and reads nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    const response = await GET(request('?file=definitions'), context())

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('gives a viewer the same bytes as an admin', async () => {
    // Role governs writes only (ADR 0019): every signed-in sailor reads every Version.
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    const response = await GET(request('?file=definitions'), context())

    expect(response.status).toBe(302)
  })

  it('answers a malformed id itself, without asking the database', async () => {
    const response = await GET(request(), context('not-a-version'))

    expect(response.status).toBe(404)
    expect(from).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})

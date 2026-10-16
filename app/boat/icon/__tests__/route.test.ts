/**
 * @jest-environment node
 */

import { GET } from '../route'
import { CREW } from '@/__tests__/fixtures/accounts'

const boatMaybeSingle = jest.fn()
const download = jest.fn()

const from = jest.fn((table: string) => {
  if (table !== 'boats') throw new Error(`the boat icon touched ${table}`)
  return { select: () => ({ maybeSingle: boatMaybeSingle }) }
})

const storageFrom = jest.fn(() => ({ download }))

const createClient = jest.fn(async () => ({ from, storage: { from: storageFrom } }))

jest.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

/** The first bytes of a real PNG: its signature, then the start of an IHDR chunk. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])

const ICON_PATH = 'boat-identity/icon/pete.png'

function request(): Request {
  return new Request('http://localhost/boat/icon?v=2026-10-16T18%3A00%3A00Z')
}

describe('GET /boat/icon', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    resolveAccount.mockResolvedValue(CREW)
    boatMaybeSingle.mockResolvedValue({ data: { icon_path: ICON_PATH }, error: null })
    download.mockResolvedValue({ data: new Blob([PNG]), error: null })
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('serves a signed-in sailor the icon’s bytes exactly as uploaded', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
    expect(storageFrom).toHaveBeenCalledWith('boat')
    expect(download).toHaveBeenCalledWith(ICON_PATH)
  })

  it('names the type the bytes are, and lets only this browser cache them', async () => {
    const response = await GET(request())

    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    // Private, so no shared cache ever holds the boat's icon for a Guest to be served.
    expect(response.headers.get('cache-control')).toMatch(/^private\b/)
  })

  it('holds the bytes for good only under a version key, which changes when the icon does', async () => {
    const keyed = await GET(request())
    const bare = await GET(new Request('http://localhost/boat/icon'))

    expect(keyed.headers.get('cache-control')).toMatch(/immutable/)
    // No key, nothing to invalidate it by — so the browser asks again every time.
    expect(bare.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('refuses a Guest, and reads nothing', async () => {
    resolveAccount.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('is a 404 when the boat has no icon', async () => {
    boatMaybeSingle.mockResolvedValue({ data: { icon_path: null }, error: null })

    const response = await GET(request())

    expect(response.status).toBe(404)
    expect(download).not.toHaveBeenCalled()
  })

  it('is a 500 when the boat cannot be read', async () => {
    boatMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const response = await GET(request())

    expect(response.status).toBe(500)
  })

  it('is a 502 when the row names bytes Storage cannot give back', async () => {
    download.mockResolvedValue({ data: null, error: { message: 'Object not found' } })

    const response = await GET(request())

    expect(response.status).toBe(502)
  })
})

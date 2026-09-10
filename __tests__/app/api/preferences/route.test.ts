/**
 * @jest-environment node
 */

/**
 * `supabase.auth.getUser()` refreshes an expired session, which writes auth
 * cookies onto whatever response this handler returns. Every response it can
 * return therefore has to carry the no-store headers, including the error ones.
 * See LAY-121.
 */

import { NextRequest } from 'next/server'

const createClient = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

type User = { id: string } | null

/**
 * Stands in for the server client, filling the caller's Headers the way a
 * session refresh does.
 */
function mockClient({
  user,
  refreshes = true,
  profile = null,
  upsertError = null,
}: {
  user: User
  refreshes?: boolean
  profile?: { preferences: unknown } | null
  upsertError?: { message: string } | null
}) {
  createClient.mockImplementation(async (responseHeaders?: Headers) => {
    if (refreshes) {
      Object.entries(NO_STORE_HEADERS).forEach(([key, value]) =>
        responseHeaders?.set(key, value)
      )
    }
    return {
      auth: {
        getUser: async () => ({
          data: { user },
          error: user ? null : { message: 'no session' },
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: profile,
              error: profile ? null : { code: 'PGRST116' },
            }),
          }),
        }),
        upsert: () => ({
          select: () => ({
            single: async () => ({
              data: upsertError ? null : profile,
              error: upsertError,
            }),
          }),
        }),
      }),
    }
  })
}

function expectNoStore(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe(
    'private, no-cache, no-store, must-revalidate, max-age=0'
  )
  expect(response.headers.get('Expires')).toBe('0')
  expect(response.headers.get('Pragma')).toBe('no-cache')
}

const VALID_PREFERENCES = {
  dataSources: {
    chii2: { enabled: true, displayName: 'Harrison Dever Crib' },
    45198: { enabled: false, displayName: 'Purdue Buoy' },
  },
}

function putRequest(body: unknown) {
  return new NextRequest('https://layline.test/api/preferences', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.resetModules()
  createClient.mockReset()
})

describe('GET /api/preferences', () => {
  it('carries the no-store headers on a defaults response', async () => {
    mockClient({ user: { id: 'sailor-1' } })

    const { GET } = await import('@/app/api/preferences/route')
    const response = await GET()

    expect(response.status).toBe(200)
    expectNoStore(response)
  })

  it('carries the no-store headers on stored preferences', async () => {
    mockClient({ user: { id: 'sailor-1' }, profile: { preferences: VALID_PREFERENCES } })

    const { GET } = await import('@/app/api/preferences/route')
    const response = await GET()

    await expect(response.json()).resolves.toEqual(VALID_PREFERENCES)
    expectNoStore(response)
  })

  it('carries the no-store headers on the 401', async () => {
    mockClient({ user: null })

    const { GET } = await import('@/app/api/preferences/route')
    const response = await GET()

    expect(response.status).toBe(401)
    expectNoStore(response)
  })

  it('sets no cache headers when the session needed no refresh', async () => {
    mockClient({ user: { id: 'sailor-1' }, refreshes: false })

    const { GET } = await import('@/app/api/preferences/route')
    const response = await GET()

    expect(response.headers.get('Cache-Control')).toBeNull()
  })
})

describe('PUT /api/preferences', () => {
  it('carries the no-store headers on success', async () => {
    mockClient({ user: { id: 'sailor-1' }, profile: { preferences: VALID_PREFERENCES } })

    const { PUT } = await import('@/app/api/preferences/route')
    const response = await PUT(putRequest(VALID_PREFERENCES))

    expect(response.status).toBe(200)
    expectNoStore(response)
  })

  it('carries the no-store headers on the 400', async () => {
    mockClient({ user: { id: 'sailor-1' } })

    const { PUT } = await import('@/app/api/preferences/route')
    const response = await PUT(putRequest({ dataSources: {} }))

    expect(response.status).toBe(400)
    expectNoStore(response)
  })

  it('carries the no-store headers on the 401', async () => {
    mockClient({ user: null })

    const { PUT } = await import('@/app/api/preferences/route')
    const response = await PUT(putRequest(VALID_PREFERENCES))

    expect(response.status).toBe(401)
    expectNoStore(response)
  })

  it('carries the no-store headers on a database failure', async () => {
    mockClient({ user: { id: 'sailor-1' }, upsertError: { message: 'boom' } })
    jest.spyOn(console, 'error').mockImplementation(() => {})

    const { PUT } = await import('@/app/api/preferences/route')
    const response = await PUT(putRequest(VALID_PREFERENCES))

    expect(response.status).toBe(500)
    expectNoStore(response)
  })
})

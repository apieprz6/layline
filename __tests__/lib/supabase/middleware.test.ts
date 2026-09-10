/**
 * @jest-environment node
 */

/**
 * `@supabase/ssr` passes a second argument to `setAll`: the headers that must
 * ride along with any response that sets auth cookies. Dropping them leaves a
 * `Set-Cookie` response cacheable by a CDN, which can serve one sailor's
 * session token to another. See LAY-121.
 */

import { NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }
type SetAll = (cookies: CookieToSet[], headers: Record<string, string>) => void

const createServerClient = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}))

/** The headers `@supabase/ssr` hands us when it writes auth cookies. */
const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

const COOKIES_TO_SET: CookieToSet[] = [
  { name: 'sb-access-token', value: 'refreshed-access', options: { path: '/' } },
  { name: 'sb-refresh-token', value: 'refreshed-refresh', options: { path: '/' } },
]

/**
 * Stands in for Supabase: refreshing the session inside `getUser()` is what
 * triggers `setAll`, so the mock calls it the way the library would.
 */
function mockRefreshOnGetUser(
  cookiesToSet: CookieToSet[] = COOKIES_TO_SET,
  headers: Record<string, string> = NO_STORE_HEADERS
) {
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll(cookiesToSet, headers)
          return { data: { user: null }, error: null }
        },
      },
    })
  )
}

/** Supabase writes no cookies when the session needs no refresh. */
function mockNoRefreshOnGetUser() {
  createServerClient.mockImplementation(() => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }))
}

describe('updateSession', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    createServerClient.mockReset()
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  async function runUpdateSession() {
    const { updateSession } = await import('@/lib/supabase/middleware')
    return updateSession(new NextRequest('https://layline.test/dashboard'))
  }

  it('puts the no-store headers from setAll onto the response', async () => {
    mockRefreshOnGetUser()

    const response = await runUpdateSession()

    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0'
    )
    expect(response.headers.get('Expires')).toBe('0')
    expect(response.headers.get('Pragma')).toBe('no-cache')
  })

  it('still sets the refreshed auth cookies on the response', async () => {
    mockRefreshOnGetUser()

    const response = await runUpdateSession()

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-access')
    expect(response.cookies.get('sb-refresh-token')?.value).toBe('refreshed-refresh')
  })

  it('adds no cache headers when Supabase writes no cookies', async () => {
    mockNoRefreshOnGetUser()

    const response = await runUpdateSession()

    expect(response.headers.get('Cache-Control')).toBeNull()
    expect(response.headers.get('Pragma')).toBeNull()
  })

  it('tolerates a setAll call with no headers to apply', async () => {
    mockRefreshOnGetUser(COOKIES_TO_SET, {})

    const response = await runUpdateSession()

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-access')
    expect(response.headers.get('Cache-Control')).toBeNull()
  })
})

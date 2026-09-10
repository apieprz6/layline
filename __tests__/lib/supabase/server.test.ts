/**
 * @jest-environment node
 */

/**
 * The server client has no response of its own to mutate, so callers that do
 * have one — Route Handlers, Server Actions — pass a `Headers` for it to fill.
 * Server Components pass nothing: they cannot write cookies either, and the
 * `try/catch` swallows both. See LAY-121.
 */

import type { CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }
type SetAll = (cookies: CookieToSet[], headers: Record<string, string>) => void

const createServerClient = jest.fn()
const cookies = jest.fn()

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}))

jest.mock('next/headers', () => ({
  cookies: () => cookies(),
}))

const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
}

const COOKIES_TO_SET: CookieToSet[] = [
  { name: 'sb-access-token', value: 'refreshed-access', options: { path: '/' } },
]

/** Captures the `setAll` the client was built with so a test can drive it. */
let capturedSetAll: SetAll

beforeEach(() => {
  jest.resetModules()
  createServerClient.mockReset()
  cookies.mockReset()
  createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => {
      capturedSetAll = options.cookies.setAll
      return {}
    }
  )
})

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

/** A writable cookie store, as a Route Handler or Server Action sees it. */
function writableCookieStore() {
  const set = jest.fn()
  cookies.mockResolvedValue({ getAll: () => [], set })
  return set
}

/** A Server Component's read-only store: writing throws. */
function readOnlyCookieStore() {
  const set = jest.fn(() => {
    throw new Error('Cookies can only be modified in a Server Action or Route Handler')
  })
  cookies.mockResolvedValue({ getAll: () => [], set })
  return set
}

describe('createClient', () => {
  it('fills a caller-supplied Headers with the no-store headers', async () => {
    writableCookieStore()
    const responseHeaders = new Headers()

    const { createClient } = await import('@/lib/supabase/server')
    await createClient(responseHeaders)
    capturedSetAll(COOKIES_TO_SET, NO_STORE_HEADERS)

    expect(responseHeaders.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0'
    )
    expect(responseHeaders.get('Expires')).toBe('0')
    expect(responseHeaders.get('Pragma')).toBe('no-cache')
  })

  it('still writes the cookies to the cookie store', async () => {
    const set = writableCookieStore()

    const { createClient } = await import('@/lib/supabase/server')
    await createClient(new Headers())
    capturedSetAll(COOKIES_TO_SET, NO_STORE_HEADERS)

    expect(set).toHaveBeenCalledWith('sb-access-token', 'refreshed-access', { path: '/' })
  })

  it('does not require a Headers argument', async () => {
    writableCookieStore()

    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    expect(() => capturedSetAll(COOKIES_TO_SET, NO_STORE_HEADERS)).not.toThrow()
  })

  it('swallows the Server Component write rather than throwing', async () => {
    readOnlyCookieStore()

    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    expect(() => capturedSetAll(COOKIES_TO_SET, NO_STORE_HEADERS)).not.toThrow()
  })

  it('keeps the no-store headers when the cookie write fails partway', async () => {
    readOnlyCookieStore()
    const responseHeaders = new Headers()

    const { createClient } = await import('@/lib/supabase/server')
    await createClient(responseHeaders)
    capturedSetAll(COOKIES_TO_SET, NO_STORE_HEADERS)

    // A failed write can still have landed a Set-Cookie, so the response has to
    // stay uncacheable even though the write threw.
    expect(responseHeaders.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0'
    )
  })
})

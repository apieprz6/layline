import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * When Supabase refreshes the session it writes auth cookies, and a response
 * that carries them must not be cached by a CDN or reverse proxy — otherwise
 * one sailor's session token can be served to another. `@supabase/ssr` hands
 * us the no-store headers to prevent that, but this client has no response of
 * its own to put them on.
 *
 * @param responseHeaders Headers to receive the no-store headers, for a Route
 *   Handler that builds its own response. Omit everywhere else: neither a
 *   Server Component nor a Server Action can set headers on its own reply, and
 *   the middleware client covers those requests.
 */
export async function createClient(responseHeaders?: Headers) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet, headers) {
        // Ahead of the writes, and outside the catch: auth cookies are written
        // one at a time, so a write that fails partway can still have put a
        // Set-Cookie on the response. That response must not be cached either.
        Object.entries(headers).forEach(([key, value]) =>
          responseHeaders?.set(key, value)
        )
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component - cookies are read-only here
        }
      },
    },
  })
}

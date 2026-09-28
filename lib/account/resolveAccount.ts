import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Account, UserRole } from '@/types'

/**
 * Resolves the **Account** for the current request, or `null` for a **Guest**.
 *
 * Called once, from `app/(app)/layout.tsx`, and the result travels down as a
 * prop — there is no context and no client-side fetch of the signed-in sailor
 * (ADR 0018).
 *
 * It verifies with `getClaims()` rather than `getUser()`: the middleware already
 * spends a `getUser()` network round trip on every request purely to rotate
 * cookies, and `getClaims()` can check the JWT in-process against a cached JWKS
 * instead of adding a second one — though only for an asymmetric signing key; on
 * an `HS256` project it falls back to `getUser()` itself, so it is never worse and
 * not always cheaper (`docs/testing/account-resolution.md`). Its return type has
 * three arms — data, error, and neither — and each means something different here.
 *
 * The **Role** is read from `profiles`, never from a claim, matching
 * `public.is_admin()`, which is the only server-side authorization predicate the
 * repo has. Note that the `role` claim in every Supabase access token is
 * Postgres's role (`authenticated`), an unrelated thing that happens to share
 * the word.
 */
export async function resolveAccount(): Promise<Account | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    // No Supabase environment: a checkout with no `.env.local`, or a preview
    // deployment that was never given the keys. Everything the drawer offers a
    // Guest still works, so the honest degradation is a Guest — the middleware
    // passes the request through for the same reason rather than failing it.
    console.error(
      'Account resolution: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )

    // Read the cookies anyway. `createClient` throws on the missing keys *before*
    // it gets to its own `cookies()` call, so without this the degraded path is
    // the one path that never touches them — and Next reads that as a route it
    // can prerender, silently turning every screen in the `(app)` group static in
    // a keyless build while production renders them per request. That difference
    // is worse than the missing keys: it is a build that behaves unlike the one
    // it is testing. Whether a request carries a session is a fact about the
    // request whether or not we are equipped to answer it.
    await cookies()

    return null
  }

  const { data, error } = await supabase.auth.getClaims()

  // Arm 1: something went wrong verifying a token that was present — an expired
  // or malformed JWT, or an unreachable JWKS endpoint. The sailor reads the app
  // as a Guest, which is what they can do without a session anyway, and the
  // reason goes to the log rather than to the screen.
  if (error) {
    console.error('Account resolution: getClaims failed:', error.message)
    return null
  }

  // Arm 2: no token at all. The ordinary case — most visitors are Guests.
  if (!data) return null

  const claims = data.claims
  const userId = claims.sub

  // An Account *is* an email plus a Profile (CONTEXT.md), and Google always
  // supplies one, so a verified token without an email is a shape this app has
  // no reading of. Treated as a Guest and logged, rather than shown as an
  // account with a blank address. The address itself is kept exactly as the claim
  // gave it — the trim decides whether there is one, and changes nothing.
  const email = typeof claims.email === 'string' ? claims.email : ''
  if (!email.trim()) {
    console.error(`Account resolution: verified token for ${userId} carries no email claim`)
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('user_id', userId)
    .maybeSingle<{ display_name: string | null; role: UserRole }>()

  if (profileError) {
    console.error('Account resolution: profiles read failed:', profileError.message)
    return null
  }

  // A trigger creates the Profile in the same transaction as the account, and a
  // backfill covered the accounts that predate it (ADR 0017), so a missing row
  // means the promise has broken. Half an Account is not resolved in its place:
  // a Role is a permission, and defaulting one here would invent the very value
  // the database is the authority on.
  //
  // The log line is honest but ambiguous, and knowingly so: a row RLS hides is
  // indistinguishable from a row that does not exist — `maybeSingle()` returns
  // `{ data: null, error: null }` for both, verified in
  // `docs/testing/account-resolution.md`.
  if (!profile) {
    console.error(`Account resolution: no Profile for ${userId} — the trigger from ADR 0017 should guarantee one`)
    return null
  }

  return {
    userId,
    email,
    displayName: profile.display_name,
    role: profile.role,
  }
}

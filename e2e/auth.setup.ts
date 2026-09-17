import path from 'path'
import { test as setup } from '@playwright/test'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Bootstraps the one authenticated session this repo's e2e suite has: a dedicated **admin**
 * fixture, reused by every spec under `e2e/authenticated/` via Playwright's `storageState`.
 *
 * `docs/adr/0020-google-is-the-only-door.md` closes every sign-in path but Google — and Google
 * cannot be driven by an automated browser (`docs/testing/README.md`, "What is not automatable").
 * `supabase/config.toml`'s own comment on `[auth.email] enable_signup` names the way through: the
 * email/password provider is left on **locally only**, "as [ADR 0020's] entire mitigation for
 * having no browser — which needs `signInWithPassword` to work." This file is that mitigation,
 * run once per test invocation rather than by hand.
 *
 * The account this creates is not `sailor@example.com` — the one account already in this stack,
 * almost certainly a real dev identity — and it is not that account's password, either. LAY-137
 * settled on a dedicated fixture precisely so this script can never touch a real one.
 */

const STORAGE_STATE_PATH = path.join(__dirname, '.auth', 'admin.json')

const FIXTURE_EMAIL = 'e2e-admin@example.test'
const FIXTURE_PASSWORD = 'e2e-admin-local-only-fixture'

function assertLocalSupabase(supabaseUrl: string): void {
  const { hostname } = new URL(supabaseUrl)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(
      `e2e/auth.setup.ts refuses to run against a non-local Supabase URL (${supabaseUrl}). ` +
        'This script creates an account and grants it admin — it must never be able to reach a ' +
        'hosted project.'
    )
  }
}

async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const perPage = 200
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((user) => user.email === email)
    if (match) return match.id
    if (data.users.length < perPage) return null
  }
}

/** `cookie`'s `SerializeOptions['sameSite']` (`boolean | 'lax' | 'strict' | 'none'`) is not the
 * same vocabulary as Playwright's cookie `sameSite` (`'Strict' | 'Lax' | 'None'`) — `true` means
 * Strict, not "the default", and every value needs its own mapping rather than a two-way split. */
function toPlaywrightSameSite(sameSite: CookieOptions['sameSite']): 'Strict' | 'Lax' | 'None' {
  if (sameSite === true || sameSite === 'strict') return 'Strict'
  if (sameSite === 'none') return 'None'
  return 'Lax'
}

setup('bootstrap the admin fixture session', async ({ page, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error(
      'e2e/auth.setup.ts needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and ' +
        'SUPABASE_SERVICE_ROLE_KEY — see .env.local.example.'
    )
  }
  assertLocalSupabase(supabaseUrl)

  const admin = createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Idempotent: a fresh `supabase db reset` has none of this, a repeated run has all of it.
  let userId = await findUserIdByEmail(admin, FIXTURE_EMAIL)
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
  }

  // The Profile trigger (LAY-125) has already given this account a `viewer` row by the time
  // `createUser` returns. An authenticated client can never write its own Role — that lock is the
  // point of ADR 0019 — so this has to go through the service-role client, the same authority the
  // SQL console has.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', userId)
  if (roleError) throw roleError

  // Sign in the way a browser would — against the anon endpoint, not as the service role.
  const anon = createServiceClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: FIXTURE_EMAIL,
    password: FIXTURE_PASSWORD,
  })
  if (signInError || !signIn.session) {
    throw signInError ?? new Error('signInWithPassword returned no session for the fixture account')
  }

  // Let `@supabase/ssr` decide the cookie name, encoding and chunking itself — the same package
  // `lib/supabase/server.ts` uses — by driving a real `createServerClient` through `setSession()`
  // and capturing whatever it writes, rather than reproducing that shape by hand.
  const capturedCookies: { name: string; value: string; options: CookieOptions }[] = []
  const ssrClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => capturedCookies.push({ name, value, options }))
      },
    },
  })
  await ssrClient.auth.setSession(signIn.session)

  if (capturedCookies.length === 0) {
    throw new Error(
      '@supabase/ssr wrote no cookies for the fixture session — setSession() may need a moment to ' +
        'notify its onAuthStateChange listener before the cookies land.'
    )
  }

  const { hostname } = new URL(baseURL ?? 'http://127.0.0.1:4200')
  await page.context().addCookies(
    capturedCookies.map(({ name, value, options }) => ({
      name,
      value,
      domain: hostname,
      path: options?.path ?? '/',
      httpOnly: options?.httpOnly ?? true,
      secure: options?.secure ?? false,
      sameSite: toPlaywrightSameSite(options?.sameSite),
      // `options.maxAge` is seconds-from-now (the `cookie` package's shape); Playwright's
      // `expires` wants a Unix timestamp. Omitting this would silently turn the ~400-day cookie
      // `@supabase/ssr` writes into a session-only one that vanishes when the browser closes.
      ...(typeof options?.maxAge === 'number'
        ? { expires: Math.floor(Date.now() / 1000) + options.maxAge }
        : null),
    }))
  )

  await page.context().storageState({ path: STORAGE_STATE_PATH })
})

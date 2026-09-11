'use client'

import { createClient } from '@/lib/supabase/client'
import { relativePathOrHome } from '@/lib/account/nextPath'

/**
 * The two auth operations, both of which run in the **browser**.
 *
 * Not a stylistic choice: `auth-js` implements cross-tab sessions with a
 * `BroadcastChannel`, and **the broadcast is emitted only by the SDK instance
 * that performed the write**. Routing these through Server Actions would emit
 * nothing — not even to the tab that acted — so the other tabs would sit on a
 * stale drawer until they navigated (ADR 0018).
 */

/**
 * Sends the sailor to Google, to come back at `/auth/callback` and be returned
 * to the screen they started from.
 *
 * There is nothing to await for the happy path: the SDK navigates the browser
 * away. A failure here means the handshake never started, which is a
 * misconfiguration rather than a refusal — a refused **Account** fails later, at
 * the callback.
 */
export async function signInWithGoogle(nextPath: string): Promise<void> {
  const supabase = createClient()
  const next = relativePathOrHome(nextPath)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    console.error('Sign-in: the Google handshake did not start:', error.message)
  }
}

/**
 * Signs out of **this browser**, leaving the sailor on the screen they are on
 * (ADR 0018) — no relocation, and no reach across to a session on another device
 * they did not ask about. Other tabs here learn through the broadcast.
 */
export async function signOutHere(): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.auth.signOut({ scope: 'local' })

  if (error) {
    console.error('Sign-out failed:', error.message)
  }
}

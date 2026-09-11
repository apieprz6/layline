'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Re-renders the server-rendered chrome when the signed-in sailor changes.
 *
 * The client subscribes to learn **when** to ask the server again, never **who**
 * is signed in: the rendered **Account** is always the server prop (ADR 0018). A
 * tab that receives a multi-tab broadcast is handed the message payload's session
 * rather than re-reading its own cookies, so a client copy genuinely can disagree
 * with the cookie; using it only as a trigger makes that unobservable.
 *
 * `onAuthStateChange` says far more than "somebody signed in". It fires
 * `INITIAL_SESSION` on mount, `TOKEN_REFRESHED` roughly hourly, and — this is the
 * one that is easy to miss — a fresh **`SIGNED_IN` every time the tab goes from
 * hidden to visible**, carrying the session it already had
 * (`GoTrueClient._onVisibilityChanged` → `_recoverAndRefresh`, which notifies
 * `SIGNED_IN` for a session recovered from storage). Refreshing on any of those
 * would re-render on every page load, every rotation, and every switch back to
 * the browser — and `/` is `force-dynamic`, so each one refetches weather against
 * the cost budget in AGENTS.md.
 *
 * So the event name is not the question. The question is **who**, and only a
 * different answer than last time is a change worth a round trip. A sailor whose
 * `display_name` changed under the same id is not covered by that, and nothing in
 * the app can change one yet; when something can, it will need its own trigger.
 */
export function useRefreshOnIdentityChange(): void {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // `undefined` until the first event says who, if anyone, this tab is holding.
  const lastUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    // This hook runs on every screen in the app, so it must not be the thing that
    // takes the weather down. With no Supabase environment there is no session to
    // change — the same pass-through the middleware and `resolveAccount()` make,
    // and the reason the browser suite can run against a build with no `.env.local`.
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch (thrown: unknown) {
      console.error('Identity changes will not refresh the chrome:', thrown)
      return
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const userId = session?.user?.id ?? null

      // The first event of the page's life only records who this tab is holding;
      // the server already rendered for that sailor.
      if (event === 'INITIAL_SESSION') {
        lastUserId.current = userId
        return
      }

      // The same sailor as last time, whatever the event was called: a rotated
      // token, a tab regaining focus, a broadcast from a sibling tab.
      if (userId === lastUserId.current) return

      lastUserId.current = userId
      startTransition(() => router.refresh())
    })

    return () => subscription.unsubscribe()
  }, [router])
}

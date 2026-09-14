'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import CallbackScreen from './CallbackScreen'

interface CompleteSignInProps {
  /** A path on this origin, already guarded by the route. */
  next: string
}

/**
 * Finishes the sign-in **in the browser**, then puts the sailor back where they
 * were.
 *
 * Two reasons it is not a server-side exchange, and the first is decisive:
 *
 * 1. **A page render cannot write a cookie.** Next 16 only allows a cookie write
 *    in phase `'action'` — a Server Action or a Route Handler — and
 *    `lib/supabase/server.ts` swallows the resulting throw so a Server Component
 *    can still *read* a session. Exchanging here on the server would therefore
 *    spend the single-use code, drop the tokens on the floor, and report success.
 *    ADR 0021 assumed `page.tsx` could do both jobs; it can render, and it cannot
 *    exchange.
 * 2. `auth-js` broadcasts a session change only from the SDK instance that
 *    performed the write, so doing it here is also what lets other open tabs
 *    notice (ADR 0018).
 *
 * There is no `exchangeCodeForSession` call below, deliberately. `createClient()`
 * *is* the exchange: `createBrowserClient` leaves `detectSessionInUrl` on, and
 * `initialize()` spends the `?code=` on this URL together with the stored PKCE
 * verifier before the client will answer any question. `getSession()` awaits that
 * same promise, so it reads the outcome instead of racing it — whereas an
 * explicit `exchangeCodeForSession()` would queue *behind* the automatic one and
 * then fail with a missing verifier, turning a successful sign-in into an error.
 *
 * What that costs is a direct answer: the SDK reports the outcome of an exchange
 * to nobody, and a session read afterwards may be one this browser already had.
 * `_getSessionFromURL` does leave one mark — on success it deletes `code` from the
 * address bar — so a code still sitting there says the session came from the
 * cookie rather than from this round trip. That is logged, not shown: a sailor
 * holding a valid session is sent onward either way.
 */
export default function CompleteSignIn({ next }: CompleteSignInProps): ReactElement {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let abandoned = false

    async function finish(): Promise<void> {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getSession()

      if (abandoned) return

      if (error || !data.session) {
        // Whatever the SDK said goes to the log; the sailor reads the screen.
        console.error(
          'Sign-in did not finish: the code on /auth/callback produced no session.',
          error?.message ?? 'no session and no error'
        )
        setFailed(true)
        return
      }

      // A session, but not necessarily *this* code's session. The SDK strips
      // `code` from the URL when it spends one, so one still there means either a
      // reload of this screen after a sign-in that already worked, or a code this
      // browser had no verifier for while a session was open. The sailor is signed
      // in as somebody, and the server render below will say as whom — so they go
      // onward rather than into a dead end, and the ambiguity goes to the log.
      if (new URLSearchParams(window.location.search).has('code')) {
        console.warn(
          '/auth/callback still carries a code, so the session in this browser is not the one this round trip was asked to create.'
        )
      }

      // A fresh server render of `next` picks up the cookies just written, so the
      // drawer knows the sailor on arrival. No push: the callback is not a place
      // to come back to.
      router.replace(next)
    }

    finish().catch((thrown: unknown) => {
      if (abandoned) return
      console.error('Sign-in did not finish:', thrown)
      setFailed(true)
    })

    return () => {
      abandoned = true
    }
  }, [next, router])

  if (failed) {
    // Deliberately plain. The designed screen for a sign-in that did not finish
    // is LAY-127's, alongside the Refused Stranger it shares a shell with; this
    // is here so the failure is never a blank page with a query string.
    return (
      <CallbackScreen heading="Sign-in didn't finish">
        Something went wrong on the way back from Google. You can try signing in again.
      </CallbackScreen>
    )
  }

  return (
    <CallbackScreen heading="Signing you in" testId="callback-holding" showBack={false}>
      One moment.
    </CallbackScreen>
  )
}

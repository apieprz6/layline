import type { ReactElement } from 'react'
import { redirect } from 'next/navigation'
import { relativePathOrHome } from '@/lib/account/nextPath'
import CompleteSignIn from './CompleteSignIn'
import RefusedStranger from './RefusedStranger'
import SignInDidNotFinish from './SignInDidNotFinish'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

/** Google sends each parameter once; a repeat is somebody playing with the URL. */
function firstOf(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * The one auth route: a `page.tsx`, because it has to render as well as redirect
 * (ADR 0021).
 *
 * It branches on `error_code`, never on `error` — `access_denied` comes back both
 * for a stranger Supabase refused and for a sailor who tapped Cancel on Google's
 * consent screen, and telling the second they are not on the crew list would be
 * a lie about the only thing they did.
 *
 * | On the URL | What happens |
 * |---|---|
 * | `error_code=signup_disabled` | the **Refused Stranger**, full screen |
 * | `error=access_denied`, no `error_code` | nothing at all — straight back |
 * | `?code=` | exchanged in the browser, then onward to `?next=` |
 * | any other error | "Sign-in didn't finish", with a retry |
 * | nothing | onward, as if the URL had not been typed |
 *
 * Whatever the URL said is logged verbatim and shown to nobody: it is developer
 * language about a Supabase instance, addressed to a sailor who was invited by
 * name (ADR 0021, and AGENTS.md's rule about not overwriting what a source gave).
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const params = await searchParams

  const next = relativePathOrHome(firstOf(params.next))
  const code = firstOf(params.code)
  const error = firstOf(params.error)
  const errorCode = firstOf(params.error_code)
  const errorDescription = firstOf(params.error_description)

  if (error || errorCode) {
    console.error(
      'Auth callback carried an error:',
      JSON.stringify({ error, error_code: errorCode, error_description: errorDescription })
    )

    // The refusal. Keyed on `error_code`, because `access_denied` arrives for this
    // *and* for the Cancel button below, and `error` alone cannot tell a stranger
    // with no Account from a sailor who changed their mind.
    if (errorCode === 'signup_disabled') {
      return <RefusedStranger />
    }

    // Cancel on the consent screen. Someone who changed their mind is owed
    // silence, not an explanation — no screen, no message, straight back to where
    // they were.
    if (error === 'access_denied' && !errorCode) {
      redirect(next)
    }

    // Anything else: the handshake broke rather than being refused, and nobody
    // here knows why. Supabase's own words went to the log above.
    return <SignInDidNotFinish next={next} />
  }

  if (code) {
    // The exchange cannot happen here: a page render is not phase 'action', so it
    // cannot write the session cookies. See CompleteSignIn.
    return <CompleteSignIn next={next} />
  }

  redirect(next)
}

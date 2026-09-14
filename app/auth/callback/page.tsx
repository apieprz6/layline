import type { ReactElement } from 'react'
import { redirect } from 'next/navigation'
import { relativePathOrHome } from '@/lib/account/nextPath'
import CompleteSignIn from './CompleteSignIn'
import CallbackScreen from './CallbackScreen'

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
 * | `?code=` | exchanged in the browser, then onward to `?next=` |
 * | `error=access_denied`, no `error_code` | nothing at all — straight back |
 * | any other error | a plain notice; the designed screen is LAY-127's |
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

  if (error) {
    console.error(
      'Auth callback carried an error:',
      JSON.stringify({ error, error_code: errorCode, error_description: errorDescription })
    )

    // Cancel on the consent screen. Someone who changed their mind is owed
    // silence, not an explanation.
    if (error === 'access_denied' && !errorCode) {
      redirect(next)
    }

    // LAY-127 owns what a refused stranger reads, and the branch on `error_code`
    // that tells one from a sign-in that merely broke. This is deliberately not
    // that copy — writing it here would settle a question that ticket is for. It
    // is a floor: never a blank page with a query string on it, and it names no
    // address, because the URL carries none.
    return (
      <CallbackScreen heading="Sign-in didn't finish">
        Something went wrong on the way back from Google.
      </CallbackScreen>
    )
  }

  if (code) {
    // The exchange cannot happen here: a page render is not phase 'action', so it
    // cannot write the session cookies. See CompleteSignIn.
    return <CompleteSignIn next={next} />
  }

  redirect(next)
}

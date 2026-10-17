import type { CSSProperties, ReactElement } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveAccount } from '@/lib/account/resolveAccount'
import CallbackScreen, { BackToTheWeather, filledActionStyle } from '@/app/auth/callback/CallbackScreen'
import RefusedStranger from '@/app/auth/callback/RefusedStranger'
import ConsentSignIn from './ConsentSignIn'
import { allowConnection, cancelConnection } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

const quietButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

function Expired(): ReactElement {
  return (
    <CallbackScreen heading="This connection request has expired" testId="consent-expired" action={<BackToTheWeather />}>
      Start again from your assistant’s connector settings.
    </CallbackScreen>
  )
}

/**
 * The **MCP Server**'s consent screen: where Supabase Auth's OAuth 2.1 server sends a sailor
 * (`authorization_url_path`) when an MCP client such as Claude asks to connect (ADR 0042).
 *
 * | Who arrives | What happens |
 * |---|---|
 * | a **Guest** | Continue with Google, returning here |
 * | signed in, but no **Profile** | the request is denied at once, so no token can be issued, and the **Refused Stranger** screen |
 * | an **Account** | Allow or Cancel, naming the client and who it will read as |
 * | an Account that already allowed this client | straight back to it |
 *
 * Outside the `(app)` group, like `/auth/callback`: a full screen with no drawer behind it, and
 * it borrows that route's shell rather than drawing a second one.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const params = await searchParams
  const raw = params.authorization_id
  const authorizationId = Array.isArray(raw) ? raw[0] : raw
  if (!authorizationId) return <Expired />

  const account = await resolveAccount()
  const supabase = await createClient()

  if (!account) {
    const { data } = await supabase.auth.getClaims()
    if (!data) {
      return <ConsentSignIn next={`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`} />
    }

    // A session with no Account behind it. Denied here, not merely left unanswered, so the
    // request is spent and nothing can approve it later.
    const { error } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (error) console.error('OAuth consent: deny for an account with no Profile failed:', error.message)
    return <RefusedStranger />
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !data) {
    console.error('OAuth consent: authorization details unavailable:', error?.message ?? 'no data')
    return <Expired />
  }

  if ('redirect_url' in data) redirect(data.redirect_url)

  return (
    <CallbackScreen
      heading={`Connect ${data.client.name} to Layline?`}
      testId="consent"
      action={
        <form style={{ display: 'contents' }}>
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" formAction={allowConnection} style={filledActionStyle}>
            Allow
          </button>
          <button type="submit" formAction={cancelConnection} style={quietButtonStyle}>
            Cancel
          </button>
        </form>
      }
    >
      It will read Layline as {account.email}, seeing what you see in the app. It cannot change
      anything.
    </CallbackScreen>
  )
}

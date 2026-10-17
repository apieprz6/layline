'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveAccount } from '@/lib/account/resolveAccount'

function authorizationIdOf(formData: FormData): string {
  const id = formData.get('authorization_id')
  return typeof id === 'string' ? id : ''
}

type Decision = 'approve' | 'deny'

/**
 * Tells Supabase Auth the sailor's answer and follows its redirect back to the MCP client: with
 * an authorization code for Allow, with `access_denied` for Cancel.
 *
 * A request Supabase will not decide (expired, already spent) goes back to the consent screen,
 * which reads it afresh and says it has expired. Supabase's own words go to the log.
 */
async function decide(authorizationId: string, decision: Decision): Promise<never> {
  const supabase = await createClient()
  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })

  if (error || !data) {
    console.error(`OAuth consent: ${decision} failed:`, error?.message ?? 'no redirect')
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`)
  }

  redirect(data.redirect_url)
}

/**
 * Allow. The Account is resolved again here rather than trusted from the render, because a
 * token is what this mints: an account with no **Profile** is denied, never approved (ADR 0042).
 */
export async function allowConnection(formData: FormData): Promise<never> {
  const authorizationId = authorizationIdOf(formData)
  const account = await resolveAccount()
  return decide(authorizationId, account ? 'approve' : 'deny')
}

export async function cancelConnection(formData: FormData): Promise<never> {
  return decide(authorizationIdOf(formData), 'deny')
}

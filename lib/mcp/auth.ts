import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'

export interface McpCaller {
  /** Reads as the caller: row-level security sees their token, never the service role. */
  supabase: SupabaseClient
  authInfo: AuthInfo
}

/**
 * The **Account** behind an MCP request, or `null` to refuse it with a 401.
 *
 * Three things must all hold, and each refusal says nothing about which failed:
 *
 * 1. **A bearer token Supabase verifies.** `getClaims` checks it against the project's keys.
 * 2. **A `client_id` claim.** Supabase's OAuth 2.1 server stamps one on every token it issues to
 *    a connector; a browser session lifted from a cookie carries none, and the MCP Server answers
 *    connectors only.
 * 3. **A Profile.** An Account *is* an email plus a Profile (CONTEXT.md). The consent screen
 *    already refuses an account without one, so this is the same rule enforced a second time at
 *    the door the token is spent at, rather than trusted from the door it was issued at.
 *
 * A missing Supabase environment throws rather than refusing: a 401 would send every MCP client
 * round the sign-in loop for what is a deployment fault.
 */
export async function authenticateMcpRequest(request: Request): Promise<McpCaller | null> {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  if (!match) return null
  const token = match[1]

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data) {
    if (error) console.error('MCP auth: getClaims failed:', error.message)
    return null
  }

  const claims = data.claims
  const clientId = claims.client_id
  if (typeof clientId !== 'string' || !clientId) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', claims.sub)
    .maybeSingle<{ user_id: string }>()

  if (profileError) {
    console.error('MCP auth: profiles read failed:', profileError.message)
    return null
  }
  if (!profile) {
    console.error(`MCP auth: verified token for ${claims.sub} has no Profile`)
    return null
  }

  return {
    supabase,
    authInfo: {
      token,
      clientId,
      // Supabase's scopes govern ID-token contents, not data access; RLS does that.
      scopes: [],
      expiresAt: claims.exp,
      extra: { userId: claims.sub },
    },
  }
}

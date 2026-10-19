import type { ProtectedResourceMetadata } from '@/types'

/**
 * Where the **MCP Server** lives and who signs its callers in, for the 401 challenge and the
 * protected-resource metadata (RFC 9728) an MCP client reads to find Supabase Auth.
 */

export const MCP_PATH = '/api/mcp'

const METADATA_PATH = '/.well-known/oauth-protected-resource'

/**
 * The origin the client actually called. Not `request.url`'s: `next start` rewrites that to its
 * own hostname (`127.0.0.1` comes back as `localhost`), and an MCP client checks that the
 * metadata's `resource` is the URL it connected to. Vercel sets the forwarded headers.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  return forwardedOrigin(request.headers, { host: url.host, proto: url.protocol.replace(/:$/, '') })
}

/**
 * The same origin for a Server Component, which has `headers()` but no `Request`. `next start`
 * sets both forwarded headers on every request it serves and Vercel sets them in front of it, so
 * the fallbacks are only reached by a request that came from neither.
 */
export function headersOrigin(headers: Headers): string {
  return forwardedOrigin(headers, { host: 'localhost', proto: 'https' })
}

function forwardedOrigin(headers: Headers, fallback: { host: string; proto: string }): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? fallback.host
  const proto = headers.get('x-forwarded-proto') ?? fallback.proto
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
}

/**
 * The address a crew member pastes into Claude, ChatGPT or another app. It is the metadata's
 * `resource`, built by this one function, because a client refuses metadata whose `resource`
 * is not the URL it connected to.
 */
export function mcpServerUrl(origin: string): string {
  return `${origin}${MCP_PATH}`
}

/** RFC 9728 §3.1: the resource's path goes after the well-known segment. */
export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}${METADATA_PATH}${MCP_PATH}`
}

/**
 * Supabase's OAuth 2.1 server is the only authorization server, at `<project>/auth/v1`; an MCP
 * client discovers the rest from its `/.well-known/oauth-authorization-server/auth/v1`.
 *
 * No `scopes_supported`: Supabase's scopes shape an ID token, and row-level security decides what
 * a token can read (ADR 0042).
 */
export function protectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Missing Supabase environment variables')

  return {
    resource: mcpServerUrl(origin),
    authorization_servers: [`${supabaseUrl.replace(/\/$/, '')}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Layline',
  }
}

/**
 * Bearer tokens, not cookies, so any origin may ask: a browser-based MCP client such as the
 * Inspector reads the challenge header and the metadata cross-origin.
 */
export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

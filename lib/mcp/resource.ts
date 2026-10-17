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
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(/:$/, '')
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
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
    resource: `${origin}${MCP_PATH}`,
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

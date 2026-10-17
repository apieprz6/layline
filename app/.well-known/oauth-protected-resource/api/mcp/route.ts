import { MCP_CORS_HEADERS, protectedResourceMetadata, requestOrigin } from '@/lib/mcp/resource'

export const dynamic = 'force-dynamic'

/**
 * RFC 9728 protected-resource metadata for `/api/mcp`: the URL the endpoint's 401 names, and the
 * first thing an MCP client reads to find Supabase Auth.
 */
export function GET(request: Request): Response {
  try {
    return Response.json(protectedResourceMetadata(requestOrigin(request)), {
      headers: { ...MCP_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
    })
  } catch (error) {
    console.error('Protected-resource metadata error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: MCP_CORS_HEADERS }
    )
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS })
}

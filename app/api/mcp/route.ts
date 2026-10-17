import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { authenticateMcpRequest } from '@/lib/mcp/auth'
import { MCP_CORS_HEADERS, protectedResourceMetadataUrl, requestOrigin } from '@/lib/mcp/resource'
import { createLaylineMcpServer } from '@/services/mcp/server'

export const dynamic = 'force-dynamic'

// Each request is one short read and one answer; this is a ceiling, far under Hobby's 300 s.
export const maxDuration = 30

function withCors(response: Response): Response {
  Object.entries(MCP_CORS_HEADERS).forEach(([key, value]) => response.headers.set(key, value))
  return response
}

/**
 * The challenge an MCP client follows to sign in: where the metadata is, and nothing else.
 * The body says no more than the header, and no tool is named to a caller with no Account.
 */
function unauthorized(request: Request): Response {
  const origin = requestOrigin(request)
  return Response.json(
    { error: 'invalid_token', error_description: 'Sign in to Layline to use this connector.' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
      },
    }
  )
}

/**
 * The **MCP Server**: MCP's Streamable HTTP transport, stateless and answering in JSON rather
 * than holding an SSE stream open (ADR 0042). A fresh server and transport per request, so
 * nothing is shared between callers and there is no session to store.
 *
 * Every method goes through the same door. A request without a crew token is refused before the
 * MCP layer sees it, so not even `tools/list` is answered to a stranger.
 */
async function handle(request: Request): Promise<Response> {
  try {
    const caller = await authenticateMcpRequest(request)
    if (!caller) return withCors(unauthorized(request))

    const server = createLaylineMcpServer()
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)

    const response = await transport.handleRequest(request, { authInfo: caller.authInfo })
    // A JSON response is complete once returned, so the pair can go with the request.
    void server.close()
    return withCors(response)
  } catch (error) {
    console.error('MCP endpoint error:', error)
    return withCors(
      Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32603, message: error instanceof Error ? error.message : 'Unknown error' },
          id: null,
        },
        { status: 500 }
      )
    )
  }
}

export function OPTIONS(): Response {
  return withCors(new Response(null, { status: 204 }))
}

export { handle as GET, handle as POST, handle as DELETE }

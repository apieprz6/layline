// Some MCP clients look for the metadata at the bare well-known path before trying the
// path-suffixed one RFC 9728 gives. There is one protected resource, so both answer alike.
export { GET, OPTIONS } from './api/mcp/route'

export const dynamic = 'force-dynamic'

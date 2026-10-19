/**
 * @jest-environment node
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createLaylineMcpServer } from '@/services/mcp/server'
import { EXAMPLE_QUESTIONS } from '../integrations'

/** The tools the MCP Server registers today, asked of it the way a client asks. */
async function registeredTools(): Promise<string[]> {
  // Listing reads nothing, so the client the archive tools would read through is never called.
  const server = createLaylineMcpServer({ supabase: {} as SupabaseClient })
  const client = new Client({ name: 'settings-test', version: '0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  const { tools } = await client.listTools()
  await client.close()
  return tools.map((tool) => tool.name)
}

describe('the example questions on the Sign in and approve step', () => {
  it('are three, as the step shows them', () => {
    expect(EXAMPLE_QUESTIONS).toHaveLength(3)
  })

  it('are each answered by a tool the MCP Server registers today', async () => {
    const tools = await registeredTools()

    for (const { tool } of EXAMPLE_QUESTIONS) expect(tools).toContain(tool)
  })
})

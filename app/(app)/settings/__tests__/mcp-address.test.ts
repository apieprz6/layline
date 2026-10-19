/**
 * @jest-environment node
 */

import type { ReactElement } from 'react'
import { headers } from 'next/headers'
import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/api/mcp/route'
import { resolveAccount } from '@/lib/account/resolveAccount'
import SettingsPage from '../page'

jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: jest.fn() }))

const headersMock = headers as jest.MockedFunction<typeof headers>
const resolve = resolveAccount as jest.MockedFunction<typeof resolveAccount>

const ACCOUNT = { userId: 'u1', email: 'crew@layline.example', displayName: null, role: 'viewer' as const }

/** What a preview deployment's request carries: Vercel's forwarded headers, not `request.url`'s host. */
const PREVIEW = {
  host: 'layline-git-lay-191.vercel.app',
  'x-forwarded-host': 'layline-git-lay-191.vercel.app',
  'x-forwarded-proto': 'https',
}

/** `next start` locally, which sets the forwarded headers itself. */
const LOCAL = { host: '127.0.0.1:4200', 'x-forwarded-host': '127.0.0.1:4200', 'x-forwarded-proto': 'http' }

async function shownAddress(): Promise<string | null> {
  const page = (await SettingsPage()) as ReactElement<{ mcpServerUrl: string | null }>
  return page.props.mcpServerUrl
}

async function metadataResource(requestHeaders: Record<string, string>): Promise<string> {
  // The metadata route is served under its own hostname by `next start`, which is the point:
  // `request.url` is not what the client called.
  const response = protectedResource(
    new Request('http://localhost:4200/.well-known/oauth-protected-resource/api/mcp', { headers: requestHeaders })
  )
  return ((await response.json()) as { resource: string }).resource
}

describe('the MCP Server address Settings shows', () => {
  const env = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = env
  })

  it.each([
    ['a preview deployment', PREVIEW],
    ['next start on loopback', LOCAL],
  ])('is the resource the protected-resource metadata names, on %s', async (_, requestHeaders) => {
    resolve.mockResolvedValue(ACCOUNT)
    headersMock.mockResolvedValue(new Headers(requestHeaders) as Awaited<ReturnType<typeof headers>>)

    const shown = await shownAddress()

    expect(shown).toBe(await metadataResource(requestHeaders))
  })

  it('is the preview deployment’s own address, never a fixed hostname', async () => {
    resolve.mockResolvedValue(ACCOUNT)
    headersMock.mockResolvedValue(new Headers(PREVIEW) as Awaited<ReturnType<typeof headers>>)

    expect(await shownAddress()).toBe('https://layline-git-lay-191.vercel.app/api/mcp')
  })

  it('is not handed to a Guest at all', async () => {
    resolve.mockResolvedValue(null)
    headersMock.mockResolvedValue(new Headers(PREVIEW) as Awaited<ReturnType<typeof headers>>)

    expect(await shownAddress()).toBeNull()
  })
})

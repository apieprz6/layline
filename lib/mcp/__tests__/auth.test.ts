/**
 * @jest-environment node
 */

import { authenticateMcpRequest } from '../auth'

const getClaims = jest.fn()
const maybeSingle = jest.fn()
const eq = jest.fn(() => ({ maybeSingle }))
const createClient = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}))

const CONNECTOR_CLAIMS = {
  sub: 'user-1',
  email: 'crew@example.com',
  role: 'authenticated',
  client_id: 'claude-client',
  exp: 1_900_000_000,
}

function mcpRequest(authorization?: string): Request {
  return new Request('https://layline.example/api/mcp', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  createClient.mockReturnValue({
    auth: { getClaims },
    from: () => ({ select: () => ({ eq }) }),
  })
  getClaims.mockResolvedValue({ data: { claims: CONNECTOR_CLAIMS }, error: null })
  maybeSingle.mockResolvedValue({ data: { user_id: 'user-1' }, error: null })
})

describe('authenticateMcpRequest', () => {
  it('refuses a request with no bearer token, without asking Supabase', async () => {
    expect(await authenticateMcpRequest(mcpRequest())).toBeNull()
    expect(await authenticateMcpRequest(mcpRequest('Basic abc'))).toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('refuses a token Supabase cannot verify', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') })

    expect(await authenticateMcpRequest(mcpRequest('Bearer forged'))).toBeNull()
  })

  it('refuses a browser session token, which no OAuth client was issued', async () => {
    const { client_id: _clientId, ...browserClaims } = CONNECTOR_CLAIMS
    void _clientId
    getClaims.mockResolvedValue({ data: { claims: browserClaims }, error: null })

    expect(await authenticateMcpRequest(mcpRequest('Bearer session-token'))).toBeNull()
  })

  it('refuses a verified token whose account has no Profile', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    expect(await authenticateMcpRequest(mcpRequest('Bearer token'))).toBeNull()
  })

  it('answers a crew token with a client that reads as the caller', async () => {
    const caller = await authenticateMcpRequest(mcpRequest('Bearer crew-token'))

    expect(caller).not.toBeNull()
    expect(caller!.authInfo).toEqual({
      token: 'crew-token',
      clientId: 'claude-client',
      scopes: [],
      expiresAt: 1_900_000_000,
      extra: { userId: 'user-1' },
    })
    expect(getClaims).toHaveBeenCalledWith('crew-token')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    // Row-level security sees the caller, not the anon key alone (ADR 0042).
    expect(createClient).toHaveBeenCalledWith(
      'https://ref.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer crew-token' } },
      })
    )
  })
})

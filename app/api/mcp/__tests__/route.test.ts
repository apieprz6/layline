/**
 * @jest-environment node
 */

import { POST } from '../route'
import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/api/mcp/route'
import { authenticateMcpRequest } from '@/lib/mcp/auth'
import { clearHistoryCache, fetchCHII2 } from '@/services/buoys/ndbc'

jest.mock('@/lib/mcp/auth', () => ({ authenticateMcpRequest: jest.fn() }))

const authenticate = authenticateMcpRequest as jest.MockedFunction<typeof authenticateMcpRequest>

const ORIGIN = 'https://layline.example'

/** One NDBC realtime2 row, ten minutes old: 7.7 m/s from 245°. */
function ndbcText(): string {
  const t = new Date(Date.now() - 10 * 60 * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return [
    '#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE',
    '#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft',
    `${t.getUTCFullYear()} ${p(t.getUTCMonth() + 1)} ${p(t.getUTCDate())} ${p(t.getUTCHours())} ${p(t.getUTCMinutes())} 245 7.7 9.3 MM MM MM MM 1013.2 18.5 16.2 15.0 MM MM MM`,
  ].join('\n')
}

function rpc(body: object, authorization?: string): Request {
  return new Request(`${ORIGIN}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  clearHistoryCache()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ref.supabase.co'
  // Purdue then falls back from Supabase to NDBC, so every upstream read is the fetch below.
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => ndbcText() } as Response)
})

describe('/api/mcp without a token', () => {
  beforeEach(() => authenticate.mockResolvedValue(null))

  it('is refused with a 401 that points at the protected-resource metadata, and lists no tools', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`
    )
    expect(await response.text()).not.toContain('current_conditions')
  })

  it('names the host the client called, not the one the server was started on', async () => {
    const request = new Request('http://localhost:3000/api/mcp', {
      method: 'POST',
      headers: { 'x-forwarded-host': 'layline.example', 'x-forwarded-proto': 'https' },
    })

    const response = await POST(request)

    expect(response.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`
    )
  })

  it('publishes metadata naming Supabase Auth as the authorization server', async () => {
    const response = await protectedResource(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      resource: `${ORIGIN}/api/mcp`,
      authorization_servers: ['https://ref.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
      resource_name: 'Layline',
    })
  })
})

describe('/api/mcp with a crew token', () => {
  beforeEach(() => {
    authenticate.mockResolvedValue({
      supabase: {} as never,
      authInfo: { token: 't', clientId: 'claude', scopes: [] },
    })
  })

  it('lists current_conditions as a read-only tool', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer t'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(['current_conditions'])
    expect(body.result.tools[0].annotations).toMatchObject({ readOnlyHint: true })
  })

  it('answers current_conditions with the figure the dashboard prints for CHII2', async () => {
    const response = await POST(
      rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'current_conditions', arguments: {} } },
        'Bearer t'
      )
    )
    const body = await response.json()
    const chii2 = body.result.structuredContent.stations[0]

    // The dashboard's own call, served from the cache the tool just warmed: one source.
    const screen = await fetchCHII2()
    expect(chii2.wind).toEqual({
      speedKnots: screen.data!.windSpeed,
      directionDegreesTrue: screen.data!.windDirection,
    })
    // 7.7 m/s is 14.97 kts, which the buoy service rounds to 15.0. Never a "surface" figure.
    expect(chii2.wind.speedKnots).toBe(15)
    expect(chii2).toMatchObject({ dataStatus: 'online', anemometerHeightFeet: 85, staleness: { label: '10m ago' } })
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
  })
})

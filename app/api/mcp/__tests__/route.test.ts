/**
 * @jest-environment node
 */

import { POST } from '../route'
import { GET as protectedResource } from '@/app/.well-known/oauth-protected-resource/api/mcp/route'
import { authenticateMcpRequest } from '@/lib/mcp/auth'
import { clearHistoryCache, fetchCHII2, fetchCHII2History } from '@/services/buoys/ndbc'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { POLAR, POLAR_VERSION, RACES, ROWS, VOCABULARY } from '@/components/analysis/__tests__/fixture'

jest.mock('@/lib/mcp/auth', () => ({ authenticateMcpRequest: jest.fn() }))
jest.mock('@/services/analysis/readArchive', () => ({ readAnalysisArchive: jest.fn() }))

const readArchive = readAnalysisArchive as jest.MockedFunction<typeof readAnalysisArchive>

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
    const text = await response.text()
    expect(text).not.toContain('current_conditions')
    expect(text).not.toContain('buoy_history')
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

/** The caller's own client, which every archive read must go out on (ADR 0042). */
const CALLERS_CLIENT = { caller: 'crew' } as never

function call(name: string, args: object): Request {
  return rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }, 'Bearer t')
}

describe('/api/mcp with a crew token', () => {
  beforeEach(() => {
    authenticate.mockResolvedValue({
      supabase: CALLERS_CLIENT,
      authInfo: { token: 't', clientId: 'claude', scopes: [] },
    })
  })

  it('lists its tools as read-only', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer t'))
    const body = await response.json()
    const tools: { name: string; annotations: object }[] = body.result.tools

    expect(response.status).toBe(200)
    expect(tools.map((t) => t.name)).toEqual(['current_conditions', 'buoy_history', 'polar_performance'])
    tools.forEach((t) => expect(t.annotations).toMatchObject({ readOnlyHint: true }))
  })

  it("answers buoy_history with the readings the station page renders for CHII2", async () => {
    const response = await POST(
      rpc(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'buoy_history', arguments: { station: 'CHII2' } },
        },
        'Bearer t'
      )
    )
    const body = await response.json()
    const answer = body.result.structuredContent

    // The station page's own call, served from the cache the tool just warmed: one source.
    const page = await fetchCHII2History()
    expect(answer).toMatchObject({ station: 'CHII2', window: { id: '1h' }, anemometerHeightFeet: 85 })
    expect(answer.readings).toEqual([
      {
        observedAt: page.history![0].timestamp,
        speedKnots: page.history![0].spd,
        directionDegreesTrue: page.history![0].dir,
        gustKnots: page.history![0].gust,
      },
    ])
    expect(JSON.parse(body.result.content[0].text)).toEqual(answer)
  })

  it('refuses a buoy_history window the station page does not offer, naming the ones it does', async () => {
    const response = await POST(
      rpc(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'buoy_history', arguments: { station: 'CHII2', window: '3h' } },
        },
        'Bearer t'
      )
    )
    const body = await response.json()

    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/30m.*1h.*6h.*24h.*72h/)
  })

  it('offers polar_performance the screen’s five dimensions, and wind as the screen’s window', async () => {
    const response = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'Bearer t'))
    const tool = (await response.json()).result.tools.find(
      (t: { name: string }) => t.name === 'polar_performance'
    )

    expect(Object.keys(tool.inputSchema.properties.filter.properties)).toEqual([
      'pos',
      'sail',
      'sea',
      'time',
      'when',
      'dayRange',
    ])
    expect(Object.keys(tool.inputSchema.properties)).toEqual(['filter', 'windWindow'])
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

  it('answers polar_performance through the caller’s own client, narrowed by the filter', async () => {
    readArchive.mockResolvedValue({ rows: ROWS, races: RACES, vocabulary: VOCABULARY, polars: {} })

    const response = await POST(call('polar_performance', { filter: { sail: ['Main + Jib 1'] } }))
    const body = await response.json()

    expect(readArchive).toHaveBeenCalledWith(CALLERS_CLIENT)
    expect(body.result.isError).toBeFalsy()
    // The two June rows: 6 and 3 knots against 6 kt targets.
    expect(body.result.structuredContent.polarEfficiency.percent).toBe('75.0%')
    expect(body.result.structuredContent.coverageLedger.statement[0]).toBe('1 of 2 races · 2m recorded')
    expect(JSON.parse(body.result.content[0].text)).toEqual(body.result.structuredContent)
  })

  it('refuses an unknown bucket with the valid ones, rather than answering a wider match', async () => {
    readArchive.mockResolvedValue({ rows: ROWS, races: RACES, vocabulary: VOCABULARY, polars: {} })

    const response = await POST(call('polar_performance', { filter: { wind: ['medium'] } }))
    const body = await response.json()

    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('pos, sail, sea, time, when, dayRange')
    expect(body.result.structuredContent).toBeUndefined()
  })

  it('answers a wind window, and refuses one the screen’s slider could not hold', async () => {
    readArchive.mockResolvedValue({
      rows: ROWS,
      races: RACES,
      vocabulary: VOCABULARY,
      polars: { [POLAR_VERSION]: POLAR },
    })

    const answered = await (await POST(call('polar_performance', { windWindow: { centre: 12, width: 4 } }))).json()
    expect(answered.result.structuredContent.windWindow).toMatchObject({ lowKnots: 10, highKnots: 14 })

    const refused = await (await POST(call('polar_performance', { windWindow: { centre: 12, width: 5 } }))).json()
    expect(refused.result.isError).toBe(true)
    expect(refused.result.content[0].text).toContain('2, 4, 6')
  })

  it('makes a failed archive read an error, never a figure over a short archive', async () => {
    readArchive.mockResolvedValue(null)

    const response = await POST(call('polar_performance', {}))
    const body = await response.json()

    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toMatch(/could not be read/)
    expect(body.result.structuredContent).toBeUndefined()
  })
})

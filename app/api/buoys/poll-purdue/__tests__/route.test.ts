/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET } from '../route'

const VALID_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<message>
  <station>45198</station>
  <date>08/02/2026 21:40:00</date>
  <met>
    <atmp1>20.9</atmp1>
    <rrh>85.4</rrh>
    <baro1>1011.1</baro1>
    <wspd1>8.65</wspd1>
    <gust1>11.46</gust1>
    <wdir1>356.7</wdir1>
    <wtmp1>20.37</wtmp1>
    <wvhgt>1.111</wvhgt>
    <dompd>6.318</dompd>
    <mwdir>13.84</mwdir>
  </met>
</message>`

const mockUpsert = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      upsert: mockUpsert,
    }),
  }),
}))

jest.mock('@/services/buoys/iiseagrant', () => ({
  fetchIISEAGrantXML: jest.fn(),
  parseIISEAGrantXML:
    jest.requireActual('@/services/buoys/iiseagrant').parseIISEAGrantXML,
}))

import { fetchIISEAGrantXML } from '@/services/buoys/iiseagrant'

const mockFetch = fetchIISEAGrantXML as jest.MockedFunction<
  typeof fetchIISEAGrantXML
>

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (token) {
    headers['authorization'] = `Bearer ${token}`
  }
  return new NextRequest('http://localhost/api/buoys/poll-purdue', { headers })
}

describe('GET /api/buoys/poll-purdue', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      CRON_SECRET: 'test-cron-secret',
    }
    mockUpsert.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('authentication', () => {
    it('returns 401 when no authorization header is provided', async () => {
      const response = await GET(makeRequest())
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('returns 401 when token is wrong', async () => {
      const response = await GET(makeRequest('wrong-token'))
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('returns 500 when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET

      const response = await GET(makeRequest('any-token'))
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Server configuration error')
    })
  })

  it('returns 200 on successful parse and insert', async () => {
    mockFetch.mockResolvedValue(VALID_XML)

    const response = await GET(makeRequest('test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.timestamp).toBe('2026-08-02T21:40:00.000Z')
  })

  it('inserts parsed data into Supabase with correct fields', async () => {
    mockFetch.mockResolvedValue(VALID_XML)

    await GET(makeRequest('test-cron-secret'))

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        timestamp: '2026-08-02T21:40:00.000Z',
        wind_speed: 8.65,
        wind_direction: 357,
        wind_gust: 11.46,
        air_temp: 20.9,
        water_temp: 20.37,
        pressure: 1011.1,
        humidity: 85.4,
        wave_height: 1.111,
        wave_period: 6.318,
        wave_direction: 14,
      },
      { onConflict: 'timestamp', ignoreDuplicates: true }
    )
  })

  it('returns 502 on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'))

    const response = await GET(makeRequest('test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toBe('Network timeout')
  })

  it('returns 422 on malformed XML', async () => {
    mockFetch.mockResolvedValue('<garbage>not valid</garbage>')

    const response = await GET(makeRequest('test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toBeTruthy()
  })

  it('returns 200 on duplicate timestamp (ON CONFLICT DO NOTHING)', async () => {
    mockFetch.mockResolvedValue(VALID_XML)
    mockUpsert.mockResolvedValue({ error: null })

    const first = await GET(makeRequest('test-cron-secret'))
    expect(first.status).toBe(200)

    const second = await GET(makeRequest('test-cron-secret'))
    expect(second.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledTimes(2)
    expect(mockUpsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ timestamp: '2026-08-02T21:40:00.000Z' }),
      { onConflict: 'timestamp', ignoreDuplicates: true }
    )
  })

  it('returns 500 on database insert error', async () => {
    mockFetch.mockResolvedValue(VALID_XML)
    mockUpsert.mockResolvedValue({
      error: { message: 'Connection refused' },
    })

    const response = await GET(makeRequest('test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Database insert failed')
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const response = await GET(makeRequest('test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('Server configuration error')
  })
})

/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST } from '../route'

jest.mock('@/services/buoys/ndbc', () => ({
  fetchCHII2History: jest.fn(),
  fetchPurdueBuoyHistory: jest.fn(),
  purgeBuoyHistory: jest.fn(),
}))

import {
  fetchCHII2History,
  fetchPurdueBuoyHistory,
  purgeBuoyHistory,
} from '@/services/buoys/ndbc'

const mockCHII2 = fetchCHII2History as jest.MockedFunction<typeof fetchCHII2History>
const mockPurdue = fetchPurdueBuoyHistory as jest.MockedFunction<
  typeof fetchPurdueBuoyHistory
>
const mockPurge = purgeBuoyHistory as jest.MockedFunction<typeof purgeBuoyHistory>

function request(buoyId?: string): NextRequest {
  const url = buoyId
    ? `http://localhost/api/weather/buoys/refresh?buoyId=${buoyId}`
    : 'http://localhost/api/weather/buoys/refresh'
  return new NextRequest(url, { method: 'POST' })
}

function storedReading(buoyId: string, ageMs: number) {
  return {
    buoyId,
    name: buoyId === 'CHII2' ? 'Harrison Dever Crib' : 'Purdue Buoy',
    history: [{ timestamp: new Date().toISOString(), spd: 12, dir: 245 }],
    status: 'online' as const,
    fetchedAt: new Date(Date.now() - ageMs).toISOString(),
  }
}

describe('POST /api/weather/buoys/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('expires the stored reading so the next read fetches', async () => {
    mockPurdue.mockResolvedValue(storedReading('45198', 2 * 60 * 1000))

    const response = await POST(request('45198'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ purged: true })
    expect(mockPurge).toHaveBeenCalledWith('45198')
  })

  it('purges only the station asked for', async () => {
    mockCHII2.mockResolvedValue(storedReading('CHII2', 2 * 60 * 1000))

    await POST(request('CHII2'))

    expect(mockPurge).toHaveBeenCalledWith('CHII2')
    expect(mockPurdue).not.toHaveBeenCalled()
  })

  it('leaves a reading that was just fetched alone', async () => {
    // A floor on how often a held finger can make us reach a public service. The
    // answer is still 200 — nothing failed, there was simply nothing to gain.
    mockCHII2.mockResolvedValue(storedReading('CHII2', 5 * 1000))

    const response = await POST(request('CHII2'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ purged: false })
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('refuses a station it does not know', async () => {
    const response = await POST(request('99999'))

    expect(response.status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
    expect(mockCHII2).not.toHaveBeenCalled()
  })

  it('refuses a request that names no station', async () => {
    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('never lets a response be cached — the point of it is to be current', async () => {
    mockCHII2.mockResolvedValue(storedReading('CHII2', 2 * 60 * 1000))

    const purged = await POST(request('CHII2'))
    const refused = await POST(request('99999'))

    expect(purged.headers.get('cache-control')).toBe('no-store')
    expect(refused.headers.get('cache-control')).toBe('no-store')
  })

  it('reports a failed read rather than claiming a purge', async () => {
    mockCHII2.mockRejectedValue(new Error('NDBC unreachable'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(request('CHII2'))

    expect(response.status).toBe(500)
    expect(mockPurge).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

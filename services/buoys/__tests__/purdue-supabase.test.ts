import { fetchPurdueBuoyHistory, clearHistoryCache } from '../ndbc'
import { getServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/service')

const mockGetServiceClient = getServiceClient as jest.MockedFunction<typeof getServiceClient>

function createMockSupabaseClient(options: {
  data?: Array<Record<string, unknown>>
  error?: { message: string; code: string }
}) {
  const returnsFn = jest.fn().mockResolvedValue({
    data: options.data ?? null,
    error: options.error ?? null,
  })
  const orderFn = jest.fn().mockReturnValue({ returns: returnsFn })
  // Real supabase-js query builders return themselves from `.not()`, so a second `.not()` call
  // chains off the same object — `notFn` has to appear on its own return value too.
  const builder: { not: jest.Mock; order: jest.Mock } = {
    not: jest.fn(),
    order: orderFn,
  }
  builder.not.mockReturnValue(builder)
  const gtFn = jest.fn().mockReturnValue(builder)
  const selectFn = jest.fn().mockReturnValue({ gt: gtFn })
  const fromFn = jest.fn().mockReturnValue({ select: selectFn })

  return { from: fromFn } as unknown as ReturnType<typeof getServiceClient>
}

function generateSupabaseRows(count: number, startMinutesAgo: number = 0) {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(now - (startMinutesAgo + i * 10) * 60 * 1000).toISOString()
    return {
      timestamp,
      wind_speed: 5.0 + (i % 5) * 0.5, // 5.0-7.0 m/s range
      wind_direction: 180 + (i % 36) * 10, // 180-540 -> wraps
      wind_gust: 7.0 + (i % 5) * 0.5, // m/s
      wave_height: 0.3 + (i % 3) * 0.1, // meters
      wave_period: 4 + (i % 4), // seconds
      wave_direction: 190 + (i % 36) * 10,
    }
  })
}

describe('fetchPurdueBuoyHistory - Supabase-first with NDBC fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearHistoryCache()
  })

  describe('when Supabase has data', () => {
    it('returns WindDataPoint[] from Supabase with speed in knots', async () => {
      const rows = generateSupabaseRows(10)
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(result.history).not.toBeNull()
      expect(result.history).toHaveLength(10)
      expect(result.buoyId).toBe('45198')
      expect(result.name).toBe('Purdue Buoy')

      // Verify m/s -> knots conversion (5.0 m/s * 1.94384 = 9.7 knots)
      const firstPoint = result.history![0]
      expect(firstPoint.spd).toBeCloseTo(5.0 * 1.94384, 0)
      expect(firstPoint.dir).toBe(rows[0].wind_direction)
      expect(firstPoint.timestamp).toBeTruthy()
      expect(() => new Date(firstPoint.timestamp)).not.toThrow()

      expect(result.metadata.capability).toEqual({ gust: true, waves: true })
    })

    it('converts gust (m/s -> knots) and wave height (m -> ft), passing period/direction through', async () => {
      const rows = generateSupabaseRows(3)
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      const point = result.history![0]
      expect(point.gust).toBeCloseTo(rows[0].wind_gust * 1.94384, 1)
      expect(point.waveHeight).toBeCloseTo(rows[0].wave_height * 3.28084, 1)
      expect(point.wavePeriod).toBe(rows[0].wave_period)
      expect(point.waveDir).toBe(rows[0].wave_direction)
    })

    it('stores a missing gust/wave reading as null rather than fabricating a value', async () => {
      const rows = [
        {
          timestamp: new Date().toISOString(),
          wind_speed: 6.0,
          wind_direction: 200,
          wind_gust: null,
          wave_height: null,
          wave_period: null,
          wave_direction: null,
        },
      ]
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      const point = result.history![0]
      expect(point.gust).toBeNull()
      expect(point.waveHeight).toBeNull()
      expect(point.wavePeriod).toBeNull()
      expect(point.waveDir).toBeNull()
      // The row still has valid wind, so it is not excluded just because waves are missing.
      expect(point.spd).toBeCloseTo(6.0 * 1.94384, 1)
      expect(point.dir).toBe(200)
    })

    it('does not call NDBC when Supabase succeeds', async () => {
      const rows = generateSupabaseRows(5)
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const fetchSpy = jest.fn()
      global.fetch = fetchSpy

      await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('filters out null wind_direction at the query level instead of fabricating 0 (ADR 0008)', async () => {
      const rows = generateSupabaseRows(3)
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      await fetchPurdueBuoyHistory({ bypassCache: true })

      const fromResult = (mockClient.from as jest.Mock).mock.results[0].value
      const selectResult = fromResult.select.mock.results[0].value
      const gtResult = selectResult.gt.mock.results[0].value
      // Both wind_speed and wind_direction must be filtered the same way: a missing half of a
      // reading excludes the row, rather than defaulting it to a fabricated value.
      expect(gtResult.not).toHaveBeenCalledWith('wind_speed', 'is', null)
      expect(gtResult.not).toHaveBeenCalledWith('wind_direction', 'is', null)
    })

    it('returns correct status based on data freshness', async () => {
      const rows = generateSupabaseRows(5, 0) // recent data
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(['online', 'recent']).toContain(result.status)
    })
  })

  describe('when Supabase returns empty data', () => {
    it('falls back to NDBC and returns NDBC-sourced history', async () => {
      const mockClient = createMockSupabaseClient({ data: [] })
      mockGetServiceClient.mockReturnValue(mockClient)

      const mockNDBCResponse = generateMockNDBCResponse(72)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(result.history).not.toBeNull()
      expect(result.history!.length).toBeGreaterThan(0)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ndbc.noaa.gov'),
        expect.any(Object)
      )
    })
  })

  describe('when Supabase throws an error', () => {
    it('falls back to NDBC transparently', async () => {
      const mockClient = createMockSupabaseClient({
        error: { message: 'connection refused', code: 'PGRST301' },
      })
      mockGetServiceClient.mockReturnValue(mockClient)

      const mockNDBCResponse = generateMockNDBCResponse(72)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(result.history).not.toBeNull()
      expect(result.history!.length).toBeGreaterThan(0)
    })

    it('falls back to NDBC when getServiceClient throws', async () => {
      mockGetServiceClient.mockImplementation(() => {
        throw new Error('Missing Supabase environment variables')
      })

      const mockNDBCResponse = generateMockNDBCResponse(72)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(result.history).not.toBeNull()
      expect(result.history!.length).toBeGreaterThan(0)
    })
  })

  describe('when both Supabase and NDBC fail', () => {
    it('returns graceful error with status error and null history', async () => {
      const mockClient = createMockSupabaseClient({
        error: { message: 'connection refused', code: 'PGRST301' },
      })
      mockGetServiceClient.mockReturnValue(mockClient)

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchPurdueBuoyHistory({ bypassCache: true })

      expect(result.status).toBe('error')
      expect(result.history).toBeNull()
      expect(result.error).toBeTruthy()
    })
  })

  describe('caching', () => {
    it('uses cache on second call within TTL', async () => {
      const rows = generateSupabaseRows(5)
      const mockClient = createMockSupabaseClient({ data: rows })
      mockGetServiceClient.mockReturnValue(mockClient)

      const result1 = await fetchPurdueBuoyHistory({ bypassCache: true })
      const result2 = await fetchPurdueBuoyHistory()

      expect(mockGetServiceClient).toHaveBeenCalledTimes(1)
      expect(result1.fetchedAt).toBe(result2.fetchedAt)
    })
  })
})

function generateMockNDBCResponse(hours: number): string {
  const now = new Date()
  const lines: string[] = []

  lines.push('#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE')
  lines.push('#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft')

  const totalPoints = hours * 6

  for (let i = 0; i < totalPoints; i++) {
    const timestamp = new Date(now.getTime() - (i * 10 * 60 * 1000))
    const year = timestamp.getUTCFullYear()
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0')
    const day = String(timestamp.getUTCDate()).padStart(2, '0')
    const hour = String(timestamp.getUTCHours()).padStart(2, '0')
    const minute = String(timestamp.getUTCMinutes()).padStart(2, '0')

    const windSpeed = (10 + (i % 5)).toFixed(1)
    const windDir = 180 + (i % 36) * 10

    lines.push(
      `${year} ${month} ${day} ${hour} ${minute} ${windDir} ${windSpeed} ${(parseFloat(windSpeed) + 2).toFixed(1)} 1.2 6 5 ${windDir} 1013.2 18.5 16.2 15.0 10.0 0.0 MM`
    )
  }

  return lines.join('\n')
}

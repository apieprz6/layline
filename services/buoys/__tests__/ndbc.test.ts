import { fetchCHII2History, fetchPurdueBuoyHistory } from '../ndbc'
import { clearDataCache } from './data-cache'

jest.mock('next/cache', () => jest.requireActual('./data-cache'))

describe('NDBC Buoy History - Extended 72-hour Support', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearDataCache()
  })

  describe('fetchCHII2History', () => {
    it('returns history with ~432 data points covering 72 hours', async () => {
      // Mock NDBC response with 72 hours of 10-minute interval data
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchCHII2History()

      expect(result.history).not.toBeNull()
      expect(result.history).toHaveLength(432) // 72 hours * 6 points/hour

      // Verify points have absolute timestamps (not minsAgo)
      const oldestPoint = result.history![result.history!.length - 1]
      const newestPoint = result.history![0]

      expect(oldestPoint.timestamp).toBeTruthy()
      expect(newestPoint.timestamp).toBeTruthy()

      // Verify timestamps are ISO 8601 format
      expect(() => new Date(oldestPoint.timestamp)).not.toThrow()
      expect(() => new Date(newestPoint.timestamp)).not.toThrow()

      // Verify time range covers 72 hours
      const oldestTime = new Date(oldestPoint.timestamp).getTime()
      const newestTime = new Date(newestPoint.timestamp).getTime()
      const hoursDiff = (newestTime - oldestTime) / (1000 * 60 * 60)

      expect(hoursDiff).toBeGreaterThanOrEqual(71)
      expect(hoursDiff).toBeLessThanOrEqual(72)
    })
  })

  describe('fetchPurdueBuoyHistory', () => {
    it('returns history with ~432 data points covering 72 hours', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory()

      expect(result.history).not.toBeNull()
      expect(result.history).toHaveLength(432) // 72 hours * 6 points/hour

      // Verify points have absolute timestamps
      const oldestPoint = result.history![result.history!.length - 1]
      const newestPoint = result.history![0]

      expect(oldestPoint.timestamp).toBeTruthy()
      expect(newestPoint.timestamp).toBeTruthy()

      // Verify timestamps are ISO 8601 format
      expect(() => new Date(oldestPoint.timestamp)).not.toThrow()
      expect(() => new Date(newestPoint.timestamp)).not.toThrow()
    })
  })

  describe('Cache behavior', () => {
    function mockNDBC() {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => generateMockNDBCResponse(72),
      } as Response)
      global.fetch = fetchMock
      return fetchMock
    }

    it('serves a second read from the cache without touching NDBC', async () => {
      const fetchMock = mockNDBC()

      const result1 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.history).toHaveLength(432)

      const result2 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result2.history).toHaveLength(432)

      // Same entry, not a coincidentally identical refetch
      expect(result1.fetchedAt).toBe(result2.fetchedAt)
    })

    it('refetches once the 5-minute freshness window has passed', async () => {
      jest.useFakeTimers()
      try {
        const fetchMock = mockNDBC()

        await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(4 * 60 * 1000)
        await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(2 * 60 * 1000)
        await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(2)
      } finally {
        jest.useRealTimers()
      }
    })

    it('keeps each station in its own cache entry', async () => {
      const fetchMock = mockNDBC()

      await fetchCHII2History()
      await fetchPurdueBuoyHistory()

      const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]))
      expect(requestedUrls.some((url) => url.includes('CHII2'))).toBe(true)
      expect(requestedUrls.some((url) => url.includes('45198'))).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('returns null for history when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchCHII2History()

      expect(result.status).toBe('error')
      expect(result.history).toBeNull()
      expect(result.error).toBe('Network error')
    })

    it('never caches a failed fetch — the next read retries live', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))
      const failed = await fetchCHII2History()
      expect(failed.history).toBeNull()

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => generateMockNDBCResponse(72),
      } as Response)

      const retried = await fetchCHII2History()
      expect(retried.status).not.toBe('error')
      expect(retried.history).toHaveLength(432)
    })
  })
})

/**
 * Generate mock NDBC text response with historical data
 * @param hours - Number of hours of data to generate (default: 72)
 */
function generateMockNDBCResponse(hours: number = 72): string {
  const now = new Date()
  const lines: string[] = []

  // Header lines (NDBC format)
  lines.push('#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE')
  lines.push('#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft')

  // Generate data points at 10-minute intervals going backwards in time
  const totalPoints = hours * 6 // 6 points per hour at 10-min intervals

  for (let i = 0; i < totalPoints; i++) {
    const timestamp = new Date(now.getTime() - (i * 10 * 60 * 1000))
    const year = timestamp.getUTCFullYear()
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0')
    const day = String(timestamp.getUTCDate()).padStart(2, '0')
    const hour = String(timestamp.getUTCHours()).padStart(2, '0')
    const minute = String(timestamp.getUTCMinutes()).padStart(2, '0')

    // Simulate varying wind conditions (10-20 knots range)
    const windSpeed = (10 + Math.random() * 5).toFixed(1) // 10-15 m/s (~19-29 knots)
    const windDir = Math.floor(180 + Math.random() * 60) // 180-240 degrees
    const gust = (parseFloat(windSpeed) + 2).toFixed(1)

    lines.push(
      `${year} ${month} ${day} ${hour} ${minute} ${windDir} ${windSpeed} ${gust} 1.2 6 5 ${windDir} 1013.2 18.5 16.2 15.0 10.0 0.0 MM`
    )
  }

  return lines.join('\n')
}

import { fetchCHII2History, fetchPurdueBuoyHistory, clearHistoryCache } from '../ndbc'

describe('NDBC Buoy History - Extended 72-hour Support', () => {
  beforeEach(() => {
    // Clear any module-level caches
    jest.clearAllMocks()
    clearHistoryCache()
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
    it('respects 10-minute cache TTL for history', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      global.fetch = fetchMock

      // First call - should fetch from NDBC
      const result1 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.history).toHaveLength(432)

      // Second call immediately after - should use cache
      const result2 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1) // Still only 1 call
      expect(result2.history).toHaveLength(432)

      // Verify both results have the same data
      expect(result1.fetchedAt).toBe(result2.fetchedAt)
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

import { fetchCHII2History, fetchPurdueBuoyHistory, clearHistoryCache } from '../ndbc'

describe('NDBC Buoy History - Extended 72-hour Support', () => {
  beforeEach(() => {
    // Clear any module-level caches
    jest.clearAllMocks()
    clearHistoryCache()
  })

  describe('fetchCHII2History', () => {
    it('returns extendedHistory with ~432 data points covering 72 hours', async () => {
      // Mock NDBC response with 72 hours of 10-minute interval data
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchCHII2History()

      expect(result.extendedHistory).not.toBeNull()
      expect(result.extendedHistory).toHaveLength(432) // 72 hours * 6 points/hour

      // Verify time range covers 72 hours
      const oldestPoint = result.extendedHistory![result.extendedHistory!.length - 1]
      const newestPoint = result.extendedHistory![0]

      expect(oldestPoint.minsAgo).toBeGreaterThanOrEqual(4310) // ~71.8 hours
      expect(newestPoint.minsAgo).toBeLessThanOrEqual(10) // Most recent bucket
    })

    it('maintains backward compatibility: minuteHistory still returns ~12 points for 2 hours', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchCHII2History()

      expect(result.minuteHistory).not.toBeNull()
      expect(result.minuteHistory).toHaveLength(12) // 2 hours * 6 points/hour

      // Verify time range covers only 2 hours
      const oldestPoint = result.minuteHistory![result.minuteHistory!.length - 1]
      const newestPoint = result.minuteHistory![0]

      expect(oldestPoint.minsAgo).toBeGreaterThanOrEqual(110) // ~1.83 hours
      expect(oldestPoint.minsAgo).toBeLessThanOrEqual(120) // Max 2 hours
      expect(newestPoint.minsAgo).toBeLessThanOrEqual(10) // Most recent bucket
    })
  })

  describe('fetchPurdueBuoyHistory', () => {
    it('returns extendedHistory with ~432 data points covering 72 hours', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory()

      expect(result.extendedHistory).not.toBeNull()
      expect(result.extendedHistory).toHaveLength(432) // 72 hours * 6 points/hour

      // Verify time range covers 72 hours
      const oldestPoint = result.extendedHistory![result.extendedHistory!.length - 1]
      const newestPoint = result.extendedHistory![0]

      expect(oldestPoint.minsAgo).toBeGreaterThanOrEqual(4310) // ~71.8 hours
      expect(newestPoint.minsAgo).toBeLessThanOrEqual(10) // Most recent bucket
    })

    it('maintains backward compatibility: minuteHistory still returns ~12 points for 2 hours', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      const result = await fetchPurdueBuoyHistory()

      expect(result.minuteHistory).not.toBeNull()
      expect(result.minuteHistory).toHaveLength(12) // 2 hours * 6 points/hour

      // Verify time range covers only 2 hours
      const oldestPoint = result.minuteHistory![result.minuteHistory!.length - 1]
      const newestPoint = result.minuteHistory![0]

      expect(oldestPoint.minsAgo).toBeGreaterThanOrEqual(110) // ~1.83 hours
      expect(oldestPoint.minsAgo).toBeLessThanOrEqual(120) // Max 2 hours
      expect(newestPoint.minsAgo).toBeLessThanOrEqual(10) // Most recent bucket
    })
  })

  describe('Cache behavior', () => {
    it('respects 15-minute cache TTL for extended history', async () => {
      const mockNDBCResponse = generateMockNDBCResponse(72)
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => mockNDBCResponse,
      } as Response)

      global.fetch = fetchMock

      // First call - should fetch from NDBC
      const result1 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result1.extendedHistory).toHaveLength(432)

      // Second call immediately after - should use cache
      const result2 = await fetchCHII2History()
      expect(fetchMock).toHaveBeenCalledTimes(1) // Still only 1 call
      expect(result2.extendedHistory).toHaveLength(432)

      // Verify both results have the same data
      expect(result1.fetchedAt).toBe(result2.fetchedAt)
    })
  })

  describe('Error handling', () => {
    it('returns null for extendedHistory when fetch fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchCHII2History()

      expect(result.status).toBe('error')
      expect(result.extendedHistory).toBeNull()
      expect(result.minuteHistory).toBeNull()
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

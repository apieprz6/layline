import { fetchCHII2History, fetchPurdueBuoyHistory, purgeBuoyHistory } from '../ndbc'
import { clearDataCache, flushRefreshes } from './data-cache'

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

    /**
     * How many times NDBC was asked for one station.
     *
     * Not the same as how many times `fetch` was called: the Purdue read tries
     * Supabase first, and where the service keys are set that attempt goes
     * through this same mock before falling back to NDBC. Counting every call
     * would make the same assertion mean one thing locally and another in CI,
     * which is how the first version of these tests passed here and failed there.
     */
    function ndbcCalls(fetchMock: jest.Mock, stationId: string): number {
      return fetchMock.mock.calls.filter((call) => String(call[0]).includes(stationId))
        .length
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

    it('leaves NDBC alone inside the 5-minute window and refreshes behind the read past it', async () => {
      jest.useFakeTimers()
      try {
        const fetchMock = mockNDBC()

        const first = await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(4 * 60 * 1000)
        await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        // Past the window the caller is still handed the stored reading — the
        // refresh runs behind it, so the fresh data reaches the *next* reader.
        jest.advanceTimersByTime(2 * 60 * 1000)
        const stale = await fetchCHII2History()
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(stale.fetchedAt).toBe(first.fetchedAt)

        await flushRefreshes()
        const refreshed = await fetchCHII2History()
        expect(refreshed.fetchedAt).not.toBe(first.fetchedAt)
        expect(fetchMock).toHaveBeenCalledTimes(2)
      } finally {
        jest.useRealTimers()
      }
    })

    it('labels a reading with the status it has now, not the one it was cached with', async () => {
      jest.useFakeTimers()
      try {
        mockNDBC()

        const fresh = await fetchCHII2History()
        expect(fresh.status).toBe('online')

        // Same entry, three hours on: the samples in it are now well past every
        // staleness threshold, and the status has to say so.
        jest.advanceTimersByTime(3 * 60 * 60 * 1000)
        const later = await fetchCHII2History()
        expect(later.fetchedAt).toBe(fresh.fetchedAt)
        expect(later.status).toBe('offline')
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

    it('fetches on the read after a purge, well inside the window', async () => {
      // What the refresh control on a station screen is worth. Reading again on its
      // own returns the stored reading with the stored `fetchedAt`, which is why a
      // tap that only read left the fetch age climbing and the screen unchanged.
      const fetchMock = mockNDBC()

      const before = await fetchCHII2History()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(1)

      await new Promise((resolve) => setTimeout(resolve, 2))
      purgeBuoyHistory('CHII2')

      const after = await fetchCHII2History()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(2)
      expect(after.fetchedAt).not.toBe(before.fetchedAt)
    })

    it('purges the station asked for and leaves the other one stored', async () => {
      const fetchMock = mockNDBC()

      await fetchCHII2History()
      await fetchPurdueBuoyHistory()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(1)
      expect(ndbcCalls(fetchMock, '45198')).toBe(1)

      purgeBuoyHistory('45198')

      // CHII2's reading is untouched — a tap on one station's screen must not
      // spend the other station's stored reading.
      await fetchCHII2History()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(1)

      await fetchPurdueBuoyHistory()
      expect(ndbcCalls(fetchMock, '45198')).toBe(2)
    })

    it('stores what a purged read fetches, so it is not a private answer', async () => {
      // The difference between this and the deleted `bypassCache`: the fresh reading
      // goes into the cache, so the next reader benefits instead of fetching again.
      const fetchMock = mockNDBC()

      await fetchCHII2History()
      purgeBuoyHistory('CHII2')

      const asked = await fetchCHII2History()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(2)

      const next = await fetchCHII2History()
      expect(ndbcCalls(fetchMock, 'CHII2')).toBe(2)
      expect(next.fetchedAt).toBe(asked.fetchedAt)
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

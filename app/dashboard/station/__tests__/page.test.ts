import { notFound } from 'next/navigation'

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

// Mock buoy data fetchers
jest.mock('@/services/buoys/ndbc', () => ({
  fetchCHII2History: jest.fn(),
  fetchPurdueBuoyHistory: jest.fn(),
}))

describe('Station Detail Page - Route Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 404 for invalid buoyId', async () => {
    // Import the page component
    const StationPage = (await import('../[buoyId]/page')).default

    // Call with invalid buoyId - expect it to throw
    await expect(StationPage({ params: { buoyId: 'INVALID' } })).rejects.toThrow('NEXT_NOT_FOUND')

    // Verify notFound() was called
    expect(notFound).toHaveBeenCalled()
  })

  it('returns 404 for empty buoyId', async () => {
    const StationPage = (await import('../[buoyId]/page')).default

    await expect(StationPage({ params: { buoyId: '' } })).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })
})

describe('Station Detail Page - Data Fetching', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches CHII2 extended history for valid CHII2 buoyId', async () => {
    const { fetchCHII2History } = await import('@/services/buoys/ndbc')

    // Mock successful history fetch
    const mockHistoryData = {
      buoyId: 'CHII2',
      name: 'Harrison Dever Crib',
      hourlyHistory: [],
      minuteHistory: [],
      extendedHistory: [
        { minsAgo: 10, spd: 12.5, dir: 180 },
        { minsAgo: 20, spd: 13.0, dir: 185 },
      ],
      status: 'online' as const,
      fetchedAt: new Date().toISOString(),
    }

    ;(fetchCHII2History as jest.Mock).mockResolvedValue(mockHistoryData)

    const StationPage = (await import('../[buoyId]/page')).default
    await StationPage({ params: { buoyId: 'CHII2' } })

    expect(fetchCHII2History).toHaveBeenCalled()
  })

  it('fetches Purdue Buoy extended history for valid 45198 buoyId', async () => {
    const { fetchPurdueBuoyHistory } = await import('@/services/buoys/ndbc')

    const mockHistoryData = {
      buoyId: '45198',
      name: 'Purdue Buoy',
      hourlyHistory: [],
      minuteHistory: [],
      extendedHistory: [
        { minsAgo: 10, spd: 10.0, dir: 200 },
      ],
      status: 'online' as const,
      fetchedAt: new Date().toISOString(),
    }

    ;(fetchPurdueBuoyHistory as jest.Mock).mockResolvedValue(mockHistoryData)

    const StationPage = (await import('../[buoyId]/page')).default
    await StationPage({ params: { buoyId: '45198' } })

    expect(fetchPurdueBuoyHistory).toHaveBeenCalled()
  })
})

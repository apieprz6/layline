import { NextResponse } from 'next/server'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys/history
 *
 * Returns historical buoy data for CHII2 and Purdue Buoy
 * - history: WindDataPoint[] with absolute timestamps (10-min intervals, up to 72h)
 *
 * Cached with 10-minute TTL (aligned with NDBC update frequency)
 */
export async function GET() {
  try {
    // Fetch historical data from both buoys (uses internal 10-minute cache)
    const [chii2History, purdueHistory] = await Promise.all([
      fetchCHII2History(),
      fetchPurdueBuoyHistory(),
    ])

    const response = NextResponse.json(
      {
        buoys: [chii2History, purdueHistory],
        fetchedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Cache for 10 minutes (600 seconds) - aligned with NDBC update frequency
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
      }
    )

    return response
  } catch (error) {
    console.error('Buoy history API error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch buoy history',
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
}

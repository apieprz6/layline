import { NextResponse } from 'next/server'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys/history
 *
 * Returns historical buoy data for CHII2 and Purdue Buoy
 * - hourlyHistory: 6 data points (hourly, last 6 hours)
 * - minuteHistory: ~12 data points (10-min intervals, last 2 hours)
 *
 * Cached with 15-minute TTL
 */
export async function GET() {
  try {
    // Fetch historical data from both buoys (uses internal 15-minute cache)
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
          // Cache for 15 minutes (900 seconds)
          'Cache-Control': 'public, max-age=900, s-maxage=900',
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

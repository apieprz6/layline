import { NextResponse } from 'next/server'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys/history
 *
 * Returns historical buoy data for CHII2 and Purdue Buoy
 * - history: WindDataPoint[] with absolute timestamps (10-min intervals, up to 72h)
 */
export async function GET() {
  try {
    // Both reads go through the buoy service's Data Cache, so a handler that runs
    // on every expand still only reaches NDBC once per freshness window.
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
          // The buoy freshness window, so a browser holding this response never
          // outlasts the cache behind it.
          'Cache-Control': 'public, max-age=300, s-maxage=300',
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

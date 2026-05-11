import { NextResponse } from 'next/server'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys
 *
 * Cached buoy API endpoint for dashboard consumption.
 * Fetches data from CHII2 and Purdue buoys with 15-minute HTTP cache.
 *
 * Returns: { buoys: BuoyDataResult[], fetchedAt: string }
 */
export async function GET() {
  try {
    // Fetch data from both buoys (uses internal 2-minute cache)
    const [chii2Result, purdueResult] = await Promise.all([
      fetchCHII2(),
      fetchPurdueBuoy(),
    ])

    const response = NextResponse.json(
      {
        buoys: [chii2Result, purdueResult],
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
    console.error('Buoy API error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch buoy data',
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

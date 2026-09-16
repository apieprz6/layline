import { NextResponse } from 'next/server'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys
 *
 * Cached buoy API endpoint for dashboard consumption.
 * Fetches data from CHII2 and Purdue buoys.
 *
 * Returns: { buoys: BuoyDataResult[], fetchedAt: string }
 */
export async function GET() {
  try {
    // Both reads go through the buoy service's Data Cache, so a handler that runs
    // on every poll still only reaches NDBC once per freshness window.
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
          // The buoy freshness window, so a browser holding this response never
          // outlasts the cache behind it. RaceHeader polls on the same five
          // minutes and drops any reading older than 25, so a longer HTTP cache
          // would hand it a response stale enough to blank the header out.
          'Cache-Control': 'public, max-age=300, s-maxage=300',
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

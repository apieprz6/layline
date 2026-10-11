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
          // Not cached anywhere in front of this handler, browser or CDN — see the
          // history route for the measurement. Any window here composes with the
          // Data Cache's rather than replacing it, and `RaceHeader` hides a reading
          // it judges older than 25 minutes, so an edge copy that outlives the
          // entry behind it blanks the header out on data that was there for the
          // asking. The Data Cache is what keeps NDBC from being touched.
          'Cache-Control': 'no-store',
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

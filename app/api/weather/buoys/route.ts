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
          // `max-age=0` so the browser always asks, and `s-maxage` shields the
          // origin at the edge instead. `RaceHeader` polls this every five minutes
          // and hides any reading older than 25, so a response sitting in the
          // browser's cache could silently double its poll interval and blank the
          // header out on data that was there for the asking. The Data Cache behind
          // this handler is what actually keeps NDBC from being touched.
          'Cache-Control': 'public, max-age=0, s-maxage=300, must-revalidate',
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

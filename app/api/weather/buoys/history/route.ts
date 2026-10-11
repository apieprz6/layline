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
          // Not cached anywhere in front of this handler, browser or CDN. An
          // `s-maxage` here reads like a free shield and is not one: it puts a
          // second staleness window in series with the Data Cache's, so a poll or
          // a tap on refresh gets a byte-identical edge copy and the function never
          // runs. Measured on a preview at `x-vercel-cache: HIT, age: 34` returning
          // the same `fetchedAt` — the refresh control did nothing at all.
          //
          // The Data Cache is the shield, and it is one window rather than two:
          // this handler runs per request and reads it, which is a cache read, not
          // an NDBC fetch.
          'Cache-Control': 'no-store',
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

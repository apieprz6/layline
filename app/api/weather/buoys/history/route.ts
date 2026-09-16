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
          // `max-age=0` so the browser always asks. A station screen polls this on
          // the freshness window and offers a refresh control, and a response held
          // in the browser's own cache would answer both without the server ever
          // hearing about it — a refresh button that does nothing for five minutes.
          // Nothing is lost by asking: the Data Cache behind this handler is what
          // keeps NDBC from being touched, and `s-maxage` still shields it at the
          // edge. The browser cache was only ever saving a round trip.
          'Cache-Control': 'public, max-age=0, s-maxage=300, must-revalidate',
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

import { NextResponse } from 'next/server'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

/**
 * GET /api/weather/buoys/live
 *
 * Live buoy API endpoint for real-time monitoring pages.
 * Bypasses cache and always fetches fresh data from NDBC.
 *
 * Returns: { buoys: BuoyDataResult[], fetchedAt: string }
 */
export async function GET() {
  try {
    // Fetch data from both buoys with cache bypass
    const [chii2Result, purdueResult] = await Promise.all([
      fetchCHII2({ bypassCache: true }),
      fetchPurdueBuoy({ bypassCache: true }),
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
          // Prevent any caching (browser or CDN)
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )

    return response
  } catch (error) {
    console.error('Live buoy API error:', error)

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

import { NextResponse, type NextRequest } from 'next/server'
import {
  fetchCHII2History,
  fetchPurdueBuoyHistory,
  purgeBuoyHistory,
} from '@/services/buoys/ndbc'

/**
 * POST /api/weather/buoys/refresh?buoyId=45198
 *
 * What the refresh control on a station screen actually does.
 *
 * Reading again is not enough on its own: inside the Freshness Window every read
 * is handed the same stored reading, with the same `fetchedAt`, so a tap could
 * only ever redraw what was already on screen — and the fetch age in the header
 * would carry on climbing, which is how the control came to look broken. This
 * expires the entry so the *next* read fetches.
 *
 * It is not a live path. The next read still goes through the same Cached Fetch
 * and stores what it gets, so the fresh reading is shared with every other reader
 * rather than handed privately to whoever tapped.
 */

const KNOWN_STATIONS = new Set(['CHII2', '45198'])

/**
 * How new a stored reading has to be for a tap to be answered with "that is
 * already the latest" instead of a purge.
 *
 * NDBC publishes every ten minutes, so this is not about missing samples — it is
 * a floor on how often a human holding the button can make us reach a public
 * service. Thirty seconds is short enough that a deliberate tap nearly always
 * does refetch, which is what makes the control feel like it works, and long
 * enough that a held finger cannot turn into a request per second.
 */
const FORCE_FLOOR_MS = 30 * 1000

async function readStation(buoyId: string) {
  return buoyId === '45198' ? fetchPurdueBuoyHistory() : fetchCHII2History()
}

export async function POST(request: NextRequest) {
  try {
    const buoyId = request.nextUrl.searchParams.get('buoyId')

    if (!buoyId || !KNOWN_STATIONS.has(buoyId)) {
      return NextResponse.json(
        { error: 'Unknown station' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // A cache read, not a fetch: this is the stored reading's own age, which is the
    // only honest basis for deciding whether there is anything to gain by asking.
    const current = await readStation(buoyId)
    const age = Date.now() - new Date(current.fetchedAt).getTime()

    if (age < FORCE_FLOOR_MS) {
      return NextResponse.json(
        { purged: false, fetchedAt: current.fetchedAt },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    purgeBuoyHistory(buoyId)

    // The caller reads again itself. Purging takes effect for the next read rather
    // than this one, and re-reading here would send back a reading the caller then
    // has to reconcile with the one its poll is about to bring in anyway.
    return NextResponse.json(
      { purged: true, fetchedAt: current.fetchedAt },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Buoy refresh API error:', error)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh buoy data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

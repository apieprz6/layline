'use client'

import { useCallback, useEffect } from 'react'
import useSWR from 'swr'
import type { BuoyHistoryData, WindDataPoint } from '@/types'

/**
 * Keeps a station screen on the freshest reading there is, from the client.
 *
 * The page renders server-side and that render is cached, so what the sailor is
 * handed on arrival can be up to a **Freshness Window** old. This asks again from
 * the browser: `/api/weather/buoys/history` is a dynamic route handler, so it
 * skips the render cache entirely and reads the Data Cache directly — one window
 * instead of two in series.
 *
 * The server render stays the seed rather than being replaced by a loading state:
 * a screen that already has 72 hours of history on it should not go blank to ask
 * whether there is a newer sample.
 */

/** Matches `BUOY_CACHE_SECONDS` in the buoy service. */
const FRESHNESS_WINDOW_MS = 5 * 60 * 1000

/**
 * How long to wait before asking again when a read comes back already past the
 * window, and how many times to bother.
 *
 * Past the window the Data Cache hands over what it has and refreshes behind the
 * request, so the fresh reading exists a moment later and only the *next* reader
 * sees it. Asking again shortly is how this screen becomes that next reader. The
 * cap is there because a refresh that keeps failing leaves `fetchedAt` where it
 * was, and without one this would poll every few seconds forever.
 */
const STALE_RETRY_MS = 5 * 1000
const MAX_STALE_RETRIES = 2

interface HistoryResponse {
  buoys: BuoyHistoryData[]
  fetchedAt: string
}

interface StationHistory {
  data: WindDataPoint[]
  fetchedAt: string
  refresh: () => void
  isRefreshing: boolean
}

// `no-store` because the point of this request is to find out. The route also sends
// `max-age=0`, but a fetcher that asks for a fresh answer should say so itself.
const fetcher = (url: string): Promise<HistoryResponse> =>
  fetch(url, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error(`History request failed: ${res.status}`)
    return res.json()
  })

export function useStationHistory(
  buoyId: string,
  seed: { data: WindDataPoint[]; fetchedAt: string }
): StationHistory {
  const { data, mutate, isValidating } = useSWR<HistoryResponse>(
    '/api/weather/buoys/history',
    fetcher,
    {
      // The window itself: no point asking more often than the cache behind it
      // can answer differently.
      refreshInterval: FRESHNESS_WINDOW_MS,
      // The screen a sailor comes back to after the walk out to the dock is the
      // one most likely to be showing something old.
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  )

  // A poll that fails, or that comes back with an error reading for this station,
  // leaves the screen on what it already had. Only a reading with samples in it
  // replaces one — losing a chart to a single bad round trip would be a worse
  // answer than showing the previous one for another five minutes.
  const polled = data?.buoys.find((buoy) => buoy.buoyId === buoyId)
  const adopted = polled?.history?.length ? polled : null

  const history = adopted?.history ?? seed.data
  const fetchedAt = adopted?.fetchedAt ?? seed.fetchedAt

  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])

  useEffect(() => {
    if (Date.now() - new Date(fetchedAt).getTime() < FRESHNESS_WINDOW_MS) return

    // The count lives here rather than in state because that is exactly its
    // lifetime: a reading whose `fetchedAt` moves re-runs this effect and gets a
    // fresh set of tries, and one that never moves — the failing refresh — runs
    // its chain down to the cap and stops. Spending the cap per stale reading is
    // the point; a screen left open all afternoon should not run out of them.
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>

    const askAgain = () => {
      attempts += 1
      void mutate()
      if (attempts < MAX_STALE_RETRIES) timer = setTimeout(askAgain, STALE_RETRY_MS)
    }

    timer = setTimeout(askAgain, STALE_RETRY_MS)
    return () => clearTimeout(timer)
  }, [fetchedAt, mutate])

  return { data: history, fetchedAt, refresh, isRefreshing: isValidating }
}

/**
 * PROTOTYPE ROUTE — throwaway. See ./README.md.
 *
 * /prototype/station-chrome?variant=A
 * /prototype/station-chrome?variant=B&buoy=45198
 *
 * Answers LAY-168: what `StationHeader` and `BottomControlsDock` look like
 * once they're shrunk, Jump to and Legend are gone outright, and the freed
 * space (plus any true-ultrawide width) is spent on purpose — across phone,
 * tablet, desktop, widescreen and beyond. Real buoy history, same 72h
 * window `app/station/[buoyId]` fetches; only the chrome around it varies.
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import PrototypeStationChrome from './PrototypeStationChrome'
import type { BuoyHistoryData } from '@/types'

export const dynamic = 'force-dynamic'

interface StationChromePrototypeProps {
  searchParams: Promise<{ buoy?: string }>
}

const VALID_BUOY_IDS = ['CHII2', '45198']

export default async function StationChromePrototypePage({
  searchParams,
}: StationChromePrototypeProps) {
  const { buoy } = await searchParams
  const buoyId = buoy && VALID_BUOY_IDS.includes(buoy) ? buoy : 'CHII2'

  let historyData: BuoyHistoryData
  if (buoyId === 'CHII2') {
    historyData = await fetchCHII2History()
  } else {
    historyData = await fetchPurdueBuoyHistory()
  }

  const stationInfo = getStationInfo(buoyId)
  if (!stationInfo) notFound()

  return (
    <Suspense fallback={null}>
      <PrototypeStationChrome
        buoyId={buoyId}
        stationName={stationInfo.name}
        data={historyData.history ?? []}
        fetchedAt={historyData.fetchedAt}
        // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
        serverTime={Date.now()}
      />
    </Suspense>
  )
}

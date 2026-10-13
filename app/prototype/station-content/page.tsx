/**
 * PROTOTYPE ROUTE — throwaway. See ./README.md.
 *
 * /prototype/station-content?variant=A
 * /prototype/station-content?variant=B&buoy=45198
 * /prototype/station-content?variant=C&buoy=45198&missing=1
 *
 * Answers LAY-169: how gust and wave height/period/direction render on the
 * station page, inside LAY-168's winning chrome — and whether they become
 * modules of their own or fold into the charts already there. Real 72h wind
 * history (same fetch as `app/station/[buoyId]`); gust and waves are fixtures.
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import PrototypeStationContent from './PrototypeStationContent'
import { PROTO_METADATA, syntheticWind, withFixtures } from './fixtures'
import type { BuoyHistoryData } from '@/types'

export const dynamic = 'force-dynamic'

interface StationContentPrototypeProps {
  searchParams: Promise<{ buoy?: string; missing?: string }>
}

export default async function StationContentPrototypePage({ searchParams }: StationContentPrototypeProps) {
  const { buoy, missing } = await searchParams
  const buoyId = buoy && buoy in PROTO_METADATA ? buoy : 'CHII2'

  let historyData: BuoyHistoryData
  if (buoyId === 'CHII2') {
    historyData = await fetchCHII2History()
  } else {
    historyData = await fetchPurdueBuoyHistory()
  }

  const stationInfo = getStationInfo(buoyId)
  if (!stationInfo) notFound()

  // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
  const serverTime = Date.now()
  const real = historyData.history ?? []
  const wind = real.length > 0 ? real : syntheticWind(serverTime)
  const metadata = PROTO_METADATA[buoyId]

  return (
    <Suspense fallback={null}>
      <PrototypeStationContent
        buoyId={buoyId}
        stationName={stationInfo.name}
        metadata={metadata}
        data={withFixtures(wind, metadata.capability, missing === '1', serverTime)}
        windIsSynthetic={real.length === 0}
        serverTime={serverTime}
      />
    </Suspense>
  )
}

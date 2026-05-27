import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import StationPageClient from './StationPageClient'
import type { BuoyHistoryData } from '@/types'

// Force dynamic rendering for fresh data on every request
export const dynamic = 'force-dynamic'

interface StationPageProps {
  params: Promise<{ buoyId: string }>
}

const VALID_BUOY_IDS = ['CHII2', '45198']

export default async function StationPage({ params }: StationPageProps) {
  const { buoyId } = await params

  // Validate buoyId against known stations
  if (!buoyId || !VALID_BUOY_IDS.includes(buoyId)) {
    notFound()
  }

  // Fetch extended history server-side based on buoyId
  let historyData: BuoyHistoryData
  if (buoyId === 'CHII2') {
    historyData = await fetchCHII2History()
  } else {
    historyData = await fetchPurdueBuoyHistory()
  }

  const stationInfo = getStationInfo(buoyId)
  if (!stationInfo) {
    notFound()
  }

  return (
    <StationPageClient
      buoyId={buoyId}
      stationName={stationInfo.name}
      data={historyData.history ?? []}
      fetchedAt={historyData.fetchedAt}
      // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
      serverTime={Date.now()}
    />
  )
}

import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import StationPageClient from './StationPageClient'
import type { BuoyHistoryData } from '@/types'

// Both stations are known ahead of time, so this page prerenders and refreshes
// on the same five-minute window the buoy data itself is cached on.
export const revalidate = 300

interface StationPageProps {
  params: Promise<{ buoyId: string }>
}

const VALID_BUOY_IDS = ['CHII2', '45198']

export function generateStaticParams(): Array<{ buoyId: string }> {
  return VALID_BUOY_IDS.map((buoyId) => ({ buoyId }))
}

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
    />
  )
}

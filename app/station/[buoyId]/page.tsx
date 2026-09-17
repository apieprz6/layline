import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import StationPageClient from './StationPageClient'
import type { BuoyHistoryData } from '@/types'

// No `generateStaticParams` and no `revalidate`, deliberately, though both stations
// are known ahead of time and the render is cheap.
//
// Prerendering put a second staleness window in series with the Data Cache's: the
// HTML was served stale for up to five minutes, and the reading inside it was
// already up to five minutes old when that HTML was generated, so the screen could
// honestly report a reading ten minutes old and a reload could do nothing about it.
// It also meant the first visitor after a deploy got build-time HTML, which for a
// station NDBC had nothing for at build time was an empty screen until a second
// load. Rendering on demand leaves one window, and it is the one the buoy service
// owns — `unstable_cache` still means one NDBC fetch per five minutes across all
// readers, so what this costs per visit is a cache read.
//
// `useStationHistory` takes it from here in the browser.
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
    />
  )
}

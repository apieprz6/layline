import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import StationHeader from '@/components/dashboard/StationHeader'
import type { BuoyHistoryData } from '@/types'

// Force dynamic rendering for fresh data on every request
export const dynamic = 'force-dynamic'

interface StationPageProps {
  params: { buoyId: string }
}

const VALID_BUOY_IDS = ['CHII2', '45198']

export default async function StationPage({ params }: StationPageProps) {
  const { buoyId } = params

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

  const isLive = historyData.status === 'online' || historyData.status === 'recent'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)' }}>
      <StationHeader
        stationName={stationInfo.name}
        buoyId={buoyId}
        isLive={isLive}
      />

      <div style={{ padding: '16px' }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--text-primary)',
          }}
        >
          <p>Station: {historyData.name}</p>
          <p>Status: {historyData.status}</p>
          <p>Extended history points: {historyData.extendedHistory?.length ?? 0}</p>
          <p>Fetched at: {new Date(historyData.fetchedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}

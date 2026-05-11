import { notFound } from 'next/navigation'
import { fetchCHII2History, fetchPurdueBuoyHistory } from '@/services/buoys/ndbc'
import { getStationInfo } from '@/lib/config/stations'
import StationHeader from '@/components/dashboard/StationHeader'
import PolarChart from '@/components/dashboard/PolarChart'
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
            marginBottom: '24px',
          }}
        >
          <p>Station: {historyData.name}</p>
          <p>Status: {historyData.status}</p>
          <p>Extended history points: {historyData.extendedHistory?.length ?? 0}</p>
          <p>Fetched at: {new Date(historyData.fetchedAt).toLocaleString()}</p>
        </div>

        {/* Polar chart visualization */}
        {historyData.extendedHistory && historyData.extendedHistory.length > 0 && (
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: '600',
                marginBottom: '12px',
              }}
            >
              Wind Direction × Time
            </h2>
            <PolarChart data={historyData.extendedHistory} buoyId={buoyId} />
          </div>
        )}
      </div>
    </div>
  )
}

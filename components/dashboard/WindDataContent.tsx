'use client'

import { useState } from 'react'
import type { BuoyDataResult } from '@/types'
import SummaryBar from './SummaryBar'
import StationCard from './StationCard'
import EmptyState from '@/components/common/EmptyState'
import SectionTabs, { tabPanelId } from '@/components/common/SectionTabs'
import { spacing } from '@/lib/utils/design'

interface WindDataContentProps {
  buoys: BuoyDataResult[]
}

type Tab = 'live' | 'forecast'

const TABS = [
  { id: 'live', label: 'Live & Historical' },
  { id: 'forecast', label: 'Model Forecast' },
] as const satisfies readonly { id: Tab; label: string }[]

export default function WindDataContent({ buoys }: WindDataContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('live')

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <SectionTabs title="Wind Data" tabs={TABS} activeTab={activeTab} onSelect={setActiveTab} />

      {/* Content */}
      <div role="tabpanel" id={tabPanelId(activeTab)} style={{ padding: spacing(4) }}>
        {activeTab === 'live' ? (
          <>
            {/* Summary Bar */}
            <SummaryBar buoys={buoys} />

            {/* Station Cards */}
            <div style={{ marginTop: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
              {buoys.map((buoy) => {
                if (!buoy.data) return null
                const buoyId = buoy.data.buoyId
                return (
                  <StationCard
                    key={buoyId}
                    buoyResult={buoy}
                  />
                )
              })}
            </div>

            {/* Sources Footer */}
            <div
              style={{
                marginTop: '20px',
                textAlign: 'center',
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Sources: NDBC · NOAA ASOS · Updates every 6 min
            </div>
          </>
        ) : (
          <EmptyState
            mark="🌬️"
            title="Model forecast data coming soon"
            detail="GFS, NAM, HRRR, and other models will be compared here"
          />
        )}
      </div>
    </div>
  )
}

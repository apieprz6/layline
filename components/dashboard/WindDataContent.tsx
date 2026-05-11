'use client'

import { useState } from 'react'
import type { BuoyDataResult } from '@/types'
import SummaryBar from './SummaryBar'
import StationCard from './StationCard'
import { spacing } from '@/lib/utils/design'

interface WindDataContentProps {
  buoys: BuoyDataResult[]
}

type Tab = 'live' | 'forecast'

export default function WindDataContent({ buoys }: WindDataContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('live')

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: `${spacing(4)} ${spacing(4)} 0`,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            marginBottom: spacing(3),
          }}
        >
          Wind Data
        </h1>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 0,
          }}
        >
          <button
            onClick={() => setActiveTab('live')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'live' ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '7px 0',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: activeTab === 'live' ? 'var(--weight-semibold)' : 'var(--weight-normal)',
              color: activeTab === 'live' ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 150ms',
              letterSpacing: '0.01em',
            }}
          >
            Live & Historical
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'forecast' ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '7px 0',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: activeTab === 'forecast' ? 'var(--weight-semibold)' : 'var(--weight-normal)',
              color: activeTab === 'forecast' ? 'var(--accent)' : 'var(--text-muted)',
              transition: 'all 150ms',
              letterSpacing: '0.01em',
            }}
          >
            Model Forecast
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: spacing(4) }}>
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
          <ModelForecastPlaceholder />
        )}
      </div>
    </div>
  )
}

function ModelForecastPlaceholder() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        textAlign: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          fontSize: '40px',
          marginBottom: '16px',
          opacity: 0.3,
        }}
      >
        🌬️
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        Model forecast data coming soon
      </div>
      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-muted)',
          maxWidth: '300px',
        }}
      >
        GFS, NAM, HRRR, and other models will be compared here
      </div>
    </div>
  )
}

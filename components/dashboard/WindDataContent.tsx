'use client'

import { useState, useMemo } from 'react'
import type { BuoyDataResult } from '@/types'
import SummaryBar from './SummaryBar'
import StationCard from './StationCard'

interface WindDataContentProps {
  buoys: BuoyDataResult[]
}

type Tab = 'live' | 'forecast'

export default function WindDataContent({ buoys }: WindDataContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null)

  // Determine default expanded station on mount
  useMemo(() => {
    const purdue = buoys.find((b) => b.data?.buoyId === '45198')
    const chii2 = buoys.find((b) => b.data?.buoyId === 'CHII2')

    // Default to Purdue expanded (surface data), fallback to CHII2 if Purdue offline
    if (purdue && purdue.status === 'online') {
      setExpandedStationId('45198')
    } else if (chii2 && chii2.status === 'online') {
      setExpandedStationId('CHII2')
    } else if (purdue) {
      setExpandedStationId('45198')
    } else if (chii2) {
      setExpandedStationId('CHII2')
    }
  }, [buoys])

  const toggleStation = (stationId: string) => {
    setExpandedStationId(expandedStationId === stationId ? null : stationId)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: '16px',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            marginBottom: '14px',
          }}
        >
          Wind Data
        </h1>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'var(--surface-sunken)',
            padding: '4px',
            borderRadius: '8px',
          }}
        >
          <button
            onClick={() => setActiveTab('live')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 'var(--weight-semibold)',
              color: activeTab === 'live' ? 'var(--text-primary)' : 'var(--text-muted)',
              background: activeTab === 'live' ? 'var(--card-bg)' : 'transparent',
              border: activeTab === 'live' ? '1px solid var(--surface-border)' : 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            Live & Historical
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 'var(--weight-semibold)',
              color: activeTab === 'forecast' ? 'var(--text-primary)' : 'var(--text-muted)',
              background: activeTab === 'forecast' ? 'var(--card-bg)' : 'transparent',
              border: activeTab === 'forecast' ? '1px solid var(--surface-border)' : 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            Model Forecast
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {activeTab === 'live' ? (
          <>
            {/* Summary Bar */}
            <SummaryBar buoys={buoys} />

            {/* Station Cards */}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {buoys.map((buoy) => {
                if (!buoy.data) return null
                const buoyId = buoy.data.buoyId
                return (
                  <StationCard
                    key={buoyId}
                    buoyResult={buoy}
                    isExpanded={expandedStationId === buoyId}
                    onToggleExpand={() => toggleStation(buoyId)}
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

'use client'

import { useState, useMemo } from 'react'
import type { WindDataPoint, WindDataPointWithOffset } from '@/types'
import { getMinutesAgo } from '@/lib/utils/time'
import WindowStats from './WindowStats'

interface TabbedInfoPanelProps {
  data: WindDataPoint[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
  onOffsetChange: (offset: number) => void
  buoyId: string
  maxOffsetMinutes: number
  referenceTime?: Date
}

// Common button style for Jump to tab
const jumpButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '12px',
  fontWeight: 500,
  background: 'var(--card-el)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 12px',
  cursor: 'pointer',
  color: 'var(--text)',
  transition: 'all 150ms ease-out',
}

// Wind condition band data
const WIND_BANDS = [
  { label: 'Light', range: '0–8 kts', color: '#007A52' },
  { label: 'Medium', range: '9–15', color: '#0055BB' },
  { label: 'Heavy', range: '16–22', color: '#C47000' },
  { label: 'Storm', range: '23+', color: '#CC1100' },
] as const

/**
 * TabbedInfoPanel component
 *
 * Tabbed interface with Stats, Jump to, and Legend tabs.
 * Stats tab shows WindowStats, Jump to provides quick navigation,
 * Legend shows wind condition bands and usage instructions.
 */
export default function TabbedInfoPanel({
  data,
  timeWindowMinutes,
  nowOffsetMinutes,
  onOffsetChange,
  buoyId,
  maxOffsetMinutes,
  referenceTime,
}: TabbedInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'jump' | 'legend'>('stats')

  // Transform WindDataPoint[] to WindDataPointWithOffset[] by calculating minsAgo
  const dataWithOffset: WindDataPointWithOffset[] = useMemo(() => {
    const now = referenceTime || new Date()
    return data.map((point) => ({
      ...point,
      minsAgo: getMinutesAgo(point.timestamp, now),
    }))
  }, [data, referenceTime])

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
      }}
    >
      {/* Tab header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          background: 'var(--card-el)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '3px',
          gap: '2px',
          marginBottom: '14px',
        }}
      >
        <button
          onClick={() => setActiveTab('stats')}
          className={activeTab === 'stats' ? 'active' : ''}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11.5px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: activeTab === 'stats' ? 'var(--text)' : 'var(--muted)',
            background: activeTab === 'stats' ? 'var(--card-bg)' : 'transparent',
            border: 'none',
            borderRadius: '7px',
            padding: '9px 0',
            cursor: 'pointer',
            boxShadow: activeTab === 'stats' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Stats
        </button>
        <button
          onClick={() => setActiveTab('jump')}
          className={activeTab === 'jump' ? 'active' : ''}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11.5px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: activeTab === 'jump' ? 'var(--text)' : 'var(--muted)',
            background: activeTab === 'jump' ? 'var(--card-bg)' : 'transparent',
            border: 'none',
            borderRadius: '7px',
            padding: '9px 0',
            cursor: 'pointer',
            boxShadow: activeTab === 'jump' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Jump to
        </button>
        <button
          onClick={() => setActiveTab('legend')}
          className={activeTab === 'legend' ? 'active' : ''}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11.5px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: activeTab === 'legend' ? 'var(--text)' : 'var(--muted)',
            background: activeTab === 'legend' ? 'var(--card-bg)' : 'transparent',
            border: 'none',
            borderRadius: '7px',
            padding: '9px 0',
            cursor: 'pointer',
            boxShadow: activeTab === 'legend' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Legend
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'stats' && (
        <WindowStats
          data={dataWithOffset}
          timeWindowMinutes={timeWindowMinutes}
          nowOffsetMinutes={nowOffsetMinutes}
        />
      )}

      {activeTab === 'jump' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button onClick={() => onOffsetChange(0)} style={jumpButtonStyle}>
            Live
          </button>
          <button
            onClick={() => onOffsetChange(Math.min(maxOffsetMinutes, 30))}
            style={jumpButtonStyle}
          >
            30m ago
          </button>
          <button
            onClick={() => onOffsetChange(Math.min(maxOffsetMinutes, 60))}
            style={jumpButtonStyle}
          >
            1h ago
          </button>
          <button
            onClick={() => onOffsetChange(Math.min(maxOffsetMinutes, 360))}
            style={jumpButtonStyle}
          >
            6h ago
          </button>
          <button
            onClick={() => onOffsetChange(Math.min(maxOffsetMinutes, 1440))}
            style={jumpButtonStyle}
          >
            Yesterday
          </button>
          <button
            onClick={() => onOffsetChange(Math.min(maxOffsetMinutes, 2880))}
            style={jumpButtonStyle}
          >
            2d ago
          </button>
        </div>
      )}

      {activeTab === 'legend' && (
        <div>
          {/* Wind condition bands */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px 16px',
            }}
          >
            {WIND_BANDS.map((band) => (
              <div
                key={band.label}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span
                  style={{
                    width: '16px',
                    height: '3px',
                    background: band.color,
                    borderRadius: '2px',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-2)',
                    fontWeight: 500,
                  }}
                >
                  {band.label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10.5px',
                    color: 'var(--muted)',
                  }}
                >
                  {band.range}
                </span>
              </div>
            ))}
          </div>

          {/* CHII2 elevation note - conditional */}
          {buoyId === 'CHII2' && (
            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid var(--divider)',
                fontSize: '11px',
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              Wind measured at 85ft elevation. Surface wind typically 20-30% lower.
            </div>
          )}

          {/* Usage instructions */}
          <div
            style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--divider)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            Hover/touch to see data at any time. Scrub timeline to explore history.
          </div>
        </div>
      )}
    </div>
  )
}

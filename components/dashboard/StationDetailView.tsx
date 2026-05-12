'use client'

import { useState, useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import ScaleControl from './ScaleControl'
import PolarChart from './PolarChart'
import WindReadout from './WindReadout'
import TimeScrubber from './TimeScrubber'

interface StationDetailViewProps {
  data: MinuteDataPoint[]
  buoyId: string
}

const TOTAL_HOURS = 72
const TOTAL_MINUTES = TOTAL_HOURS * 60

export default function StationDetailView({ data, buoyId }: StationDetailViewProps) {
  const [scaleId, setScaleId] = useState<TimeScale>('1h')
  const [hoverPoint, setHoverPoint] = useState<MinuteDataPoint | null>(null)
  const [nowOffset, setNowOffset] = useState<number>(0) // Minutes ago from current time (0 = live)

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes

  // Calculate max offset: can't go back more than TOTAL_MINUTES minus current scale
  const maxOffset = TOTAL_MINUTES - timeWindowMinutes

  // Calculate reference time and window start for display
  // Use state to capture current time once per render cycle
  const [currentTime] = useState(() => Date.now())
  const referenceTime = useMemo(() => new Date(currentTime - nowOffset * 60 * 1000), [currentTime, nowOffset])
  const windowStart = useMemo(() => new Date(currentTime - (nowOffset + timeWindowMinutes) * 60 * 1000), [currentTime, nowOffset, timeWindowMinutes])

  // Format date/time for scrubber display
  const formatDateMinutes = (date: Date): string => {
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
    return date.toLocaleDateString('en-US', opts)
  }

  // Calculate display point: use hoverPoint if set, otherwise most recent data point
  const displayPoint = useMemo(() => {
    if (hoverPoint) return hoverPoint
    if (!data || data.length === 0) return undefined

    // Find point with minsAgo = nowOffset (reference time), or fallback to closest
    const referencePoint = data.find(p => p.minsAgo === nowOffset)
    if (referencePoint) return referencePoint

    // Find closest point to reference time
    let closest = data[0]
    let minDiff = Math.abs(data[0]?.minsAgo - nowOffset)
    for (const point of data) {
      const diff = Math.abs(point.minsAgo - nowOffset)
      if (diff < minDiff) {
        minDiff = diff
        closest = point
      }
    }
    return closest
  }, [hoverPoint, data, nowOffset])

  // Calculate mode: 'touch' when hovering, 'reference' when showing most recent
  const mode: 'reference' | 'touch' = hoverPoint ? 'touch' : 'reference'

  // Check if currently at live position
  const isLive = nowOffset === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <ScaleControl activeScale={scaleId} onScaleChange={setScaleId} />

      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--surface-border)',
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
        <PolarChart
          data={data}
          buoyId={buoyId}
          timeWindowMinutes={timeWindowMinutes}
          nowOffsetMinutes={nowOffset}
          hoverPoint={hoverPoint}
          onHoverChange={setHoverPoint}
        />
      </div>

      {/* Permanent WindReadout card - always visible */}
      {displayPoint && (
        <div style={{ marginTop: '14px' }}>
          <WindReadout point={displayPoint} mode={mode} buoyId={buoyId} />
        </div>
      )}

      {/* Time scrubber with "Return to live" button */}
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--surface-border)',
          borderRadius: '12px',
          padding: '12px 14px 10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '9.5px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            Time scrubber
          </span>
          <button
            onClick={() => setNowOffset(0)}
            disabled={isLive}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 500,
              padding: '6px 10px',
              background: isLive ? 'var(--surface-card)' : '#0044CC',
              color: isLive ? 'var(--text-secondary)' : 'white',
              border: `1px solid ${isLive ? 'var(--surface-border)' : '#0044CC'}`,
              borderRadius: '8px',
              cursor: isLive ? 'not-allowed' : 'pointer',
              opacity: isLive ? 0.45 : 1,
            }}
          >
            Return to live
          </button>
        </div>
        <TimeScrubber
          value={nowOffset}
          max={maxOffset}
          scaleMinutes={timeWindowMinutes}
          onChange={setNowOffset}
        />
        <div
          style={{
            marginTop: '4px',
            fontSize: '10.5px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {formatDateMinutes(windowStart)} → {formatDateMinutes(referenceTime)}
        </div>
      </div>
    </div>
  )
}

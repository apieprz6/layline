'use client'

import { useState, useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { windowData, TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import ScaleControl from './ScaleControl'
import PolarChart from './PolarChart'
import WindReadout from './WindReadout'

interface StationDetailViewProps {
  data: MinuteDataPoint[]
  buoyId: string
}

export default function StationDetailView({ data, buoyId }: StationDetailViewProps) {
  const [scaleId, setScaleId] = useState<TimeScale>('1h')
  const [hoverPoint, setHoverPoint] = useState<MinuteDataPoint | null>(null)

  const filteredData = useMemo(() => {
    return windowData(data, scaleId)
  }, [data, scaleId])

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes

  // Calculate display point: use hoverPoint if set, otherwise most recent data point
  // Note: filteredData is sorted by minsAgo (ascending), so first element is most recent (minsAgo = 0)
  const displayPoint = useMemo(() => {
    if (hoverPoint) return hoverPoint
    // Find point with minsAgo = 0, or fallback to first available point
    return filteredData.find(p => p.minsAgo === 0) || filteredData[0]
  }, [hoverPoint, filteredData])

  // Calculate mode: 'touch' when hovering, 'reference' when showing most recent
  const mode: 'reference' | 'touch' = hoverPoint ? 'touch' : 'reference'

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
          data={filteredData}
          buoyId={buoyId}
          timeWindowMinutes={timeWindowMinutes}
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
    </div>
  )
}

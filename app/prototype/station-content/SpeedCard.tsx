/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * `../station-chrome/SpeedCard.tsx` with the gust-aware chart and a slot
 * after the title. The title says "Wind speed · gust" only when gust is
 * actually drawn, so the card names what it shows and nothing else.
 */

import type { ReactNode } from 'react'
import type { WindDataPointWithOffset } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import GustSpeedLineChart from './GustSpeedLineChart'
import type { ProtoPoint } from './fixtures'

interface SpeedCardProps {
  data: ProtoPoint[]
  gustStyle: 'band' | 'ticks' | 'none'
  now: Date
  scaleId: TimeScale
  timeWindowMinutes: number
  nowOffset: number
  hoverPoint: WindDataPointWithOffset | null
  onHoverChange: (point: WindDataPointWithOffset | null) => void
  titleExtra?: ReactNode
}

export default function SpeedCard({
  data,
  gustStyle,
  now,
  scaleId,
  timeWindowMinutes,
  nowOffset,
  hoverPoint,
  onHoverChange,
  titleExtra,
}: SpeedCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: '12px',
        padding: '12px 10px 6px 10px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 6px 4px 6px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '9.5px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Wind speed
            {gustStyle !== 'none' && <span style={{ color: '#C47000' }}> · gust</span>}
          </span>
          {titleExtra}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
          {TIME_SCALES[scaleId].label}
        </span>
      </div>
      <GustSpeedLineChart
        data={data}
        gustStyle={gustStyle}
        referenceTime={now}
        timeWindowMinutes={timeWindowMinutes}
        nowOffsetMinutes={nowOffset}
        hoverPoint={hoverPoint}
        onHoverChange={onHoverChange}
      />
    </div>
  )
}

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * `StationPageClient`'s speed card, verbatim. Card content isn't chrome, so it doesn't vary.
 */

import type { WindDataPoint, WindDataPointWithOffset } from '@/types'
import SpeedLineChart from '@/components/dashboard/SpeedLineChart'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'

interface SpeedCardProps {
  data: WindDataPoint[]
  now: Date
  scaleId: TimeScale
  timeWindowMinutes: number
  nowOffset: number
  hoverPoint: WindDataPointWithOffset | null
  onHoverChange: (point: WindDataPointWithOffset | null) => void
}

export default function SpeedCard({
  data,
  now,
  scaleId,
  timeWindowMinutes,
  nowOffset,
  hoverPoint,
  onHoverChange,
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
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
          {TIME_SCALES[scaleId].label}
        </span>
      </div>
      <SpeedLineChart
        data={data}
        referenceTime={now}
        timeWindowMinutes={timeWindowMinutes}
        nowOffsetMinutes={nowOffset}
        hoverPoint={hoverPoint}
        onHoverChange={onHoverChange}
      />
    </div>
  )
}

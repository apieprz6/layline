'use client'

import type { MinuteDataPoint } from '@/types'
import { getWindCondition, getCompassDirection } from '@/lib/utils/wind'

interface WindReadoutProps {
  point: MinuteDataPoint
  buoyId: string
}

export default function WindReadout({ point }: WindReadoutProps) {
  const condition = getWindCondition(point.spd)
  const compass = getCompassDirection(point.dir)

  const timeLabel = point.minsAgo === 0 ? 'now' : `${point.minsAgo}m ago`

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Wind Direction */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '20px',
            fontWeight: '600',
          }}
        >
          {point.dir}°
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--text-secondary)',
          }}
        >
          {compass}
        </span>
      </div>

      {/* Wind Speed */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '24px',
            fontWeight: '700',
            color: condition.color,
          }}
        >
          {point.spd}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            color: 'var(--text-secondary)',
          }}
        >
          kts
        </span>
      </div>

      {/* Wind Condition */}
      <div
        style={{
          display: 'inline-block',
          padding: '4px 8px',
          borderRadius: '4px',
          background: condition.bg,
          border: `1px solid ${condition.border}`,
          width: 'fit-content',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: '600',
            color: condition.color,
          }}
        >
          {condition.label}
        </span>
      </div>

      {/* Timestamp */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}
      >
        {timeLabel}
      </div>
    </div>
  )
}

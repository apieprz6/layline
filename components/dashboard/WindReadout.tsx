'use client'

import type { MinuteDataPoint } from '@/types'
import { getWindCondition, getCompassDirection, getWindColorHex } from '@/lib/utils/wind'
import { formatTimeOffset, formatTime } from '@/lib/utils/time'

interface WindReadoutProps {
  point: MinuteDataPoint
  mode: 'reference' | 'touch'
  buoyId: string
}

export default function WindReadout({ point, mode }: WindReadoutProps) {
  const condition = getWindCondition(point.spd)
  const compass = getCompassDirection(point.dir)
  const windColor = getWindColorHex(point.spd)

  // Calculate timestamp (current time - minsAgo)
  const now = new Date()
  const pointTime = new Date(now.getTime() - point.minsAgo * 60 * 1000)
  const timeString = formatTime(pointTime)
  const offsetString = formatTimeOffset(point.minsAgo)

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header row: mode label and timestamp */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
        }}
      >
        <span
          style={{
            fontWeight: '600',
            color: 'var(--text-secondary)',
          }}
        >
          {mode === 'reference' ? 'At Reference' : 'At Touch'}
        </span>
        <span
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {timeString} · {offsetString}
        </span>
      </div>

      {/* Two-column grid with vertical divider */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Left column: Wind direction */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            borderRight: '1px solid var(--divider)',
            paddingRight: '16px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '28px',
              fontWeight: '700',
              lineHeight: '1',
            }}
          >
            {point.dir}°
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-secondary)',
            }}
          >
            {compass}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            Direction (from)
          </div>
        </div>

        {/* Vertical divider (handled by border-right above) */}
        <div />

        {/* Right column: Wind speed */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '28px',
                fontWeight: '700',
                color: windColor,
                lineHeight: '1',
              }}
            >
              {point.spd}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              kts
            </span>
          </div>
          {/* Condition badge */}
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
                fontSize: '11px',
                fontWeight: '600',
                color: condition.color,
              }}
            >
              {condition.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

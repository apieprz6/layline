'use client'

import { useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { calculateWindowStats } from '@/lib/utils/windowStats'
import { getCompassDirection } from '@/lib/utils/wind'

interface WindowStatsProps {
  data: MinuteDataPoint[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
}

interface StatProps {
  label: string
  big: string
  sub: string
}

/**
 * Individual stat card component
 * Displays a labeled statistic with large numeral and smaller sub-text
 */
function Stat({ label, big, sub }: StatProps) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '9.5px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: '2px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '19px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {big}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          {sub}
        </span>
      </div>
    </div>
  )
}

/**
 * WindowStats component
 *
 * Displays aggregate wind statistics for the current time window in a 2x2 grid.
 * Shows mean direction (with compass heading), mean speed, range, and veer/back spread.
 *
 * Uses vector averaging for direction to handle angular wraparound correctly.
 * Delegates calculation to calculateWindowStats() utility function.
 *
 * @param data - Full minute-level data array
 * @param timeWindowMinutes - Size of time window (e.g., 30, 60, 360)
 * @param nowOffsetMinutes - Current offset from live data (0 = live)
 */
export default function WindowStats({
  data,
  timeWindowMinutes,
  nowOffsetMinutes,
}: WindowStatsProps) {
  // Filter data to time window and calculate stats
  const stats = useMemo(() => {
    const windowStart = nowOffsetMinutes
    const windowEnd = nowOffsetMinutes + timeWindowMinutes

    const filteredData = data.filter(
      (p) => p.minsAgo >= windowStart && p.minsAgo <= windowEnd
    )

    return calculateWindowStats(filteredData)
  }, [data, timeWindowMinutes, nowOffsetMinutes])

  // Show message when insufficient data
  if (!stats) {
    return (
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        No data in window.
      </div>
    )
  }

  // Render 2x2 grid of stat cards
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px',
      }}
    >
      <Stat
        label="Mean dir"
        big={`${stats.meanDir}°`}
        sub={getCompassDirection(stats.meanDir)}
      />
      <Stat
        label="Mean spd"
        big={`${stats.meanSpd.toFixed(1)}`}
        sub="kts"
      />
      <Stat
        label="Range"
        big={`${stats.spdMin.toFixed(0)}–${stats.spdMax.toFixed(0)}`}
        sub="kts"
      />
      <Stat
        label="Veer/back"
        big={`${stats.spread.toFixed(0)}°`}
        sub="spread"
      />
    </div>
  )
}

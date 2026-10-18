'use client'

import { useMemo } from 'react'
import type { WindDataPointWithOffset } from '@/types'
import { calculateWindowStats } from '@/lib/utils/windowStats'
import { inWindow } from '@/lib/utils/windowing'
import { getCompassDirection } from '@/lib/utils/wind'

interface WindowStatsProps {
  data: WindDataPointWithOffset[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
}

interface StatProps {
  label: string
  big: string
  sub: string
}

/**
 * Individual stat tile, inset in the panel
 * Displays a labeled statistic with large numeral and smaller sub-text: label at the top, figure
 * at the bottom, so a tile stretched to a tall grid row reads as one block rather than a gap
 */
function Stat({ label, big, sub }: StatProps) {
  return (
    <div
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-divider)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '4px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--window-stat-label-size, 9.5px)',
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
            fontSize: 'var(--window-stat-big-size, 19px)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {big}
        </span>
        <span
          style={{
            fontSize: 'var(--window-stat-sub-size, 11px)',
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
  const stats = useMemo(
    () => calculateWindowStats(inWindow(data, timeWindowMinutes, nowOffsetMinutes)),
    [data, timeWindowMinutes, nowOffsetMinutes]
  )

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

  // Render 2x2 grid of stat tiles, filling whatever height the panel is given
  // (the desktop layout stretches it to its grid row, and scales the type to suit)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '8px',
        flex: 1,
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

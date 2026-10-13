/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * `TabbedInfoPanel` with Jump to and Legend removed outright, per LAY-168 —
 * not un-tabbed, deleted, so what is left is `WindowStats` alone and no tab
 * chrome at all. Shared by all three variants: whether to keep a tab bar for
 * one tab isn't a variant question, it's "no."
 */

import type { WindDataPointWithOffset } from '@/types'
import WindowStats from '@/components/dashboard/WindowStats'

interface StatsOnlyProps {
  dataWithOffset: WindDataPointWithOffset[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
  className?: string
}

export default function StatsOnly({
  dataWithOffset,
  timeWindowMinutes,
  nowOffsetMinutes,
  className,
}: StatsOnlyProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '9.5px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: '10px',
        }}
      >
        Stats
      </div>
      <WindowStats
        data={dataWithOffset}
        timeWindowMinutes={timeWindowMinutes}
        nowOffsetMinutes={nowOffsetMinutes}
      />
    </div>
  )
}

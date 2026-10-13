import type { WindDataPointWithOffset } from '@/types'
import WindowStats from './WindowStats'

interface StationStatsPanelProps {
  dataWithOffset: WindDataPointWithOffset[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
}

export const STATS_PANEL_STYLE = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: '14px',
  boxShadow: 'var(--shadow-sm)',
} as const

export const STATS_PANEL_LABEL_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '10px',
} as const

export default function StationStatsPanel({
  dataWithOffset,
  timeWindowMinutes,
  nowOffsetMinutes,
}: StationStatsPanelProps) {
  return (
    <div style={STATS_PANEL_STYLE}>
      <div style={STATS_PANEL_LABEL_STYLE}>Stats</div>

      <WindowStats
        data={dataWithOffset}
        timeWindowMinutes={timeWindowMinutes}
        nowOffsetMinutes={nowOffsetMinutes}
      />
    </div>
  )
}

import type { BuoyMetadata, WindDataPointWithOffset } from '@/types'
import WindowStats from './WindowStats'

interface StationStatsPanelProps {
  dataWithOffset: WindDataPointWithOffset[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
  metadata: BuoyMetadata
}

// Below this an anemometer is effectively at surface and its reading needs no elevation caveat.
const SURFACE_LEVEL_FT = 10

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
  metadata,
}: StationStatsPanelProps) {
  const elevationNote =
    metadata.windMeasurementHeight > SURFACE_LEVEL_FT ? metadata.adjustmentNote : undefined

  return (
    <div style={STATS_PANEL_STYLE}>
      <div style={STATS_PANEL_LABEL_STYLE}>Stats</div>

      <WindowStats
        data={dataWithOffset}
        timeWindowMinutes={timeWindowMinutes}
        nowOffsetMinutes={nowOffsetMinutes}
      />

      {elevationNote && (
        <p
          style={{
            margin: '12px 0 0 0',
            paddingTop: '10px',
            borderTop: '1px solid var(--divider)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {elevationNote}
        </p>
      )}
    </div>
  )
}

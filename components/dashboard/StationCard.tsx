import type { BuoyDataResult } from '@/types'
import StationRow from './StationRow'
import StationCardExpanded from './StationCardExpanded'
import { getWindCondition } from '@/lib/utils/wind'
import { getStationInfo, getStatusColor, getStatusLabel } from '@/lib/config/stations'
import { radius, spacing } from '@/lib/utils/design'

interface StationCardProps {
  buoyResult: BuoyDataResult
  isExpanded: boolean
  onToggleExpand: () => void
}

export default function StationCard({ buoyResult, isExpanded, onToggleExpand }: StationCardProps) {
  const { data, status } = buoyResult

  // Handle missing data
  if (!data) {
    return null
  }

  const stationInfo = getStationInfo(data.buoyId)
  if (!stationInfo) {
    return null
  }

  const statusColor = getStatusColor(status)
  const statusLabel = getStatusLabel(status)
  const wc = getWindCondition(data.windSpeed)

  // Format timestamp
  const timestamp = new Date(data.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      style={{
        borderRadius: radius('md'),
        border: `1px solid ${isExpanded ? wc.border : 'var(--card-border)'}`,
        background: 'var(--card-bg)',
        overflow: 'hidden',
        transition: 'border-color 200ms',
        cursor: 'pointer',
      }}
    >
      {/* Collapsed Header */}
      <StationRow
        buoyId={data.buoyId}
        windSpeed={data.windSpeed}
        windDirection={data.windDirection}
        windGust={data.windGust}
        status={status}
        onClick={onToggleExpand}
      />

      {/* Expanded Content */}
      {isExpanded && (
        <div
          style={{
            borderTop: '1px solid var(--surface-border)',
            padding: spacing(4),
          }}
        >
          {/* Status and timestamp row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing(3),
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing(2),
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 'var(--weight-semibold)',
                  color: statusColor,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {statusLabel}
              </div>
            </div>
            <div
              className="data-mono"
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
              }}
            >
              {timestamp}
            </div>
          </div>

          {/* Expanded content with history charts and analytics */}
          <StationCardExpanded buoyId={data.buoyId} />

          {/* CHII2 elevation disclaimer */}
          {data.buoyId === 'CHII2' && (
            <div
              style={{
                marginTop: spacing(3),
                padding: `${spacing(2)} 10px`,
                background: 'rgba(196, 112, 0, 0.1)',
                border: '1px solid rgba(196, 112, 0, 0.3)',
                borderRadius: radius('sm'),
                display: 'flex',
                alignItems: 'center',
                gap: spacing(2),
              }}
            >
              <span style={{ fontSize: '12px' }}>⚠️</span>
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--wind-heavy)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Wind measured at 85ft elevation above water surface
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

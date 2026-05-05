import type { BuoyDataResult } from '@/types'
import WindArrow from './WindArrow'
import StationCardExpanded from './StationCardExpanded'

interface StationCardProps {
  buoyResult: BuoyDataResult
  isExpanded: boolean
  onToggleExpand: () => void
}

// Station location info per CONTEXT.md
const STATION_INFO = {
  CHII2: {
    name: 'Harrison Dever Crib',
    location: '2.2mi offshore · 85ft elevation',
  },
  '45198': {
    name: 'Purdue Buoy',
    location: '2.8mi offshore · surface',
  },
}

// Status dot color based on DataSourceStatus
function getStatusColor(status: BuoyDataResult['status']): string {
  switch (status) {
    case 'online':
      return 'var(--state-success)' // green
    case 'recent':
      return 'var(--state-warning)' // amber
    case 'stale':
    case 'offline':
    case 'error':
    default:
      return 'var(--state-neutral)' // gray
  }
}

function getStatusLabel(status: BuoyDataResult['status']): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'recent':
      return 'Recent'
    case 'stale':
      return 'Stale'
    case 'offline':
      return 'Offline'
    case 'error':
      return 'Error'
    default:
      return 'Unknown'
  }
}

export default function StationCard({ buoyResult, isExpanded, onToggleExpand }: StationCardProps) {
  const { data, status } = buoyResult

  // Handle missing data
  if (!data) {
    return null
  }

  const stationInfo = STATION_INFO[data.buoyId as keyof typeof STATION_INFO]
  if (!stationInfo) {
    return null
  }

  const statusColor = getStatusColor(status)
  const statusLabel = getStatusLabel(status)

  const windCondition = (kts: number) => {
    if (kts <= 8) return '#007A52' // light
    if (kts <= 15) return '#0055BB' // medium
    if (kts <= 22) return '#C47000' // heavy
    return '#CC1100' // storm
  }

  const speedColor = windCondition(data.windSpeed)

  // Format timestamp
  const timestamp = new Date(data.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      className="layline-card"
      style={{
        cursor: 'pointer',
        transition: 'all 150ms',
      }}
      onClick={onToggleExpand}
    >
      {/* Collapsed Header */}
      <div
        style={{
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}88`,
            flexShrink: 0,
          }}
        />

        {/* Station name + location */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: '14px',
              color: 'var(--text-primary)',
              marginBottom: '2px',
            }}
          >
            {stationInfo.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '10px',
              color: 'var(--text-muted)',
            }}
          >
            {stationInfo.location}
          </div>
        </div>

        {/* Wind arrow + speed + gust */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <WindArrow deg={data.windDirection} kts={data.windSpeed} size={18} color={speedColor} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span
                className="data-mono"
                style={{
                  fontSize: '18px',
                  color: speedColor,
                  fontWeight: 'var(--weight-bold)',
                }}
              >
                {Math.round(data.windSpeed)}
              </span>
              <span
                className="data-mono"
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                }}
              >
                kts
              </span>
            </div>
            {data.windGust && (
              <div
                className="data-mono"
                style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                }}
              >
                g{Math.round(data.windGust)}
              </div>
            )}
          </div>
        </div>

        {/* Expand/collapse icon */}
        <div
          style={{
            flexShrink: 0,
            color: 'var(--text-muted)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div
          style={{
            borderTop: '1px solid var(--surface-border)',
            padding: '14px',
          }}
        >
          {/* Status and timestamp row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
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
                marginTop: '12px',
                padding: '8px 10px',
                background: 'rgba(196, 112, 0, 0.1)',
                border: '1px solid rgba(196, 112, 0, 0.3)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px' }}>⚠️</span>
              <div
                style={{
                  fontSize: '10px',
                  color: '#C47000',
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

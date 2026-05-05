import Link from 'next/link'
import type { BuoyDataResult } from '@/types'
import WindArrow from './WindArrow'

interface LiveWindCardProps {
  buoys: BuoyDataResult[]
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

function StationRow({ buoyResult }: { buoyResult: BuoyDataResult }) {
  const { data, status, error } = buoyResult

  // Determine station info (even if offline)
  const buoyId = data?.buoyId || (error?.includes('Purdue') ? '45198' : 'CHII2')
  const stationInfo = STATION_INFO[buoyId as keyof typeof STATION_INFO]

  if (!stationInfo) {
    return null
  }

  const statusColor = getStatusColor(status)

  // Handle offline/error state
  if (!data) {
    const isSeasonalOffline = error?.includes('seasonal')

    return (
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderRadius: '8px',
          border: '1px solid var(--surface-border)',
          background: 'var(--card-bg)',
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}88`,
            flexShrink: 0,
          }}
        />

        {/* Station name + status message */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: '12px',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stationInfo.name}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '9px',
              color: 'var(--text-muted)',
              marginTop: '1px',
            }}
          >
            {isSeasonalOffline ? 'Seasonal (May-Oct)' : 'Offline'}
          </div>
        </div>

        {/* Offline indicator */}
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}
        >
          No data
        </div>
      </div>
    )
  }

  const windCondition = (kts: number) => {
    if (kts <= 8) return '#007A52' // light
    if (kts <= 15) return '#0055BB' // medium
    if (kts <= 22) return '#C47000' // heavy
    return '#CC1100' // storm
  }

  const speedColor = windCondition(data.windSpeed)

  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderRadius: '8px',
        border: '1px solid var(--surface-border)',
        background: 'var(--card-bg)',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: '7px',
          height: '7px',
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
            fontSize: '12px',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {stationInfo.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '9px',
            color: 'var(--text-muted)',
            marginTop: '1px',
          }}
        >
          {stationInfo.location}
        </div>
      </div>

      {/* Wind arrow + speed + gust */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <WindArrow deg={data.windDirection} kts={data.windSpeed} size={16} color={speedColor} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span
              className="data-mono"
              style={{
                fontSize: '16px',
                color: speedColor,
                fontWeight: 'var(--weight-bold)',
              }}
            >
              {Math.round(data.windSpeed)}
            </span>
            <span
              className="data-mono"
              style={{
                fontSize: '9px',
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
    </div>
  )
}

export default function LiveWindCard({ buoys }: LiveWindCardProps) {
  // Find CHII2 and Purdue Buoy (45198) in order
  // Match by buoyId in data, or by error message if offline
  const chii2 = buoys.find(
    (b) => b.data?.buoyId === 'CHII2' || (!b.data && !b.error?.includes('Purdue'))
  )
  const purdue = buoys.find(
    (b) => b.data?.buoyId === '45198' || (!b.data && b.error?.includes('Purdue'))
  )

  const displayBuoys = [chii2, purdue].filter(Boolean) as BuoyDataResult[]

  // If no buoys available at all, don't render the card
  if (displayBuoys.length === 0) {
    return null
  }

  return (
    <div className="layline-card">
      {/* Card header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <div className="label" style={{ color: 'var(--text-secondary)' }}>
          Live Wind
        </div>
        <Link
          href="/dashboard/wind-data"
          style={{
            fontSize: '10px',
            color: 'var(--text-accent)',
            textDecoration: 'none',
          }}
        >
          See all →
        </Link>
      </div>

      {/* Station rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {displayBuoys.map((buoy, index) => (
          <StationRow key={buoy.data?.buoyId || `buoy-${index}`} buoyResult={buoy} />
        ))}
      </div>
    </div>
  )
}

import type { BuoyDataResult } from '@/types'
import WindArrow from './WindArrow'

interface SummaryBarProps {
  buoys: BuoyDataResult[]
}

// Calculate consensus direction from multiple angles
// Handles wraparound (e.g., average of 350° and 10° should be 0°, not 180°)
function averageDirections(directions: number[]): number {
  if (directions.length === 0) return 0

  // Convert to radians and calculate mean of sin/cos components
  let sumSin = 0
  let sumCos = 0

  directions.forEach((deg) => {
    const rad = (deg * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  })

  const avgSin = sumSin / directions.length
  const avgCos = sumCos / directions.length

  // Convert back to degrees
  let avgRad = Math.atan2(avgSin, avgCos)
  let avgDeg = (avgRad * 180) / Math.PI

  // Normalize to 0-360
  if (avgDeg < 0) {
    avgDeg += 360
  }

  return Math.round(avgDeg)
}

export default function SummaryBar({ buoys }: SummaryBarProps) {
  // Filter to online stations only (< 2 minutes old)
  const onlineStations = buoys.filter(
    (b) => b.status === 'online' && b.data && b.data.windSpeed != null
  )

  const onlineCount = onlineStations.length
  const hasOnlineStations = onlineCount > 0

  // Calculate average wind speed from online stations
  const avgWindSpeed = hasOnlineStations
    ? onlineStations.reduce((sum, b) => sum + (b.data?.windSpeed || 0), 0) / onlineCount
    : 0

  // Calculate consensus direction from online stations
  const consensusDirection = hasOnlineStations
    ? averageDirections(
        onlineStations
          .map((b) => b.data?.windDirection)
          .filter((dir): dir is number => dir != null)
      )
    : 0

  // Last sync timestamp (most recent fetchedAt)
  const lastSync = buoys.reduce((latest, b) => {
    const fetchedAt = new Date(b.fetchedAt).getTime()
    return fetchedAt > latest ? fetchedAt : latest
  }, 0)

  const lastSyncDate = new Date(lastSync)
  const lastSyncStr = lastSyncDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Wind condition color
  const windCondition = (kts: number) => {
    if (kts <= 8) return '#007A52' // light
    if (kts <= 15) return '#0055BB' // medium
    if (kts <= 22) return '#C47000' // heavy
    return '#CC1100' // storm
  }

  const speedColor = windCondition(avgWindSpeed)
  const statusColor = hasOnlineStations ? 'var(--state-success)' : 'var(--state-neutral)'

  return (
    <div
      className="layline-card"
      style={{
        padding: '14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            flexShrink: 0,
          }}
        />

        {/* Station count */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginBottom: '2px',
            }}
          >
            {onlineCount === 0
              ? '0 stations online'
              : onlineCount === 1
              ? '1 station online'
              : `${onlineCount} stations online`}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-muted)',
            }}
          >
            Last sync: {lastSyncStr}
          </div>
        </div>

        {/* Average wind speed */}
        {hasOnlineStations && (
          <>
            <WindArrow deg={consensusDirection} kts={avgWindSpeed} size={20} color={speedColor} />
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                <span
                  className="data-mono"
                  style={{
                    fontSize: '20px',
                    color: speedColor,
                    fontWeight: 'var(--weight-bold)',
                  }}
                >
                  {Math.round(avgWindSpeed)}
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
              <div
                className="data-mono"
                style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                }}
              >
                {consensusDirection}°
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

import type { BuoyDataResult } from '@/types'
import WindArrow from './WindArrow'
import { getWindColorHex } from '@/lib/utils/wind'
import { averageDirections } from '@/lib/utils/statistics'
import { radius, spacing } from '@/lib/utils/design'

interface SummaryBarProps {
  buoys: BuoyDataResult[]
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

  const speedColor = getWindColorHex(avgWindSpeed)
  const statusColor = hasOnlineStations ? 'var(--state-success)' : 'var(--state-neutral)'

  return (
    <div
      className="layline-card"
      style={{
        padding: spacing(4),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing(3),
        }}
      >
        {/* Status dot */}
        <div
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: statusColor,
            filter: `drop-shadow(0 0 8px ${statusColor})`,
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

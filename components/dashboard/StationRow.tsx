'use client'

import { useRouter } from 'next/navigation'
import type { DataSourceStatus } from '@/types'
import WindArrow from './WindArrow'
import { getStationInfo, getStatusColor } from '@/lib/config/stations'
import { getWindCondition, getWindColorHex } from '@/lib/utils/wind'
import { spacing } from '@/lib/utils/design'

interface StationRowProps {
  buoyId: string
  windSpeed: number
  windDirection: number
  windGust?: number
  status: DataSourceStatus
  timestamp?: string
  onClick?: () => void
}

/**
 * Format timestamp to relative time string (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

/**
 * StationRow displays a compact buoy station summary
 * Used in both StationCard (collapsed state) and LiveWindCard
 *
 * Shows: status dot, station name/location (or timestamp if provided), wind arrow, speed, gust
 */
export default function StationRow({
  buoyId,
  windSpeed,
  windDirection,
  windGust,
  status,
  timestamp,
  onClick,
}: StationRowProps) {
  const router = useRouter()
  const stationInfo = getStationInfo(buoyId)
  if (!stationInfo) {
    return null
  }

  const statusColor = getStatusColor(status)
  const wc = getWindCondition(windSpeed)
  const windColorHex = getWindColorHex(windSpeed)

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      router.push(`/station/${buoyId}`)
    }
  }

  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: spacing(3),
        cursor: 'pointer',
      }}
      onClick={handleClick}
    >
      {/* Status dot */}
      <div
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: statusColor,
          filter: `drop-shadow(0 0 6px ${statusColor})`,
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
            marginBottom: '1px',
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
          {timestamp ? formatRelativeTime(timestamp) : stationInfo.location}
        </div>
      </div>

      {/* Wind arrow + speed + gust */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2), flexShrink: 0 }}>
        <WindArrow deg={windDirection} kts={windSpeed} size={16} color={windColorHex} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span
              className="data-mono"
              style={{
                fontSize: '16px',
                color: wc.color,
                fontWeight: 'var(--weight-bold)',
              }}
            >
              {Math.round(windSpeed)}
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
          {windGust && (
            <div
              className="data-mono"
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
              }}
            >
              g{Math.round(windGust)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

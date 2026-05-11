'use client'

import { useRouter } from 'next/navigation'
import type { DataSourceStatus } from '@/types'
import WindArrow from './WindArrow'
import { getStationInfo, getStatusColor } from '@/lib/config/stations'
import { getWindCondition, getWindColorHex } from '@/lib/utils/wind'
import { radius, spacing } from '@/lib/utils/design'

interface StationRowProps {
  buoyId: string
  windSpeed: number
  windDirection: number
  windGust?: number
  status: DataSourceStatus
  onClick?: () => void
}

/**
 * StationRow displays a compact buoy station summary
 * Used in both StationCard (collapsed state) and LiveWindCard
 *
 * Shows: status dot, station name/location, wind arrow, speed, gust
 */
export default function StationRow({
  buoyId,
  windSpeed,
  windDirection,
  windGust,
  status,
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
      router.push(`/dashboard/station/${buoyId}`)
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
          {stationInfo.location}
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

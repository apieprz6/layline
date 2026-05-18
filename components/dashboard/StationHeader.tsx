'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { spacing } from '@/lib/utils/design'
import { formatTimeHHMM, formatFetchAge, formatOffset } from '@/lib/utils/timeFormatting'

interface StationHeaderProps {
  stationName: string
  buoyId: string
  latestDataTime: Date
  lastFetchTime: Date
  nowOffset: number
  onReturnToLive: () => void
}

/**
 * Sticky header for station detail page
 * Shows back button, station name, metadata row, and interactive live pill
 */
export default function StationHeader({
  stationName,
  buoyId,
  latestDataTime,
  lastFetchTime,
  nowOffset,
  onReturnToLive,
}: StationHeaderProps) {
  const router = useRouter()
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Update timer every second for "Fetched X sec ago"
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const isLive = nowOffset === 0
  const fetchAge = formatFetchAge(lastFetchTime, new Date(nowTick))

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--surface-border)',
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
        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            background: 'none',
            border: 'none',
            padding: spacing(2),
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            fontSize: '18px',
            lineHeight: 1,
          }}
          aria-label="Go back"
        >
          ←
        </button>

        {/* Station name */}
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 'var(--weight-bold)',
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {stationName}
          </h1>
          <div
            className="data-mono"
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {buoyId}
          </div>
        </div>

        {/* Interactive live pill */}
        <button
          onClick={onReturnToLive}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px 5px 8px',
            borderRadius: '999px',
            border: isLive
              ? '1.25px solid rgba(0,122,47,0.45)'
              : '1.25px solid rgba(0,68,204,0.66)',
            background: isLive ? 'rgba(0,122,47,0.06)' : 'rgba(0,68,204,0.15)',
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: isLive ? '#007A2F' : '#0044CC',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label={isLive ? 'Live' : 'Return to live'}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '999px',
              background: 'currentColor',
              boxShadow: '0 0 0 0 currentColor',
              animation: isLive ? 'pulseDot 2s ease-out infinite' : 'none',
            }}
          />
          <span>{isLive ? 'Live' : formatOffset(nowOffset)}</span>
        </button>
      </div>

      {/* Metadata row: Latest, Fetched, viewing offset */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10.5px',
          color: 'var(--text-muted)',
          marginTop: '10px',
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ opacity: 0.7 }}>Latest </span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {formatTimeHHMM(latestDataTime)}
          </span>
        </span>
        <span
          style={{
            width: '3px',
            height: '3px',
            borderRadius: '999px',
            background: 'rgba(0,0,0,0.28)',
            flexShrink: 0,
          }}
        />
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ opacity: 0.7 }}>Fetched </span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fetchAge}</span>
        </span>
        <span style={{ flex: 1 }} />
        {!isLive && (
          <span style={{ color: '#0044CC', fontWeight: 600, whiteSpace: 'nowrap' }}>
            viewing {formatOffset(nowOffset)}
          </span>
        )}
      </div>
    </div>
  )
}

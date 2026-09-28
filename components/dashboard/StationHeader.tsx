'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { spacing } from '@/lib/utils/design'
import { formatTimeHHMM, formatFetchAge, formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'

interface StationHeaderProps {
  stationName: string
  buoyId: string
  latestDataTime: Date
  lastFetchTime: Date
  nowOffset: number
  onReturnToLive: () => void
  /** Omitted where there is nothing to ask again — the skeleton header. */
  onRefresh?: () => void
  isRefreshing?: boolean
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
  onRefresh,
  isRefreshing = false,
}: StationHeaderProps) {
  const router = useRouter()
  const [nowTick, setNowTick] = useState(() => Date.now())

  const handleBack = useCallback(() => {
    safeBack(router)
  }, [router])

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
      // Shared with the header in `app/station/[buoyId]/loading.tsx`, so a browser can
      // measure both and prove the swap moves nothing.
      data-testid="station-header"
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
          onClick={handleBack}
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
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            // Sits beside the age it acts on: the reading is what is stale, and this
            // is the way to say so out loud rather than waiting for the poll.
            //
            // The padding is a tap target — 11px of glyph is not one on a 390px
            // screen — and the negative margin takes it back out of the layout, so
            // the metadata row is still as tall as its text and the skeleton header
            // in `loading.tsx` still measures the same. `e2e/loading-skeletons.spec.ts`
            // holds that to a pixel.
            style={{
              background: 'none',
              border: 'none',
              padding: spacing(2),
              // `-${spacing(2)}` would be `-var(--space-2)`, which is not CSS and
              // gets dropped — the whole padded box would then grow the row.
              margin: `calc(${spacing(2)} * -1)`,
              fontSize: '11px',
              lineHeight: 1,
              color: isRefreshing ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: isRefreshing ? 'default' : 'pointer',
              flexShrink: 0,
              animation: isRefreshing ? 'spin 900ms linear infinite' : 'none',
            }}
            aria-label={isRefreshing ? 'Refreshing' : 'Refresh this reading'}
          >
            ↻
          </button>
        )}
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

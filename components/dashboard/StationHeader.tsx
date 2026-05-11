'use client'

import { useRouter } from 'next/navigation'
import { spacing } from '@/lib/utils/design'

interface StationHeaderProps {
  stationName: string
  buoyId: string
  isLive: boolean
}

/**
 * Sticky header for station detail page
 * Shows back button, station name, and live/historical badge
 */
export default function StationHeader({ stationName, buoyId, isLive }: StationHeaderProps) {
  const router = useRouter()

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

        {/* Live/Historical badge */}
        <div
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            background: isLive ? 'rgba(0, 255, 0, 0.1)' : 'rgba(85, 85, 85, 0.1)',
            border: `1px solid ${isLive ? 'rgba(0, 255, 0, 0.3)' : 'rgba(85, 85, 85, 0.3)'}`,
            fontSize: '9px',
            fontWeight: 'var(--weight-semibold)',
            color: isLive ? '#00FF00' : 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {isLive ? 'Live' : 'Historical'}
        </div>
      </div>
    </div>
  )
}

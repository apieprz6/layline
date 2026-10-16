'use client'

import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { boatIconUrl } from '@/lib/boat/icon'
import type { BoatHeaderIdentity, BuoyDataResult } from '@/types'

interface RaceHeaderProps {
  onOpenMenu?: () => void
  /**
   * The boat, for a signed-in sailor; `null` or absent names nothing, which is what a
   * **Guest** always gets (ADR 0015). Read on the server — the header never fetches it.
   */
  boat?: BoatHeaderIdentity | null
}

/** The wordmark's type, which the boat's name takes over rather than restyling. */
const TITLE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '15px',
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em',
} as const

const STALENESS_THRESHOLD_MS = 25 * 60 * 1000

const fetcher = (url: string) => fetch(url).then(res => res.json())

function useHeaderWind(): { speed: number; direction: number } | null {
  const { data } = useSWR<{ buoys: BuoyDataResult[] }>(
    '/api/weather/buoys',
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  )

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  return useMemo(() => {
    if (!data?.buoys) return null

    const purdue = data.buoys.find(b => b.data?.buoyId === '45198')
    const chii2 = data.buoys.find(b => b.data?.buoyId === 'CHII2')
    const preferred = purdue?.data ?? chii2?.data
    if (!preferred) return null

    const age = now - new Date(preferred.timestamp).getTime()
    if (age > STALENESS_THRESHOLD_MS) return null

    return { speed: preferred.windSpeed, direction: preferred.windDirection }
  }, [data, now])
}

export default function RaceHeader({ onOpenMenu, boat = null }: RaceHeaderProps) {
  const currentWind = useHeaderWind()

  return (
    <div
      data-testid="app-header"
      style={{
        // Held to the token rather than left to its content, so a screen below can fill exactly
        // what is left of the viewport (`--app-header-height` in globals.css).
        boxSizing: 'border-box',
        height: 'var(--app-header-height)',
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--surface-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--surface-raised)',
      }}
    >
      {/* Left: Hamburger + Logo + Title. Allowed to shrink, so a long boat name gives way
          to the WIND NOW readout rather than pushing it off a 390px screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            aria-label="Menu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              marginLeft: '-4px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        )}
        {boat?.iconUpdatedAt ? (
          // A plain `<img>` rather than `next/image`: the route is private and already
          // cache-keyed, and the optimiser would fetch it without the sailor's cookies.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={boatIconUrl(boat.iconUpdatedAt)}
            width={24}
            height={24}
            alt={boat.name}
            style={{ borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          // No icon yet keeps the layline mark — nothing is invented in its place.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/logo-icon.svg" width={24} height={24} alt="L" style={{ flexShrink: 0 }} />
        )}
        {boat ? (
          // Exactly as written, never lowercased to match the wordmark, and held to one line.
          <div
            data-testid="app-header-title"
            title={boat.name}
            style={{
              ...TITLE_STYLE,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {boat.name}
          </div>
        ) : (
          <div data-testid="app-header-title" style={TITLE_STYLE}>
            layline
          </div>
        )}
      </div>

      {/* Right: Wind info */}
      <div
        data-testid="app-header-wind"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '10px' }}
      >
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', fontWeight: 500 }}>
            WIND NOW
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', fontWeight: 500 }}>
            {currentWind ? `${currentWind.speed.toFixed(1)} kts` : '—'}
          </div>
        </div>
        {currentWind && (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--blue-muted)',
              border: '1px solid var(--blue-muted-40)',
            }}
          >
            <svg width="22" height="22" viewBox="-32 -32 64 64">
              <g transform={`rotate(${currentWind.direction})`}>
                <rect x="-2" y="-12" width="4" height="24" rx="1.2" fill="var(--blue-500)" opacity="0.2" />
                <polygon points="0,-28 6,-12 0,-18 -6,-12" fill="var(--blue-500)" />
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

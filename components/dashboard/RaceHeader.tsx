'use client'

import useSWR from 'swr'
import type { BuoyDataResult } from '@/types'

interface RaceHeaderProps {
  onOpenMenu?: () => void
}

const STALENESS_THRESHOLD_MS = 25 * 60 * 1000

const fetcher = (url: string) => fetch(url).then(res => res.json())

function useHeaderWind(): { speed: number; direction: number } | null {
  const { data } = useSWR<{ buoys: BuoyDataResult[] }>(
    '/api/weather/buoys',
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  )

  if (!data?.buoys) return null

  const purdue = data.buoys.find(b => b.data?.buoyId === '45198')
  const chii2 = data.buoys.find(b => b.data?.buoyId === 'CHII2')
  const preferred = purdue?.data ?? chii2?.data
  if (!preferred) return null

  const age = Date.now() - new Date(preferred.timestamp).getTime()
  if (age > STALENESS_THRESHOLD_MS) return null

  return { speed: preferred.windSpeed, direction: preferred.windDirection }
}

export default function RaceHeader({ onOpenMenu }: RaceHeaderProps) {
  const currentWind = useHeaderWind()

  return (
    <div
      style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--surface-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--surface-raised)',
      }}
    >
      {/* Left: Hamburger + Logo + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.svg" width={24} height={24} alt="L" />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          layline
        </div>
      </div>

      {/* Right: Wind info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

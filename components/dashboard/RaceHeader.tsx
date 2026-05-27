'use client'

import { useEffect, useState } from 'react'

interface RaceHeaderProps {
  raceTime: Date
  currentWind: {
    speed: number
    direction: number
  }
  onOpenMenu?: () => void
}

export default function RaceHeader({ raceTime, currentWind, onOpenMenu }: RaceHeaderProps) {
  const [timeUntil, setTimeUntil] = useState('')

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date()
      const diff = raceTime.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeUntil('Racing now')
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 0) {
        setTimeUntil(`${hours}h ${minutes}m until race`)
      } else {
        setTimeUntil(`${minutes}m until race`)
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [raceTime])

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
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            layline
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {timeUntil}
          </div>
        </div>
      </div>

      {/* Right: Wind info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', fontWeight: 500 }}>
            WIND NOW
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', fontWeight: 500 }}>
            {currentWind.speed.toFixed(1)} kts
          </div>
        </div>
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
          <svg width="16" height="16" viewBox="0 0 16 16">
            <g transform={`rotate(${currentWind.direction} 8 8)`}>
              <polygon points="8,3 10,10 8,9 6,10" fill="var(--blue-500)" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}

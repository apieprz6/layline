'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
      className="sticky top-0 z-50 px-4 py-3"
      style={{
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--surface-border)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div className="flex items-center justify-between">
        {/* Hamburger button */}
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            aria-label="Menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              marginRight: '12px',
              color: 'var(--text-primary)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <h1
              className="text-lg font-semibold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)'
              }}
            >
              Layline
            </h1>
          </Link>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {timeUntil}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="label" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
              Wind now
            </div>
            <div className="data-mono text-sm font-semibold">
              {currentWind.speed} kts
            </div>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--blue-muted)',
              border: '1px solid var(--blue-muted-40)'
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
    </div>
  )
}

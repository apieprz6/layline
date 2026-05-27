'use client'

import { useRef } from 'react'

interface TimeScrubberProps {
  value: number // Current offset in minutes (0 = now, 60 = 1h ago)
  max: number // Maximum offset in minutes
  scaleMinutes: number // Width of visible time window
  onChange: (value: number) => void
}

const TOTAL_HOURS = 72
const TOTAL_MINUTES = TOTAL_HOURS * 60

export default function TimeScrubber({
  value,
  max,
  scaleMinutes,
  onChange,
}: TimeScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Calculate handle position: value=0 (now) is at right (100%), value=TOTAL is at left (0%)
  const handlePct = ((TOTAL_MINUTES - value) / TOTAL_MINUTES) * 100

  // Calculate band position: shows visible time window
  const bandWidthPct = (scaleMinutes / TOTAL_MINUTES) * 100
  const bandLeftPct = Math.max(0, handlePct - bandWidthPct)

  // Generate tick marks every 12 hours
  const ticks = []
  for (let h = 0; h <= TOTAL_HOURS; h += 12) {
    const pct = (1 - (h * 60) / TOTAL_MINUTES) * 100
    ticks.push({ hours: h, pct })
  }

  // Convert clientX to value (minutes ago)
  const pickFromClientX = (clientX: number): number => {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    let newValue = Math.round((1 - pct) * TOTAL_MINUTES)
    newValue = Math.max(0, Math.min(max, newValue))
    return newValue
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    onChange(pickFromClientX(e.clientX))
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return
    onChange(pickFromClientX(e.clientX))
  }

  return (
    <div data-testid="time-scrubber">
      <div
        ref={trackRef}
        data-testid="time-scrubber-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        style={{
          position: 'relative',
          height: '44px',
          touchAction: 'none',
          userSelect: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Rail */}
        <div
          data-testid="scrubber-rail"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            height: '8px',
            background: 'var(--surface-card)',
            border: '1px solid var(--surface-border)',
            borderRadius: '999px',
            overflow: 'hidden',
          }}
        >
          {/* Colored band showing visible time window */}
          <div
            data-testid="scrubber-band"
            style={{
              position: 'absolute',
              left: `${bandLeftPct}%`,
              top: 0,
              bottom: 0,
              width: `${handlePct - bandLeftPct}%`,
              background: 'linear-gradient(90deg, rgba(0,68,204,0.10), rgba(0,68,204,0.35))',
              borderRadius: '999px',
            }}
          />
        </div>

        {/* Tick marks */}
        {ticks.map((tick) => (
          <div
            key={tick.hours}
            data-testid={`scrubber-tick-${tick.hours}`}
            style={{
              position: 'absolute',
              top: '4px',
              left: `${tick.pct}%`,
              width: '1px',
              height: '6px',
              background: 'rgba(0,0,0,0.18)',
            }}
          />
        ))}

        {/* Handle */}
        <div
          data-testid="scrubber-handle"
          style={{
            position: 'absolute',
            top: '50%',
            left: `${handlePct}%`,
            width: '22px',
            height: '32px',
            borderRadius: '5px',
            background: 'var(--surface-raised)',
            border: '1.5px solid var(--accent-primary)',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.20)',
            pointerEvents: 'none',
          }}
        >
          {/* Handle indicator line */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '2px',
              height: '14px',
              background: 'var(--accent-primary)',
              transform: 'translate(-50%, -50%)',
              borderRadius: '1px',
            }}
          />
        </div>
      </div>

      {/* Tick labels below the scrubber */}
      <div style={{ position: 'relative', height: '14px', marginTop: 0, userSelect: 'none' }}>
        {ticks.map((tick) => (
          <div
            key={`label-${tick.hours}`}
            style={{
              position: 'absolute',
              bottom: '4px',
              left: `${tick.pct}%`,
              transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            {tick.hours === 0 ? 'now' : `−${tick.hours}h`}
          </div>
        ))}
      </div>
    </div>
  )
}

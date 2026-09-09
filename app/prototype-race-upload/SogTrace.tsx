'use client'

/**
 * THROWAWAY — the recording's SOG trace, shared by every variant so the trap is
 * identical in all of them.
 *
 * The trap, from LAY-94 question 2: a Dropout draws as a *perfectly flat* line,
 * which reads as a boat sitting still rather than as a dead feed — and it is
 * exactly where a sailor would drag a window boundary to. So Frozen spans are
 * hatched, and the line is drawn broken across them rather than continuous.
 *
 * Conventions follow components/dashboard/SpeedLineChart.tsx: hand-rolled SVG at
 * a 360-wide viewBox, tokens from globals.css, no chart library.
 */

import { useCallback, useRef } from 'react'
import { FLAG_FROZEN, FLAG_NOT_WATER, msToInput, naiveMs, type Fixture } from './shared'

const WIDTH = 360
const PAD_L = 24
const PAD_R = 8
const PAD_T = 10

export interface TraceMarker {
  id: string
  at: string
  lane: 'sail' | 'sea'
  label: string
  selected?: boolean
  incomplete?: boolean
}

interface SogTraceProps {
  fixture: Fixture
  windowStart: string
  windowFinish: string
  height?: number
  /** Supplying this makes the window handles draggable. */
  onWindowChange?: (start: string, finish: string) => void
  markers?: TraceMarker[]
  onTapTime?: (at: string) => void
  onMarkerTap?: (id: string) => void
  laneHeight?: number
}

export default function SogTrace({
  fixture,
  windowStart,
  windowFinish,
  height = 132,
  onWindowChange,
  markers = [],
  onTapTime,
  onMarkerTap,
  laneHeight = 0,
}: SogTraceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'start' | 'finish' | null>(null)

  const t0 = naiveMs(fixture.t0)
  const tEnd = naiveMs(fixture.lastRowTime)
  // The scrubber must NOT be clamped to the file: 08-22-26-glr's real finish is
  // past its last row, so the axis carries 10% of slack at each end.
  const slack = Math.max((tEnd - t0) * 0.1, 10 * 60 * 1000)
  const axisMin = t0 - slack
  const axisMax = tEnd + slack

  const plotH = height - PAD_T - 18 - laneHeight
  const innerW = WIDTH - PAD_L - PAD_R
  const maxSog = Math.max(6, Math.ceil(fixture.series.reduce((m, p) => Math.max(m, p[1]), 0)))

  const x = useCallback(
    (ms: number) => PAD_L + ((ms - axisMin) / (axisMax - axisMin)) * innerW,
    [axisMin, axisMax, innerW],
  )
  const y = (sog: number) => PAD_T + plotH - (Math.max(0, sog) / maxSog) * plotH

  // Segment the line so it breaks across Frozen runs rather than drawing
  // straight through them.
  const segments: string[] = []
  const frozenSpans: { from: number; to: number }[] = []
  const notWaterSpans: { from: number; to: number }[] = []
  let current: string[] = []
  let frozenFrom: number | null = null
  let notWaterFrom: number | null = null

  for (const [sec, sog, , flags] of fixture.series) {
    const ms = t0 + sec * 1000
    const isFrozen = (flags & FLAG_FROZEN) !== 0
    const isNotWater = (flags & FLAG_NOT_WATER) !== 0

    if (isFrozen) {
      if (frozenFrom === null) frozenFrom = ms
      if (current.length > 1) segments.push(current.join(' '))
      current = []
    } else {
      if (frozenFrom !== null) {
        frozenSpans.push({ from: frozenFrom, to: ms })
        frozenFrom = null
      }
      if (sog >= 0) current.push(`${x(ms).toFixed(1)},${y(sog).toFixed(1)}`)
    }

    if (isNotWater) {
      if (notWaterFrom === null) notWaterFrom = ms
    } else if (notWaterFrom !== null) {
      notWaterSpans.push({ from: notWaterFrom, to: ms })
      notWaterFrom = null
    }
  }
  if (current.length > 1) segments.push(current.join(' '))
  if (frozenFrom !== null) frozenSpans.push({ from: frozenFrom, to: tEnd })
  if (notWaterFrom !== null) notWaterSpans.push({ from: notWaterFrom, to: tEnd })

  const startMs = naiveMs(windowStart)
  const finishMs = naiveMs(windowFinish)
  const hasWindow = isFinite(startMs) && isFinite(finishMs)

  const msFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return axisMin
    const ratio = (clientX - rect.left) / rect.width
    const px = ratio * WIDTH
    const clamped = Math.max(PAD_L, Math.min(WIDTH - PAD_R, px))
    return axisMin + ((clamped - PAD_L) / innerW) * (axisMax - axisMin)
  }

  const handlePointerDown = (which: 'start' | 'finish') => (e: React.PointerEvent) => {
    if (!onWindowChange) return
    e.stopPropagation()
    dragging.current = which
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !onWindowChange) return
    const ms = msFromClientX(e.clientX)
    if (dragging.current === 'start') {
      onWindowChange(msToInput(Math.min(ms, finishMs - 60_000)), windowFinish)
    } else {
      onWindowChange(windowStart, msToInput(Math.max(ms, startMs + 60_000)))
    }
  }

  const handlePointerUp = () => {
    dragging.current = null
  }

  const handleBackgroundTap = (e: React.PointerEvent) => {
    if (!onTapTime || dragging.current) return
    onTapTime(msToInput(msFromClientX(e.clientX)))
  }

  const laneY = (lane: 'sail' | 'sea') =>
    PAD_T + plotH + 12 + (lane === 'sail' ? 0 : laneHeight / 2)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      height={height}
      style={{ touchAction: 'none', display: 'block', cursor: onTapTime ? 'crosshair' : 'default' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={handleBackgroundTap}
    >
      <defs>
        <pattern id="frozenHatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="rgba(204,17,0,0.10)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--wind-storm)" strokeWidth="1.2" opacity="0.55" />
        </pattern>
      </defs>

      {/* outside the window, dimmed */}
      {hasWindow && (
        <>
          <rect x={PAD_L} y={PAD_T} width={Math.max(0, x(startMs) - PAD_L)} height={plotH} fill="rgba(0,0,0,0.055)" />
          <rect
            x={x(finishMs)}
            y={PAD_T}
            width={Math.max(0, WIDTH - PAD_R - x(finishMs))}
            height={plotH}
            fill="rgba(0,0,0,0.055)"
          />
        </>
      )}

      {/* GPS-derived wind: a different measurement, not a caveat on one */}
      {notWaterSpans.map((s, i) => (
        <rect
          key={`nw-${i}`}
          x={x(s.from)}
          y={PAD_T}
          width={Math.max(0.8, x(s.to) - x(s.from))}
          height={plotH}
          fill="rgba(0,68,204,0.10)"
        />
      ))}

      {/* y grid */}
      {[0, maxSog / 2, maxSog].map((v) => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={WIDTH - PAD_R} y2={y(v)} stroke="var(--chart-grid-coarse)" strokeWidth="1" />
          <text x={PAD_L - 4} y={y(v) + 3} textAnchor="end" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* the file's own extent, so slack past the last row is visible */}
      <line x1={x(t0)} y1={PAD_T + plotH} x2={x(tEnd)} y2={PAD_T + plotH} stroke="var(--text-muted)" strokeWidth="1.5" opacity="0.5" />

      {/* Dropouts. Drawn OVER the trace and hatched, because a flat line here is
          a dead feed and not a stationary boat. */}
      {frozenSpans.map((s, i) => (
        <rect
          key={`fz-${i}`}
          x={x(s.from)}
          y={PAD_T}
          width={Math.max(1.2, x(s.to) - x(s.from))}
          height={plotH}
          fill="url(#frozenHatch)"
        />
      ))}

      {segments.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="var(--blue-500)" strokeWidth="1.4" strokeLinejoin="round" />
      ))}

      {/* window handles */}
      {hasWindow && (
        <>
          {(['start', 'finish'] as const).map((which) => {
            const ms = which === 'start' ? startMs : finishMs
            return (
              <g key={which} onPointerDown={handlePointerDown(which)} style={{ cursor: onWindowChange ? 'ew-resize' : 'default' }}>
                <line x1={x(ms)} y1={PAD_T - 4} x2={x(ms)} y2={PAD_T + plotH + 4} stroke="var(--text-accent)" strokeWidth="1.6" />
                {onWindowChange && (
                  <rect x={x(ms) - 7} y={PAD_T - 9} width="14" height="13" rx="3" fill="var(--blue-500)" />
                )}
                {onWindowChange && (
                  <text x={x(ms)} y={PAD_T - 0.5} textAnchor="middle" fontSize="8" fill="#fff" fontFamily="var(--font-mono)">
                    {which === 'start' ? '⟩' : '⟨'}
                  </text>
                )}
                {/* fat invisible grab target for a thumb at 390px */}
                {onWindowChange && (
                  <rect x={x(ms) - 14} y={PAD_T - 12} width="28" height={plotH + 20} fill="transparent" />
                )}
              </g>
            )
          })}
        </>
      )}

      {/* annotation lanes */}
      {laneHeight > 0 &&
        markers.map((m) => {
          const ms = naiveMs(m.at)
          const my = laneY(m.lane)
          const color = m.incomplete
            ? 'var(--state-warning)'
            : m.lane === 'sail'
              ? 'var(--wind-medium)'
              : 'var(--wind-light)'
          return (
            <g
              key={m.id}
              onPointerDown={(e) => {
                e.stopPropagation()
                onMarkerTap?.(m.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              <line x1={x(ms)} y1={PAD_T} x2={x(ms)} y2={my} stroke={color} strokeWidth="0.8" opacity="0.4" strokeDasharray="2 2" />
              <circle cx={x(ms)} cy={my} r={m.selected ? 6 : 4.5} fill={color} stroke="var(--surface-raised)" strokeWidth="1.5" />
              <text x={x(ms)} y={my + 2.5} textAnchor="middle" fontSize="6" fill="#fff" fontFamily="var(--font-mono)" fontWeight="700">
                {m.lane === 'sail' ? 'S' : '~'}
              </text>
              <rect x={x(ms) - 16} y={my - 10} width="32" height="20" fill="transparent" />
            </g>
          )
        })}

      {/* x labels */}
      <text x={x(t0)} y={height - 5} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
        {fixture.firstRowTime.slice(11, 16)}
      </text>
      <text x={x(tEnd)} y={height - 5} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
        {fixture.lastRowTime.slice(11, 16)}
      </text>
      <text x={PAD_L} y={PAD_T + 6} fontSize="6.5" fontFamily="var(--font-mono)" fill="var(--text-muted)" opacity="0.7">
        SOG kt
      </text>
    </svg>
  )
}

export function TraceLegend() {
  const items = [
    { label: 'Speed over ground', swatch: <span style={{ display: 'inline-block', width: 12, height: 2, background: 'var(--blue-500)' }} /> },
    { label: 'Feed dropped — rows repeat the last fix', swatch: <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(204,17,0,0.35)', border: '1px solid var(--wind-storm)' }} /> },
    { label: 'Wind from GPS, not through the water', swatch: <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(0,68,204,0.18)' }} /> },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'var(--text-muted)' }}>
          {i.swatch}
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  )
}

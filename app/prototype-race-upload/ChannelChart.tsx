'use client'

/**
 * THROWAWAY — the time-axis chart, for any one channel.
 *
 * Generalised from what used to be SogTrace: same hand-rolled SVG at a 360-wide
 * viewBox, same tokens, no chart library (follows components/dashboard/SpeedLineChart.tsx).
 *
 * The trap, from LAY-94 question 2: a Dropout draws as a *perfectly flat* line,
 * which reads as a boat sitting still rather than as a dead feed — and it is
 * exactly where a sailor would drag a window boundary to. So Frozen spans are
 * hatched and the line is drawn broken across them rather than continuous. The
 * same applies to every channel, not just speed: a frozen TWA is a stuck needle.
 */

import { useCallback, useRef } from 'react'
import {
  CHANNELS,
  FLAG_FROZEN,
  FLAG_NOT_WATER,
  flagSpans,
  msToInput,
  naiveMs,
  timeAxis,
  type ChannelKey,
  type ChartMarker,
  type Fixture,
} from './shared'

const WIDTH = 360
const PAD_L = 26
const PAD_R = 8
const PAD_T = 12

interface ChannelChartProps {
  fixture: Fixture
  /** Variants B–D only ever show speed, so this defaults rather than being threaded. */
  channel?: ChannelKey
  windowStart: string
  windowFinish: string
  height?: number
  /** Supplying this makes the window handles draggable. */
  onWindowChange?: (start: string, finish: string) => void
  markers?: ChartMarker[]
  onTapTime?: (at: string) => void
  onMarkerTap?: (id: string) => void
  laneHeight?: number
  /** Where the shared crosshair sits, if anything is hovered or selected. */
  cursorAt?: string | null
}

export default function ChannelChart({
  fixture,
  channel = 'sog',
  windowStart,
  windowFinish,
  height = 132,
  onWindowChange,
  markers = [],
  onTapTime,
  onMarkerTap,
  laneHeight = 0,
  cursorAt,
}: ChannelChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'start' | 'finish' | null>(null)

  const axis = timeAxis(fixture)
  const meta = CHANNELS[channel]
  const values = fixture.series[channel]
  const { sec, flags } = fixture.series

  const plotH = height - PAD_T - 18 - laneHeight
  const innerW = WIDTH - PAD_L - PAD_R

  // Angles are scaled 0–180 whatever the data does, so switching channel does
  // not silently rescale the y-axis under the sailor. Speeds scale to the file.
  let vMin = 0
  let vMax = 180
  if (meta.kind === 'speed') {
    let hi = 0
    for (const v of values) if (v !== null && v > hi) hi = v
    vMax = Math.max(6, Math.ceil(hi))
  } else {
    // TWA and AWA are signed in qtVlm (port negative); SOG-derived angles are not.
    let signed = false
    for (const v of values) {
      if (v !== null && v < 0) {
        signed = true
        break
      }
    }
    vMin = signed ? -180 : 0
    vMax = 180
  }

  const x = useCallback(
    (ms: number) => PAD_L + ((ms - axis.min) / (axis.max - axis.min)) * innerW,
    [axis.min, axis.max, innerW],
  )
  const y = (v: number) => PAD_T + plotH - ((v - vMin) / (vMax - vMin)) * plotH

  // Segment the line so it breaks across Frozen runs and across nulls rather
  // than drawing straight through either.
  const segments: string[] = []
  let current: string[] = []
  for (let i = 0; i < sec.length; i += 1) {
    const v = values[i]
    const ms = axis.t0 + sec[i] * 1000
    const broken = v === null || (flags[i] & FLAG_FROZEN) !== 0
    if (broken) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
    } else {
      current.push(`${x(ms).toFixed(1)},${y(v).toFixed(1)}`)
    }
  }
  if (current.length > 1) segments.push(current.join(' '))

  const frozenSpans = flagSpans(fixture, FLAG_FROZEN)
  const notWaterSpans = channel === 'sog' ? [] : flagSpans(fixture, FLAG_NOT_WATER)

  const startMs = naiveMs(windowStart)
  const finishMs = naiveMs(windowFinish)
  const hasWindow = isFinite(startMs) && isFinite(finishMs)
  const cursorMs = cursorAt ? naiveMs(cursorAt) : NaN

  const msFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return axis.min
    const px = ((clientX - rect.left) / rect.width) * WIDTH
    const clamped = Math.max(PAD_L, Math.min(WIDTH - PAD_R, px))
    return axis.min + ((clamped - PAD_L) / innerW) * (axis.max - axis.min)
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

  const laneY = (lane: 'sail' | 'sea') => PAD_T + plotH + 12 + (lane === 'sail' ? 0 : laneHeight / 2)
  const ticks = meta.kind === 'angle' ? [vMin, 0, 90, vMax].filter((v, i, a) => a.indexOf(v) === i) : [0, vMax / 2, vMax]

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      height={height}
      // Fluid, like the map: the viewBox scales, so the pointer maths (which is
      // already expressed as a fraction of the bounding rect) keeps working.
      style={{ touchAction: 'none', display: 'block', width: '100%', height: 'auto', cursor: onTapTime ? 'crosshair' : 'default' }}
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

      {/* wind computed from GPS: a different measurement, not a caveat on one.
          Meaningless on SOG, so it is not drawn there. */}
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

      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={WIDTH - PAD_R} y2={y(v)} stroke="var(--chart-grid-coarse)" strokeWidth="1" />
          <text x={PAD_L - 4} y={y(v) + 3} textAnchor="end" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* the file's own extent, so the slack past the last row is visible */}
      <line x1={x(axis.t0)} y1={PAD_T + plotH} x2={x(axis.tEnd)} y2={PAD_T + plotH} stroke="var(--text-muted)" strokeWidth="1.5" opacity="0.5" />

      {/* Dropouts, drawn OVER the trace and hatched. */}
      {frozenSpans.map((s, i) => (
        <rect key={`fz-${i}`} x={x(s.from)} y={PAD_T} width={Math.max(1.2, x(s.to) - x(s.from))} height={plotH} fill="url(#frozenHatch)" />
      ))}

      {segments.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke="var(--blue-500)" strokeWidth="1.4" strokeLinejoin="round" />
      ))}

      {/* the shared crosshair — this is what makes the map and the chart one instrument */}
      {isFinite(cursorMs) && (
        <line x1={x(cursorMs)} y1={PAD_T} x2={x(cursorMs)} y2={PAD_T + plotH} stroke="var(--text-accent)" strokeWidth="0.9" strokeDasharray="3 2" opacity="0.8" />
      )}

      {hasWindow &&
        (['start', 'finish'] as const).map((which) => {
          const ms = which === 'start' ? startMs : finishMs
          return (
            <g key={which} onPointerDown={handlePointerDown(which)} style={{ cursor: onWindowChange ? 'ew-resize' : 'default' }}>
              <line x1={x(ms)} y1={PAD_T - 4} x2={x(ms)} y2={PAD_T + plotH + 4} stroke="var(--text-accent)" strokeWidth="1.6" />
              {onWindowChange && <rect x={x(ms) - 7} y={PAD_T - 10} width="14" height="13" rx="3" fill="var(--blue-500)" />}
              {onWindowChange && (
                <text x={x(ms)} y={PAD_T - 1.5} textAnchor="middle" fontSize="8" fill="#fff" fontFamily="var(--font-mono)">
                  {which === 'start' ? '⟩' : '⟨'}
                </text>
              )}
              {/* fat invisible grab target for a thumb at 390px */}
              {onWindowChange && <rect x={x(ms) - 14} y={PAD_T - 13} width="28" height={plotH + 20} fill="transparent" />}
            </g>
          )
        })}

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
                if (m.locked) return
                e.stopPropagation()
                onMarkerTap?.(m.id)
              }}
              style={{ cursor: m.locked ? 'default' : 'pointer', opacity: m.locked ? 0.5 : 1 }}
            >
              <line x1={x(ms)} y1={PAD_T} x2={x(ms)} y2={my} stroke={color} strokeWidth="0.8" opacity="0.4" strokeDasharray="2 2" />
              <circle cx={x(ms)} cy={my} r={m.selected ? 6 : 4.5} fill={color} stroke="var(--surface-raised)" strokeWidth="1.5" />
              <text x={x(ms)} y={my + 2.5} textAnchor="middle" fontSize="6" fill="#fff" fontFamily="var(--font-mono)" fontWeight="700">
                {m.lane === 'sail' ? 'S' : '~'}
              </text>
              {!m.locked && <rect x={x(ms) - 16} y={my - 10} width="32" height="20" fill="transparent" />}
            </g>
          )
        })}

      <text x={x(axis.t0)} y={height - 5} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
        {fixture.firstRowTime.slice(11, 16)}
      </text>
      <text x={x(axis.tEnd)} y={height - 5} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
        {fixture.lastRowTime.slice(11, 16)}
      </text>
      <text x={PAD_L} y={PAD_T + 7} fontSize="6.5" fontFamily="var(--font-mono)" fill="var(--text-muted)" opacity="0.75">
        {meta.label} {meta.unit}
      </text>
    </svg>
  )
}

export function TraceLegend({ channel }: { channel?: ChannelKey }) {
  const items = [
    {
      label: channel ? `${CHANNELS[channel].label}, as the file records it` : 'The channel, as the file records it',
      swatch: <span style={{ display: 'inline-block', width: 12, height: 2, background: 'var(--blue-500)' }} />,
    },
    {
      label: 'Feed dropped — rows repeat the last fix',
      swatch: <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(204,17,0,0.35)', border: '1px solid var(--wind-storm)' }} />,
    },
  ]
  if (channel && channel !== 'sog') {
    items.push({
      label: 'Wind from GPS, not through the water',
      swatch: <span style={{ display: 'inline-block', width: 12, height: 8, background: 'rgba(0,68,204,0.18)' }} />,
    })
  }
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

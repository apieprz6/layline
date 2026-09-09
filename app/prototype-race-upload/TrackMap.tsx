'use client'

/**
 * THROWAWAY — the GPS track, plotted in 2D, cropped by the same window as the
 * charts.
 *
 * Why a map earns the top slot: a window is a *place* before it is a pair of
 * times. On a beer can the course is a triangle repeated twice, and the moment
 * the boat stops sailing the course and motors home is obvious on a track and
 * nearly invisible on a speed trace. Scrubbing erases the track rather than
 * dimming a region, so the crop reads as "this is the race" and not as "this bit
 * is highlighted".
 *
 * Projection is a plain equirectangular one with a cos(lat) correction on
 * longitude, which is exact enough over the two nautical miles a Lake Michigan
 * beer can covers. It is a prototype, not a chart plotter.
 *
 * Dropouts matter differently here. On a chart a frozen feed draws a flat line;
 * on a map it draws *nothing at all* — the boat sits at one pixel — so a run
 * would be completely invisible. Frozen runs are therefore ringed, and the
 * track is drawn broken into and out of them.
 */

import { useCallback, useMemo, useRef } from 'react'
import {
  FLAG_FROZEN,
  msToInput,
  naiveMs,
  nearestIndex,
  timeAxis,
  type ChartMarker,
  type Fixture,
} from './shared'

const WIDTH = 360
const RAIL_H = 26
const PAD = 10

interface TrackMapProps {
  fixture: Fixture
  windowStart: string
  windowFinish: string
  height?: number
  /** Supplying this makes the rail handles draggable — the map's scrubber. */
  onWindowChange?: (start: string, finish: string) => void
  markers?: ChartMarker[]
  /** Tapping the track picks the nearest row's time, not an arbitrary instant. */
  onTapTime?: (at: string) => void
  onMarkerTap?: (id: string) => void
  cursorAt?: string | null
}

export default function TrackMap({
  fixture,
  windowStart,
  windowFinish,
  height = 210,
  onWindowChange,
  markers = [],
  onTapTime,
  onMarkerTap,
  cursorAt,
}: TrackMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'start' | 'finish' | null>(null)

  const axis = timeAxis(fixture)
  const mapH = height - RAIL_H
  const { sec, lat, lon, flags } = fixture.series

  const project = useMemo(() => {
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity
    for (let i = 0; i < lat.length; i += 1) {
      const la = lat[i]
      const lo = lon[i]
      if (la === null || lo === null) continue
      if (la < minLat) minLat = la
      if (la > maxLat) maxLat = la
      if (lo < minLon) minLon = lo
      if (lo > maxLon) maxLon = lo
    }
    if (!isFinite(minLat)) return null

    const midLat = (minLat + maxLat) / 2
    const kx = Math.cos((midLat * Math.PI) / 180)
    // Work in "corrected degrees" so one unit east equals one unit north on screen.
    const w = Math.max((maxLon - minLon) * kx, 1e-6)
    const h = Math.max(maxLat - minLat, 1e-6)
    const scale = Math.min((WIDTH - PAD * 2) / w, (mapH - PAD * 2) / h)
    const cx = (minLon + maxLon) / 2
    const cy = midLat
    return {
      x: (lo: number) => WIDTH / 2 + (lo - cx) * kx * scale,
      // screen y grows downward, latitude grows north
      y: (la: number) => mapH / 2 - (la - cy) * scale,
      /** Metres per screen unit, for the honest scale bar. */
      metresPerUnit: 111_320 / scale,
    }
  }, [lat, lon, mapH])

  const startMs = naiveMs(windowStart)
  const finishMs = naiveMs(windowFinish)
  const cursorMs = cursorAt ? naiveMs(cursorAt) : NaN

  // The track, split into in-window and out-of-window runs, broken across
  // Dropouts and nulls in both.
  const { inside, outside, frozenPoints } = useMemo(() => {
    const insideSegs: string[] = []
    const outsideSegs: string[] = []
    const froz: { cx: number; cy: number }[] = []
    if (!project) return { inside: insideSegs, outside: outsideSegs, frozenPoints: froz }

    let run: string[] = []
    let runInside: boolean | null = null
    const flush = () => {
      if (run.length > 1) (runInside ? insideSegs : outsideSegs).push(run.join(' '))
      run = []
    }

    for (let i = 0; i < sec.length; i += 1) {
      const la = lat[i]
      const lo = lon[i]
      const ms = axis.t0 + sec[i] * 1000
      const frozen = (flags[i] & FLAG_FROZEN) !== 0
      if (la === null || lo === null || frozen) {
        if (frozen && la !== null && lo !== null) froz.push({ cx: project.x(lo), cy: project.y(la) })
        flush()
        runInside = null
        continue
      }
      const isIn = ms >= startMs && ms <= finishMs
      if (runInside !== null && isIn !== runInside) {
        // carry the joining point into both runs so the track has no visual gap
        run.push(`${project.x(lo).toFixed(1)},${project.y(la).toFixed(1)}`)
        flush()
      }
      runInside = isIn
      run.push(`${project.x(lo).toFixed(1)},${project.y(la).toFixed(1)}`)
    }
    flush()
    return { inside: insideSegs, outside: outsideSegs, frozenPoints: froz }
  }, [project, sec, lat, lon, flags, axis.t0, startMs, finishMs])

  const pointAt = (ms: number): { cx: number; cy: number } | null => {
    if (!project) return null
    const i = nearestIndex(fixture, ms)
    if (i < 0) return null
    const la = lat[i]
    const lo = lon[i]
    if (la === null || lo === null) return null
    return { cx: project.x(lo), cy: project.y(la) }
  }

  // ---- the rail: the map's scrubber, identical in feel to the chart handles
  const railY = mapH + 6
  const innerW = WIDTH - PAD * 2
  const railX = useCallback(
    (ms: number) => PAD + ((ms - axis.min) / (axis.max - axis.min)) * innerW,
    [axis.min, axis.max, innerW],
  )
  const msFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return axis.min
    const px = ((clientX - rect.left) / rect.width) * WIDTH
    const clamped = Math.max(PAD, Math.min(WIDTH - PAD, px))
    return axis.min + ((clamped - PAD) / innerW) * (axis.max - axis.min)
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
    if (dragging.current === 'start') onWindowChange(msToInput(Math.min(ms, finishMs - 60_000)), windowFinish)
    else onWindowChange(windowStart, msToInput(Math.max(ms, startMs + 60_000)))
  }
  const handlePointerUp = () => {
    dragging.current = null
  }

  /** Tapping the track snaps to the nearest recorded row, so the time is a real one. */
  const handleTrackTap = (e: React.PointerEvent) => {
    if (!onTapTime || !project || dragging.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH
    const py = ((e.clientY - rect.top) / rect.height) * height
    if (py > mapH) return
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < sec.length; i += 1) {
      const la = lat[i]
      const lo = lon[i]
      if (la === null || lo === null) continue
      const ms = axis.t0 + sec[i] * 1000
      if (ms < startMs || ms > finishMs) continue
      const d = (project.x(lo) - px) ** 2 + (project.y(la) - py) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) onTapTime(msToInput(axis.t0 + sec[best] * 1000))
  }

  if (!project) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        This recording has no position fixes, so there is no track to draw.
      </div>
    )
  }

  const startPoint = pointAt(startMs)
  const finishPoint = pointAt(finishMs)
  const cursorPoint = isFinite(cursorMs) ? pointAt(cursorMs) : null
  const barMetres = niceDistance(project.metresPerUnit * 60)
  const barUnits = barMetres / project.metresPerUnit

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      height={height}
      // Fluid rather than pinned at 360px: the viewBox keeps the aspect ratio, so
      // the projection stays geographically true while the track gets the room a
      // desktop pane gives it. On a 390px phone this is a no-op.
      style={{ touchAction: 'none', display: 'block', width: '100%', height: 'auto', cursor: onTapTime ? 'crosshair' : 'default' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={handleTrackTap}
    >
      <rect x="0" y="0" width={WIDTH} height={mapH} fill="var(--surface-elevated)" rx="6" />

      {/* Cropped-away track: erased down to a ghost rather than merely dimmed, so
          the scrub reads as "the race is this part". */}
      {outside.map((pts, i) => (
        <polyline key={`o-${i}`} points={pts} fill="none" stroke="var(--text-muted)" strokeWidth="1" opacity="0.22" strokeDasharray="2 3" />
      ))}

      {inside.map((pts, i) => (
        <polyline key={`i-${i}`} points={pts} fill="none" stroke="var(--blue-500)" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* A frozen run is one pixel on a map — invisible unless it is ringed. */}
      {frozenPoints.map((p, i) => (
        <circle key={`f-${i}`} cx={p.cx} cy={p.cy} r="3.4" fill="none" stroke="var(--wind-storm)" strokeWidth="1" opacity="0.6" />
      ))}

      {startPoint && (
        <g>
          <circle cx={startPoint.cx} cy={startPoint.cy} r="4.6" fill="var(--wind-light)" stroke="var(--surface-raised)" strokeWidth="1.6" />
          <text x={startPoint.cx + 7} y={startPoint.cy + 3} fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--text-secondary)">
            start
          </text>
        </g>
      )}
      {finishPoint && (
        <g>
          <circle cx={finishPoint.cx} cy={finishPoint.cy} r="4.6" fill="var(--wind-storm)" stroke="var(--surface-raised)" strokeWidth="1.6" />
          <text x={finishPoint.cx + 7} y={finishPoint.cy + 3} fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--text-secondary)">
            finish
          </text>
        </g>
      )}

      {/* annotations, at the place on the water where they happened */}
      {markers.map((m) => {
        const p = pointAt(naiveMs(m.at))
        if (!p) return null
        const color = m.incomplete ? 'var(--state-warning)' : m.lane === 'sail' ? 'var(--wind-medium)' : 'var(--wind-light)'
        return (
          <g
            key={m.id}
            onPointerDown={(e) => {
              if (m.locked) return
              e.stopPropagation()
              onMarkerTap?.(m.id)
            }}
            style={{ cursor: m.locked ? 'default' : 'pointer', opacity: m.locked ? 0.45 : 1 }}
          >
            <circle
              cx={p.cx}
              cy={p.cy}
              r={m.selected ? 7 : 5.2}
              fill={color}
              stroke={m.selected ? 'var(--text-primary)' : 'var(--surface-raised)'}
              strokeWidth={m.selected ? 1.8 : 1.4}
            />
            <text x={p.cx} y={p.cy + 2.6} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="var(--font-mono)">
              {m.lane === 'sail' ? 'S' : '~'}
            </text>
            {m.label && (
              <text x={p.cx} y={p.cy - 8} textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-secondary)">
                {m.label}
              </text>
            )}
            {!m.locked && <circle cx={p.cx} cy={p.cy} r="13" fill="transparent" />}
          </g>
        )
      })}

      {cursorPoint && (
        <circle cx={cursorPoint.cx} cy={cursorPoint.cy} r="8" fill="none" stroke="var(--text-accent)" strokeWidth="1.2" strokeDasharray="3 2" />
      )}

      {/* scale bar: a track with no scale invites a guess about distance */}
      <g opacity="0.75">
        <line x1={WIDTH - PAD - barUnits} y1={mapH - 10} x2={WIDTH - PAD} y2={mapH - 10} stroke="var(--text-muted)" strokeWidth="1.4" />
        <text x={WIDTH - PAD} y={mapH - 14} textAnchor="end" fontSize="7" fontFamily="var(--font-mono)" fill="var(--text-muted)">
          {barMetres >= 1852 ? `${(barMetres / 1852).toFixed(1)} nm` : `${barMetres} m`}
        </text>
      </g>

      {/* the rail — the same handle design as the chart, bound to the same state */}
      <line x1={PAD} y1={railY + 7} x2={WIDTH - PAD} y2={railY + 7} stroke="var(--surface-border)" strokeWidth="3" strokeLinecap="round" />
      <line x1={railX(axis.t0)} y1={railY + 7} x2={railX(axis.tEnd)} y2={railY + 7} stroke="var(--text-muted)" strokeWidth="1" opacity="0.45" />
      <line
        x1={railX(startMs)}
        y1={railY + 7}
        x2={railX(finishMs)}
        y2={railY + 7}
        stroke="var(--blue-500)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {(['start', 'finish'] as const).map((which) => {
        const ms = which === 'start' ? startMs : finishMs
        return (
          <g key={which} onPointerDown={handlePointerDown(which)} style={{ cursor: onWindowChange ? 'ew-resize' : 'default' }}>
            {onWindowChange ? (
              <>
                <rect x={railX(ms) - 7} y={railY} width="14" height="14" rx="3" fill="var(--blue-500)" />
                <text x={railX(ms)} y={railY + 10} textAnchor="middle" fontSize="8" fill="#fff" fontFamily="var(--font-mono)">
                  {which === 'start' ? '⟩' : '⟨'}
                </text>
                <rect x={railX(ms) - 15} y={railY - 6} width="30" height="26" fill="transparent" />
              </>
            ) : (
              <circle cx={railX(ms)} cy={railY + 7} r="3.4" fill="var(--text-accent)" />
            )}
          </g>
        )
      })}
      {isFinite(cursorMs) && <line x1={railX(cursorMs)} y1={railY + 1} x2={railX(cursorMs)} y2={railY + 13} stroke="var(--text-accent)" strokeWidth="1" strokeDasharray="2 2" />}
    </svg>
  )
}

/** 1-2-5 rounding, so the scale bar reads as a real distance. */
function niceDistance(metres: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(metres, 1))))
  const n = metres / pow
  const step = n >= 5 ? 5 : n >= 2 ? 2 : 1
  return step * pow
}

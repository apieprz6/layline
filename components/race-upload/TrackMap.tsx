'use client'

/**
 * The GPS track, plotted in 2D, cropped by the same window as the channel chart.
 *
 * The map has the top slot because **a window is a place before it is a pair of times** (ADR 0014).
 * The boundary a sailor is actually looking for is the moment the boat stopped sailing the course and
 * motored home: on a track that moment is unmistakable, and on a speed trace it is nearly invisible.
 * Scrubbing therefore **erases** the cropped-away track to a ghost rather than dimming it, so the
 * crop reads as *this is the race* instead of *this bit is highlighted*.
 *
 * Dropouts matter differently here than on a chart. A dead feed draws a flat line on a chart; on a
 * map it draws **nothing at all** — the boat sits at one pixel — so half a recording can be a copy of
 * one fix and the track still looks clean. Frozen rows are therefore ringed and the track is drawn
 * broken into and out of them, which ADR 0014 makes an obligation of every map in Layline and not a
 * nicety of one screen.
 *
 * Projection is equirectangular with a cos(lat) correction on longitude — exact enough over the two
 * nautical miles a Lake Michigan beer can covers, and it carries a scale bar so nobody has to guess.
 * It is not a chart plotter.
 *
 * Every time here is absolute seconds in the recording's own naive frame. Nothing constructs a
 * `Date`: an offset would be a claim about a timezone the recording never made.
 */

import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react'
import type { RaceChartAxis } from '@/services/recordings/chart-series'
import {
  dragWindowBound,
  insideRaceWindow,
  type RaceWindowSeconds,
} from '@/services/recordings/race-window'
import type { RaceChartSeries } from '@/types'

import {
  AXIS_INNER_WIDTH,
  AXIS_INSET_LEFT,
  AXIS_INSET_RIGHT,
  CHART_WIDTH,
  markerColour,
  markerGlyph,
  type StackMarker,
} from './chart-geometry'

/** The viewBox is fixed and the element is fluid, so the projection stays geographically true. */
const WIDTH = CHART_WIDTH
const RAIL_HEIGHT = 26
/** The track's own margin inside its box, which is not the axis inset the rail is laid out on. */
const PAD = 10

interface TrackMapProps {
  series: RaceChartSeries
  /** The one axis both charts read, so a drag on either lands in the same place. */
  axis: RaceChartAxis
  window: RaceWindowSeconds
  height: number
  /** Supplying this makes the rail handles draggable — the map's half of the single scrubber. */
  onWindowChange?: (window: RaceWindowSeconds) => void
  /** A tap on the track, in seconds. The caller decides which bound it moves and snaps it. */
  onTapTrack?: (seconds: number) => void
  /**
   * The annotations placed so far, drawn where they happened on the water.
   *
   * On the map an annotation is a *place*, which is the point of drawing them here at all: "the kite
   * went up at the windward mark" is a thing a sailor can see on a track and cannot see on a clock.
   */
  markers?: readonly StackMarker[]
  /** A tap on an unlocked marker, by its key. Omitted where nothing on the map is editable. */
  onSelectMarker?: (key: string) => void
}

export default function TrackMap({
  series,
  axis,
  window,
  height,
  onWindowChange,
  onTapTrack,
  markers = [],
  onSelectMarker,
}: TrackMapProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'start' | 'finish' | null>(null)

  const mapHeight = height - RAIL_HEIGHT
  const { row_seconds, latitude, longitude, frozen } = series

  const project = useMemo(() => {
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity

    for (let at = 0; at < latitude.length; at += 1) {
      const lat = latitude[at]
      const lon = longitude[at]
      if (lat === null || lon === null) continue
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }

    if (!Number.isFinite(minLat)) return null

    const midLat = (minLat + maxLat) / 2
    // Work in "corrected degrees" so one unit east is one unit north on screen.
    const kx = Math.cos((midLat * Math.PI) / 180)
    const spanX = Math.max((maxLon - minLon) * kx, 1e-6)
    const spanY = Math.max(maxLat - minLat, 1e-6)
    const scale = Math.min((WIDTH - PAD * 2) / spanX, (mapHeight - PAD * 2) / spanY)
    const centreLon = (minLon + maxLon) / 2

    return {
      x: (lon: number) => WIDTH / 2 + (lon - centreLon) * kx * scale,
      // Screen y grows downward; latitude grows north.
      y: (lat: number) => mapHeight / 2 - (lat - midLat) * scale,
      /** Metres per screen unit, for a scale bar that states a real distance. */
      metresPerUnit: 111_320 / scale,
    }
  }, [latitude, longitude, mapHeight])

  /**
   * The track as runs of points: inside the window, outside it, and broken across both Dropouts and
   * missing fixes. A frozen run is collected separately as points to ring, and a fix a break leaves
   * on its own as a point to plot — a run of one cannot be a polyline, and a boat that surfaced for
   * one fix between two dropouts was somewhere.
   */
  const { inside, outside, frozenPoints, dots } = useMemo(() => {
    const insideRuns: string[] = []
    const outsideRuns: string[] = []
    const rings: { cx: number; cy: number }[] = []
    const isolated: { cx: number; cy: number; inside: boolean }[] = []

    if (!project) {
      return { inside: insideRuns, outside: outsideRuns, frozenPoints: rings, dots: isolated }
    }

    let run: { cx: number; cy: number }[] = []
    let runInside: boolean | null = null

    const flush = (): void => {
      if (run.length > 1) {
        ;(runInside ? insideRuns : outsideRuns).push(
          run.map((point) => `${point.cx.toFixed(1)},${point.cy.toFixed(1)}`).join(' ')
        )
      } else if (run.length === 1) {
        isolated.push({ ...run[0], inside: runInside === true })
      }
      run = []
    }

    for (let at = 0; at < row_seconds.length; at += 1) {
      const lat = latitude[at]
      const lon = longitude[at]

      if (lat === null || lon === null || frozen[at]) {
        // A frozen row still has a position — it is the previous row's, verbatim — and ringing it is
        // the only way the run is visible at all.
        if (frozen[at] && lat !== null && lon !== null) {
          rings.push({ cx: project.x(lon), cy: project.y(lat) })
        }
        flush()
        runInside = null
        continue
      }

      const isInside = insideRaceWindow(row_seconds[at], window)
      const point = { cx: project.x(lon), cy: project.y(lat) }

      if (runInside !== null && isInside !== runInside) {
        // The joining point belongs to both runs, so the crop has no visual gap at its edge.
        run.push(point)
        flush()
      }

      runInside = isInside
      run.push(point)
    }

    flush()
    return { inside: insideRuns, outside: outsideRuns, frozenPoints: rings, dots: isolated }
  }, [project, row_seconds, latitude, longitude, frozen, window])

  const railY = mapHeight + 6

  // Laid out on the axis insets rather than the map's own padding, so the rail handle for a second
  // sits directly above the channel chart's handle for that same second.
  const railX = useCallback(
    (seconds: number) =>
      AXIS_INSET_LEFT + ((seconds - axis.min) / (axis.max - axis.min)) * AXIS_INNER_WIDTH,
    [axis.min, axis.max]
  )

  const secondsFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return axis.min
    const px = ((clientX - rect.left) / rect.width) * WIDTH
    const clamped = Math.max(AXIS_INSET_LEFT, Math.min(WIDTH - AXIS_INSET_RIGHT, px))
    return Math.round(
      axis.min + ((clamped - AXIS_INSET_LEFT) / AXIS_INNER_WIDTH) * (axis.max - axis.min)
    )
  }

  const onHandleDown = (which: 'start' | 'finish') => (event: ReactPointerEvent) => {
    if (!onWindowChange) return
    event.stopPropagation()
    dragging.current = which
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent): void => {
    if (!dragging.current || !onWindowChange) return

    // The minimum `dragWindowBound` keeps is an ergonomic and not a gate: it stops one thumb dragging
    // a bound past the other and inverting the window mid-gesture. Nothing clamps to the last row,
    // because a window reaching past it is legal — that is what the slack in the axis is for.
    onWindowChange(dragWindowBound(window, dragging.current, secondsFromClientX(event.clientX)))
  }

  const endDrag = (): void => {
    dragging.current = null
  }

  /**
   * A tap on the track picks the nearest row *geographically*, which is the whole reason the map is
   * tappable: the sailor points at the place they rounded the last mark, not at a moment on an axis.
   * Every row with a fix is a candidate, including ones outside the window — otherwise the window
   * could only ever be narrowed.
   */
  const onTrackDown = (event: ReactPointerEvent): void => {
    if (!onTapTrack || !project || dragging.current) return

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const px = ((event.clientX - rect.left) / rect.width) * WIDTH
    const py = ((event.clientY - rect.top) / rect.height) * height
    if (py > mapHeight) return

    let best = -1
    let bestDistance = Infinity

    for (let at = 0; at < row_seconds.length; at += 1) {
      const lat = latitude[at]
      const lon = longitude[at]
      if (lat === null || lon === null) continue
      const distance = (project.x(lon) - px) ** 2 + (project.y(lat) - py) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = at
      }
    }

    if (best >= 0) onTapTrack(row_seconds[best])
  }

  if (!project) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        This recording has no position fixes anywhere, so there is no track to draw. The window can
        still be set from the channel chart below.
      </div>
    )
  }

  const startPoint = pointAt(window.start)
  const finishPoint = pointAt(window.finish)
  const barMetres = niceDistance(project.metresPerUnit * 60)
  const barUnits = barMetres / project.metresPerUnit

  /** Where a time sits on the water: the nearest row that has a fix. */
  function pointAt(seconds: number): { cx: number; cy: number } | null {
    if (!project) return null

    let best = -1
    for (let at = 0; at < row_seconds.length; at += 1) {
      if (latitude[at] === null || longitude[at] === null) continue
      if (
        best === -1 ||
        Math.abs(row_seconds[at] - seconds) < Math.abs(row_seconds[best] - seconds)
      ) {
        best = at
      }
    }

    if (best === -1) return null
    const lat = latitude[best]
    const lon = longitude[best]
    if (lat === null || lon === null) return null
    return { cx: project.x(lon), cy: project.y(lat) }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label="The recording’s GPS track, with the chosen window drawn solid and the rest erased to a ghost."
      // Fluid rather than pinned at 360: the viewBox holds the aspect ratio, so the projection stays
      // true while the track gets whatever room the pane has. On a 390px phone this is a no-op.
      style={{
        touchAction: 'none',
        display: 'block',
        width: '100%',
        height: 'auto',
        cursor: onTapTrack ? 'crosshair' : 'default',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={onTrackDown}
    >
      <rect x="0" y="0" width={WIDTH} height={mapHeight} fill="var(--surface-elevated)" rx="6" />

      {/* Cropped away: erased to a ghost rather than dimmed. */}
      {outside.map((points, index) => (
        <polyline
          key={`out-${index}`}
          points={points}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="1"
          opacity="0.22"
          strokeDasharray="2 3"
        />
      ))}

      {inside.map((points, index) => (
        <polyline
          key={`in-${index}`}
          points={points}
          fill="none"
          stroke="var(--blue-500)"
          strokeWidth="1.9"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* A fix with no neighbour to join, drawn the same weight as the run it would have been part
          of. Its own colour, so the crop still reads across it. */}
      {dots.map((dot, index) => (
        <circle
          key={`dot-${index}`}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.inside ? 1.6 : 1.1}
          fill={dot.inside ? 'var(--blue-500)' : 'var(--text-muted)'}
          opacity={dot.inside ? 1 : 0.3}
        />
      ))}

      {frozenPoints.map((point, index) => (
        <circle
          key={`frozen-${index}`}
          cx={point.cx}
          cy={point.cy}
          r="3.4"
          fill="none"
          stroke="var(--wind-storm)"
          strokeWidth="1"
          opacity="0.6"
        />
      ))}

      {startPoint && (
        <g>
          <circle
            cx={startPoint.cx}
            cy={startPoint.cy}
            r="4.6"
            fill="var(--wind-light)"
            stroke="var(--surface-raised)"
            strokeWidth="1.6"
          />
          <text
            x={startPoint.cx + 7}
            y={startPoint.cy + 3}
            fontSize="7.5"
            fontFamily="var(--font-mono)"
            fill="var(--text-secondary)"
          >
            start
          </text>
        </g>
      )}

      {finishPoint && (
        <g>
          <circle
            cx={finishPoint.cx}
            cy={finishPoint.cy}
            r="4.6"
            fill="var(--wind-storm)"
            stroke="var(--surface-raised)"
            strokeWidth="1.6"
          />
          <text
            x={finishPoint.cx + 7}
            y={finishPoint.cy + 3}
            fontSize="7.5"
            fontFamily="var(--font-mono)"
            fill="var(--text-secondary)"
          >
            finish
          </text>
        </g>
      )}

      {/* The sailor's own annotations, at the place on the water they were placed. A locked one is
          drawn and dimmed and given no hit target, which is ADR 0014's rule verbatim: an earlier
          step's answer stays visible and stops being editable. */}
      {markers.map((marker) => {
        const point = pointAt(marker.at)
        if (!point) return null

        const colour = markerColour(marker)

        return (
          <g
            key={marker.key}
            // So a test can assert what ADR 0014 asks of a locked marker — still drawn, dimmed —
            // which is a claim about an SVG group that carries no text of its own.
            data-testid={`marker-${marker.key}`}
            onPointerDown={(event) => {
              if (marker.locked || !onSelectMarker) return
              // Otherwise the tap reaches the track underneath and places a second annotation on top
              // of the one being reached for.
              event.stopPropagation()
              onSelectMarker(marker.key)
            }}
            style={{
              cursor: marker.locked || !onSelectMarker ? 'default' : 'pointer',
              opacity: marker.locked ? 0.45 : 1,
            }}
          >
            <circle
              cx={point.cx}
              cy={point.cy}
              r={marker.selected ? 7 : 5.2}
              fill={colour}
              stroke={marker.selected ? 'var(--text-primary)' : 'var(--surface-raised)'}
              strokeWidth={marker.selected ? 1.8 : 1.4}
            />
            <text
              x={point.cx}
              y={point.cy + 2.6}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              fontFamily="var(--font-mono)"
              fill="var(--text-inverse)"
            >
              {markerGlyph(marker.lane)}
            </text>
            <text
              x={point.cx}
              y={point.cy - 8}
              textAnchor="middle"
              fontSize="7"
              fontFamily="var(--font-mono)"
              fill="var(--text-secondary)"
            >
              {marker.label}
            </text>
            {/* A thumb at 390px, and only where there is something to hit. */}
            {!marker.locked && onSelectMarker && (
              <circle cx={point.cx} cy={point.cy} r="13" fill="transparent" />
            )}
          </g>
        )
      })}

      {/* A track with no scale invites a guess about distance. */}
      <g opacity="0.75">
        <line
          x1={WIDTH - PAD - barUnits}
          y1={mapHeight - 10}
          x2={WIDTH - PAD}
          y2={mapHeight - 10}
          stroke="var(--text-muted)"
          strokeWidth="1.4"
        />
        <text
          x={WIDTH - PAD}
          y={mapHeight - 14}
          textAnchor="end"
          fontSize="7"
          fontFamily="var(--font-mono)"
          fill="var(--text-muted)"
        >
          {barMetres >= 1852 ? `${(barMetres / 1852).toFixed(1)} nm` : `${barMetres} m`}
        </text>
      </g>

      {/* The rail: the same handle design as the chart, bound to the same state. */}
      <line
        x1={AXIS_INSET_LEFT}
        y1={railY + 7}
        x2={WIDTH - AXIS_INSET_RIGHT}
        y2={railY + 7}
        stroke="var(--surface-border)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* The file's own extent, so the slack a window may reach into is visible. */}
      <line
        x1={railX(axis.first)}
        y1={railY + 7}
        x2={railX(axis.last)}
        y2={railY + 7}
        stroke="var(--text-muted)"
        strokeWidth="1"
        opacity="0.45"
      />
      <line
        x1={railX(window.start)}
        y1={railY + 7}
        x2={railX(window.finish)}
        y2={railY + 7}
        stroke="var(--blue-500)"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {(['start', 'finish'] as const).map((which) => {
        const seconds = which === 'start' ? window.start : window.finish
        return (
          <g
            key={which}
            onPointerDown={onHandleDown(which)}
            style={{ cursor: onWindowChange ? 'ew-resize' : 'default' }}
          >
            {onWindowChange ? (
              <>
                <rect x={railX(seconds) - 7} y={railY} width="14" height="14" rx="3" fill="var(--blue-500)" />
                <text
                  x={railX(seconds)}
                  y={railY + 10}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#fff"
                  fontFamily="var(--font-mono)"
                >
                  {which === 'start' ? '⟩' : '⟨'}
                </text>
                {/* A thumb at 390px needs more than 14 units to land on. */}
                <rect x={railX(seconds) - 15} y={railY - 6} width="30" height="26" fill="transparent" />
              </>
            ) : (
              <circle cx={railX(seconds)} cy={railY + 7} r="3.4" fill="var(--text-accent)" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 1-2-5 rounding, so the scale bar reads as a distance somebody would state. */
function niceDistance(metres: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(metres, 1))))
  const leading = metres / power
  const step = leading >= 5 ? 5 : leading >= 2 ? 2 : 1
  return step * power
}

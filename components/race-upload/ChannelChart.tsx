'use client'

/**
 * One channel of the recording against the same time axis as the track above it.
 *
 * **One** channel, swapped by the pill row, rather than four stacked traces. Four traces at the
 * bottom of a 390px screen are four 30px strips, and none of them is a chart; one that fills the
 * pane is (ADR 0014).
 *
 * Two scales, and which one a channel gets is a property of the channel and not of the rows on
 * screen. An angle is drawn on a fixed 0–180, or −180–180 where the file writes a negative anywhere,
 * so switching from TWA to AWA never rescales the axis under the sailor and 40° is the same height
 * on both. A speed scales to the file, with a floor, because 6 knots and 26 knots are not the same
 * afternoon and a shared speed axis would flatten the light one.
 *
 * Row Quality is drawn, not summarised. A dead feed's verbatim copies make a *plausible* trace — a
 * flat line at the last real reading — so the trace is broken through Frozen rows and the stretch is
 * hatched over the top; and where a recording has no `STW`/`CTW`, its wind figures were computed
 * from GPS, which is a different quantity from its neighbours and is washed blue. Never on SOG,
 * which comes from the GPS either way and is unaffected.
 */

import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { RaceChartAxis } from '@/services/recordings/chart-series'
import { raceChannel, raceChartSpans } from '@/services/recordings/chart-series'
import { dragWindowBound, type RaceWindowSeconds } from '@/services/recordings/race-window'
import { wallClockTime } from '@/services/recordings/wall-clock'
import type { RaceChannelKey, RaceChartSeries } from '@/types'

import {
  AXIS_INNER_WIDTH,
  AXIS_INSET_LEFT,
  AXIS_INSET_RIGHT,
  CHART_WIDTH,
  MARKER_LANE_HEIGHT,
  markerColour,
  markerGlyph,
  type StackMarker,
} from './chart-geometry'

// The time axis is shared with the map above, handle for handle, so its insets are not this
// component's to choose.
const WIDTH = CHART_WIDTH
const PAD_LEFT = AXIS_INSET_LEFT
const PAD_RIGHT = AXIS_INSET_RIGHT
const PAD_TOP = 12
/** Room under the plot for the two row-time labels. */
const PAD_BOTTOM = 18

interface ChannelChartProps {
  series: RaceChartSeries
  channel: RaceChannelKey
  axis: RaceChartAxis
  window: RaceWindowSeconds
  height: number
  /** Supplying this makes the window handles draggable — the chart's half of the single scrubber. */
  onWindowChange?: (window: RaceWindowSeconds) => void
  /** A tap on the plot, in seconds. The caller decides which bound it moves and snaps it. */
  onTapTime?: (seconds: number) => void
  /** The annotations placed so far, drawn in a lane under the plot against the same time axis. */
  markers?: readonly StackMarker[]
  /** A tap on an unlocked marker, by its key. Omitted where nothing on the chart is editable. */
  onSelectMarker?: (key: string) => void
}

export default function ChannelChart({
  series,
  channel,
  axis,
  window,
  height,
  onWindowChange,
  onTapTime,
  markers = [],
  onSelectMarker,
}: ChannelChartProps): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<'start' | 'finish' | null>(null)

  const meta = raceChannel(channel)
  const values = series.channels[channel]
  const isAngle = meta.kind === 'angle'
  const signed = series.signed[channel]

  const plotHeight = height - PAD_TOP - PAD_BOTTOM
  const innerWidth = AXIS_INNER_WIDTH

  // The lane is added *under* the chart rather than taken out of it: an annotation appearing must not
  // rescale the trace it was placed against.
  const laneHeight = markers.length > 0 ? MARKER_LANE_HEIGHT : 0
  const totalHeight = height + laneHeight
  const laneY = (lane: 'sail' | 'sea'): number =>
    PAD_TOP + plotHeight + 11 + (lane === 'sail' ? 0 : laneHeight / 2)

  /**
   * The value scale. Angles are fixed by the channel; speeds are read from the file — over every
   * row, not the window's, for the same reason the signedness is.
   */
  const { valueMin, valueMax } = useMemo(() => {
    if (isAngle) return { valueMin: signed ? -180 : 0, valueMax: 180 }

    let high = 0
    for (const value of values) {
      if (value !== null && value > high) high = value
    }
    // A floor of 6 knots so a drifter is not drawn as a hurricane on a 0.8-knot axis.
    return { valueMin: 0, valueMax: Math.max(6, Math.ceil(high)) }
  }, [isAngle, signed, values])

  const x = useCallback(
    (seconds: number) => PAD_LEFT + ((seconds - axis.min) / (axis.max - axis.min)) * innerWidth,
    [axis.min, axis.max, innerWidth]
  )

  const y = useCallback(
    (value: number) => PAD_TOP + plotHeight - ((value - valueMin) / (valueMax - valueMin)) * plotHeight,
    [plotHeight, valueMin, valueMax]
  )

  /**
   * The trace, in runs — broken at a missing value and broken through every Frozen row — plus the
   * readings a break leaves on their own.
   *
   * A run of one point cannot be a polyline, and dropping it would draw a value the boat did record
   * as nothing at all. On a feed that alternates reading, copy, reading, copy, that is the whole
   * channel erased from a chart that then looks empty rather than intermittent. Those readings are
   * drawn as dots, which is what one measurement between two absences is.
   */
  const { runs, dots } = useMemo(() => {
    const collected: string[] = []
    const isolated: { cx: number; cy: number }[] = []
    let run: { cx: number; cy: number }[] = []

    const flush = (): void => {
      if (run.length > 1) {
        collected.push(
          run.map((point) => `${point.cx.toFixed(1)},${point.cy.toFixed(1)}`).join(' ')
        )
      } else if (run.length === 1) {
        isolated.push(run[0])
      }
      run = []
    }

    for (let at = 0; at < series.row_seconds.length; at += 1) {
      const value = values[at]
      // A copy of the row before is not a reading. Drawing through it would be drawing a
      // measurement nobody took (ADR 0009).
      if (value === null || series.frozen[at]) {
        flush()
        continue
      }
      run.push({ cx: x(series.row_seconds[at]), cy: y(value) })
    }

    flush()
    return { runs: collected, dots: isolated }
  }, [series.row_seconds, series.frozen, values, x, y])

  const frozenSpans = useMemo(
    () => raceChartSpans(series.row_seconds, series.frozen),
    [series.row_seconds, series.frozen]
  )

  const gpsWindSpans = useMemo(
    // SOG is from the GPS whatever the water-referenced instruments did, so washing it would mark a
    // number that is not affected.
    () => (channel === 'sog' ? [] : raceChartSpans(series.row_seconds, series.not_water_referenced)),
    [channel, series.row_seconds, series.not_water_referenced]
  )

  // Deduplicated because an unsigned angle's minimum *is* its zero, and drawing that gridline twice
  // would put a second, heavier line across the chart at 0.
  const ticks = Array.from(
    new Set(isAngle ? [valueMin, 0, 90, valueMax] : [0, valueMax / 2, valueMax])
  )

  const secondsFromClientX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return axis.min
    const px = ((clientX - rect.left) / rect.width) * WIDTH
    const clamped = Math.max(PAD_LEFT, Math.min(WIDTH - PAD_RIGHT, px))
    return Math.round(axis.min + ((clamped - PAD_LEFT) / innerWidth) * (axis.max - axis.min))
  }

  const onHandleDown = (which: 'start' | 'finish') => (event: ReactPointerEvent) => {
    if (!onWindowChange) return
    event.stopPropagation()
    dragging.current = which
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent): void => {
    if (!dragging.current || !onWindowChange) return
    // Free, into the axis slack, and never snapped to a row: a finish past the last row is legal,
    // and snapping would make it unreachable. The tap and the nudges are what land on a row exactly.
    onWindowChange(dragWindowBound(window, dragging.current, secondsFromClientX(event.clientX)))
  }

  const endDrag = (): void => {
    dragging.current = null
  }

  const onPlotDown = (event: ReactPointerEvent): void => {
    if (!onTapTime || dragging.current) return
    onTapTime(secondsFromClientX(event.clientX))
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${totalHeight}`}
      role="img"
      aria-label={`${meta.label} in ${meta.unit}, with the chosen window between the two handles.`}
      style={{
        touchAction: 'none',
        display: 'block',
        width: '100%',
        height: 'auto',
        cursor: onTapTime ? 'crosshair' : 'default',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={onPlotDown}
    >
      <defs>
        <pattern
          id="raceFrozenHatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="5" height="5" fill="rgba(204,17,0,0.10)" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="5"
            stroke="var(--wind-storm)"
            strokeWidth="1.2"
            opacity="0.55"
          />
        </pattern>
      </defs>

      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={PAD_LEFT}
            y1={y(value)}
            x2={WIDTH - PAD_RIGHT}
            y2={y(value)}
            stroke="var(--chart-grid-coarse)"
            strokeWidth="1"
          />
          <text
            x={PAD_LEFT - 4}
            y={y(value) + 2.5}
            textAnchor="end"
            fontSize="7"
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}

      {/* Cropped away: shaded out, the chart's answer to the map's ghost track. */}
      <rect
        x={PAD_LEFT}
        y={PAD_TOP}
        width={Math.max(0, x(window.start) - PAD_LEFT)}
        height={plotHeight}
        fill="rgba(0,0,0,0.055)"
      />
      <rect
        x={x(window.finish)}
        y={PAD_TOP}
        width={Math.max(0, WIDTH - PAD_RIGHT - x(window.finish))}
        height={plotHeight}
        fill="rgba(0,0,0,0.055)"
      />

      {gpsWindSpans.map((span, index) => (
        <rect
          key={`gps-${index}`}
          x={x(span.from)}
          y={PAD_TOP}
          width={Math.max(0.6, x(span.to) - x(span.from))}
          height={plotHeight}
          fill="rgba(0,68,204,0.10)"
        />
      ))}

      {runs.map((points, index) => (
        <polyline
          key={`run-${index}`}
          points={points}
          fill="none"
          stroke="var(--blue-500)"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* A reading with no neighbour to join. Drawn, because it happened. */}
      {dots.map((dot, index) => (
        <circle key={`dot-${index}`} cx={dot.cx} cy={dot.cy} r="1.5" fill="var(--blue-500)" />
      ))}

      {/* Over the trace on purpose: the hatch is a claim about the line, so it has to be on top. */}
      {frozenSpans.map((span, index) => (
        <rect
          key={`frozen-${index}`}
          x={x(span.from)}
          y={PAD_TOP}
          width={Math.max(0.8, x(span.to) - x(span.from))}
          height={plotHeight}
          fill="url(#raceFrozenHatch)"
        />
      ))}

      {/* The file's own extent, so the slack the axis carries is visible rather than implied. */}
      <line
        x1={x(axis.first)}
        y1={PAD_TOP + plotHeight}
        x2={x(axis.last)}
        y2={PAD_TOP + plotHeight}
        stroke="var(--text-muted)"
        strokeWidth="1"
        opacity="0.5"
      />

      <text
        x={PAD_LEFT + 2}
        y={PAD_TOP + 7}
        fontSize="8"
        fontFamily="var(--font-mono)"
        fill="var(--text-secondary)"
      >
        {meta.label} {meta.unit}
      </text>

      {(['start', 'finish'] as const).map((which) => {
        const seconds = which === 'start' ? window.start : window.finish
        return (
          <g
            key={which}
            onPointerDown={onHandleDown(which)}
            style={{ cursor: onWindowChange ? 'ew-resize' : 'default' }}
          >
            <line
              x1={x(seconds)}
              y1={PAD_TOP}
              x2={x(seconds)}
              y2={PAD_TOP + plotHeight}
              stroke="var(--text-accent)"
              strokeWidth="1.6"
            />
            {onWindowChange && (
              <>
                <rect
                  x={x(seconds) - 7}
                  y={PAD_TOP + plotHeight}
                  width="14"
                  height="13"
                  rx="3"
                  fill="var(--blue-500)"
                />
                <rect
                  x={x(seconds) - 14}
                  y={PAD_TOP + plotHeight - 6}
                  width="28"
                  height="25"
                  fill="transparent"
                />
              </>
            )}
          </g>
        )
      })}

      {/* The same annotations as the map's, against time instead of against the water. A locked one
          keeps its place and loses its hit target (ADR 0014). */}
      {markers.map((marker) => {
        const colour = markerColour(marker)
        const centre = laneY(marker.lane)
        // An entry's time is unbounded: the sails were set before the start, and the by-time path and
        // the nudges will both carry one past the axis, which is drawn from the rows plus ten minutes.
        // Held at the edge rather than plotted off the viewBox, because an annotation placed on an
        // earlier step **stays drawn** (ADR 0014) and a marker at a negative x is a marker gone. The
        // pin says the entry is out that way and its time is on the label; it is not a claim that the
        // entry happened here, which is why it is drawn as a pin and not as a marker on the axis.
        const unclamped = x(marker.at)
        const at = Math.max(PAD_LEFT, Math.min(WIDTH - PAD_RIGHT, unclamped))
        const offAxis = Math.abs(unclamped - at) > 0.5

        return (
          <g
            key={marker.key}
            onPointerDown={(event) => {
              if (marker.locked || !onSelectMarker) return
              // Or the tap falls through to the plot and places another annotation on top of this one.
              event.stopPropagation()
              onSelectMarker(marker.key)
            }}
            style={{
              cursor: marker.locked || !onSelectMarker ? 'default' : 'pointer',
              opacity: marker.locked ? 0.5 : 1,
            }}
          >
            {/* Up to the trace, so the marker reads as a moment in the race and not as a row of
                buttons under a chart. Not drawn for one held at the edge: there is no moment of this
                chart to point at. */}
            {!offAxis && (
              <line
                x1={at}
                y1={PAD_TOP}
                x2={at}
                y2={centre}
                stroke={colour}
                strokeWidth="0.8"
                strokeDasharray="2 2"
                opacity="0.4"
              />
            )}
            <circle
              cx={at}
              cy={centre}
              r={marker.selected ? 6 : 4.5}
              fill={colour}
              stroke={marker.selected ? 'var(--text-primary)' : 'var(--surface-raised)'}
              strokeWidth="1.5"
              strokeDasharray={offAxis ? '1.5 1.5' : undefined}
            />
            <text
              x={at}
              y={centre + 2.5}
              textAnchor="middle"
              fontSize="6"
              fontWeight="700"
              fontFamily="var(--font-mono)"
              fill="var(--text-inverse)"
            >
              {markerGlyph(marker.lane)}
            </text>
            {/* Which way it is off the chart, so the pin cannot be read as a time on the axis. */}
            {offAxis && (
              <text
                x={unclamped < at ? at - 7 : at + 7}
                y={centre + 2.5}
                textAnchor="middle"
                fontSize="7"
                fontFamily="var(--font-mono)"
                fill={colour}
              >
                {unclamped < at ? '‹' : '›'}
              </text>
            )}
            {!marker.locked && onSelectMarker && (
              <rect x={at - 16} y={centre - 10} width="32" height="20" fill="transparent" />
            )}
          </g>
        )
      })}

      <text
        x={x(axis.first)}
        y={totalHeight - 5}
        fontSize="7"
        fontFamily="var(--font-mono)"
        fill="var(--text-muted)"
      >
        {wallClockTime(series.first_row_time)}
      </text>
      <text
        x={x(axis.last)}
        y={totalHeight - 5}
        textAnchor="end"
        fontSize="7"
        fontFamily="var(--font-mono)"
        fill="var(--text-muted)"
      >
        {wallClockTime(series.last_row_time)}
      </text>
    </svg>
  )
}

/**
 * What the marks on the chart mean, in words.
 *
 * ADR 0008's sixth ruling is one generated provenance sentence and never a badge per number, so the
 * legend explains the two washes the chart draws and leaves the channel's own sentence to the strip
 * under the stack.
 */
export function TraceLegend({ channel }: { channel: RaceChannelKey }): ReactElement {
  const meta = raceChannel(channel)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 4 }}>
      <LegendItem swatch={<span style={{ width: 12, height: 2, background: 'var(--blue-500)' }} />}>
        {meta.label} as recorded
      </LegendItem>
      <LegendItem
        swatch={
          <span
            style={{
              width: 10,
              height: 8,
              background: 'rgba(204,17,0,0.10)',
              border: '1px solid var(--wind-storm)',
              opacity: 0.7,
            }}
          />
        }
      >
        Feed dropped — rows repeat the last reading
      </LegendItem>
      {channel !== 'sog' && (
        <LegendItem
          swatch={<span style={{ width: 10, height: 8, background: 'rgba(0,68,204,0.10)' }} />}
        >
          Wind from GPS, not through the water
        </LegendItem>
      )}
    </div>
  )
}

function LegendItem({
  swatch,
  children,
}: {
  swatch: ReactElement
  children: ReactNode
}): ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 9.5,
        color: 'var(--text-muted)',
      }}
    >
      {swatch}
      {children}
    </span>
  )
}

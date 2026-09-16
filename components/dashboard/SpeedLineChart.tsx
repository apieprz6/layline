'use client'

import { useMemo, useRef } from 'react'
import type { WindDataPoint, WindDataPointWithOffset } from '@/types'
import { getMinutesAgo } from '@/lib/utils/time'
import { exceedsGapThreshold } from '@/lib/utils/windowing'

interface SpeedLineChartProps {
  data: WindDataPoint[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
  referenceTime?: Date
  hoverPoint: WindDataPointWithOffset | null
  onHoverChange: (point: WindDataPointWithOffset | null) => void
}

export default function SpeedLineChart({
  data,
  timeWindowMinutes,
  nowOffsetMinutes,
  referenceTime,
  hoverPoint,
  onHoverChange,
}: SpeedLineChartProps) {
  // Transform WindDataPoint[] to WindDataPointWithOffset[] by calculating minsAgo
  const dataWithOffset: WindDataPointWithOffset[] = useMemo(() => {
    const now = referenceTime || new Date()
    return data.map((point) => ({
      ...point,
      minsAgo: getMinutesAgo(point.timestamp, now),
    }))
  }, [data, referenceTime])
  // Constants for chart dimensions
  const WIDTH = 360
  const HEIGHT = 130
  const PAD_L = 26
  const PAD_R = 10
  const PAD_T = 14
  const PAD_B = 20

  const svgRef = useRef<SVGSVGElement>(null)

  // Filter data to time window
  const visibleData = useMemo(() => {
    const windowStart = nowOffsetMinutes
    const windowEnd = nowOffsetMinutes + timeWindowMinutes

    return dataWithOffset
      .filter(
        (point) => point.minsAgo >= windowStart && point.minsAgo <= windowEnd
      )
      // Descending minsAgo, so the array runs oldest to newest, left to right along the axis.
      .sort((a, b) => b.minsAgo - a.minsAgo)
  }, [dataWithOffset, timeWindowMinutes, nowOffsetMinutes])

  // Calculate dynamic Y-axis max
  const maxSpeed = useMemo(() => {
    if (visibleData.length === 0) return 8

    const dataMax = visibleData.reduce((max, p) => Math.max(max, p.spd), 0)
    // Round up to nearest 5, minimum 8
    return Math.max(8, Math.ceil((dataMax + 2) / 5) * 5)
  }, [visibleData])

  // Y-axis step: 5 for speeds <= 20, 10 for speeds > 20
  const yStep = maxSpeed > 20 ? 10 : 5

  // Generate Y-axis ticks
  const yTicks = []
  for (let v = 0; v <= maxSpeed; v += yStep) {
    yTicks.push(v)
  }

  // Coordinate transformation helpers
  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B

  /**
   * The trace's fill, as one closed shape per unbroken run of observations — plus the readings a
   * break leaves on their own.
   *
   * One shape per run rather than one for the whole series: an outage the stroke breaks would
   * otherwise still be filled underneath, which bridges it in a softer way. Each run closes to the
   * baseline at its own first and last observation, so the fill covers the time the buoy reported and
   * no more.
   *
   * A run of one has no area and no segment either, so it gets a dot. Dropping it would draw a
   * reading the buoy did take as nothing at all, which reads as "no data" rather than "one
   * observation between two outages" — the same reason the Wind Rose forces dots at a gap's ends.
   */
  const { areaPaths, isolatedPoints } = useMemo(() => {
    const windowStart = nowOffsetMinutes
    const windowEnd = nowOffsetMinutes + timeWindowMinutes
    const baseline = PAD_T + innerH

    const shapes: string[] = []
    const isolated: Array<{ x: number; y: number; spd: number }> = []
    let run: Array<{ x: number; y: number; spd: number }> = []

    const flush = (): void => {
      if (run.length > 1) {
        const first = run[0]
        const last = run[run.length - 1]
        const trace = run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')
        shapes.push(
          `M${trace} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
        )
      } else if (run.length === 1) {
        isolated.push(run[0])
      }
      run = []
    }

    visibleData.forEach((p, i) => {
      const previous = visibleData[i - 1]
      if (previous && exceedsGapThreshold(previous.minsAgo, p.minsAgo)) flush()

      const t = 1 - (p.minsAgo - windowStart) / (windowEnd - windowStart)
      run.push({
        x: PAD_L + t * innerW,
        y: PAD_T + (1 - p.spd / maxSpeed) * innerH,
        spd: p.spd,
      })
    })

    flush()
    return { areaPaths: shapes, isolatedPoints: isolated }
  }, [visibleData, nowOffsetMinutes, timeWindowMinutes, maxSpeed, innerW, innerH, PAD_T, PAD_L])

  // Helper for Y coordinate
  const yFor = (speed: number) => {
    return PAD_T + (1 - speed / maxSpeed) * innerH
  }

  // Wind condition colors
  function windColor(kts: number) {
    if (kts <= 8) return '#007A52'  // Light
    if (kts <= 15) return '#0055BB' // Medium
    if (kts <= 22) return '#C47000' // Heavy
    return '#CC1100'                // Storm
  }

  // Band lines at wind condition thresholds
  const bandLines = [8, 15, 22].filter((v) => v <= maxSpeed)

  // Format time offset label
  function fmtOffset(absMin: number) {
    if (absMin <= 0) return 'now'
    if (absMin < 60) return `−${Math.round(absMin)}m`
    const h = absMin / 60
    if (Math.abs(h - Math.round(h)) < 0.01) return `−${Math.round(h)}h`
    return `−${h.toFixed(1)}h`
  }

  // X-axis tick positions
  const xFracs = timeWindowMinutes >= 360 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]

  // Hover detection - find nearest point by X coordinate
  function pickFromX(clientX: number) {
    if (!svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) * WIDTH) / rect.width
    const t = Math.max(0, Math.min(1, (x - PAD_L) / innerW))

    const windowStart = nowOffsetMinutes
    const windowEnd = nowOffsetMinutes + timeWindowMinutes
    const targetMinsAgo = windowStart + (1 - t) * (windowEnd - windowStart)

    let best: WindDataPointWithOffset | null = null
    let bestDist = Infinity

    for (const p of visibleData) {
      const dist = Math.abs(p.minsAgo - targetMinsAgo)
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }

    if (best) {
      onHoverChange(best)
    }
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault()
    pickFromX(e.clientX)
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (e.buttons === 0 && e.pointerType === 'mouse') return
    pickFromX(e.clientX)
  }

  function handlePointerUp() {
    onHoverChange(null)
  }

  // Render Y-axis and chart
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: '100%', flex: '1 1 0', minHeight: 0, display: 'block', touchAction: 'none', cursor: 'crosshair', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Y-axis ticks and labels */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line
            x1={PAD_L}
            y1={yFor(v)}
            x2={PAD_L + innerW}
            y2={yFor(v)}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={0.75}
            strokeDasharray={v === 0 ? '0' : '2 4'}
          />
          <text
            x={PAD_L - 5}
            y={yFor(v) + 3}
            textAnchor="end"
            fontFamily="JetBrains Mono"
            fontSize={9}
            fill="#666"
          >
            {v}
          </text>
        </g>
      ))}

      {/* Wind condition band lines */}
      {bandLines.map((v) => (
        <line
          key={`band${v}`}
          x1={PAD_L}
          y1={yFor(v)}
          x2={PAD_L + innerW}
          y2={yFor(v)}
          stroke={windColor(v - 0.1)}
          strokeWidth={0.75}
          strokeOpacity={0.22}
          strokeDasharray="1 3"
        />
      ))}

      {/* X-axis ticks and labels */}
      {xFracs.map((f, i) => {
        const x = PAD_L + f * innerW
        const minAgo = nowOffsetMinutes + (1 - f) * timeWindowMinutes
        return (
          <g key={`x${i}`}>
            <line
              x1={x}
              y1={PAD_T + innerH}
              x2={x}
              y2={PAD_T + innerH + 3}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth={0.75}
            />
            <text
              x={x}
              y={HEIGHT - 5}
              textAnchor={i === 0 ? 'start' : i === xFracs.length - 1 ? 'end' : 'middle'}
              fontFamily="JetBrains Mono"
              fontSize={9}
              fill="#666"
            >
              {fmtOffset(minAgo)}
            </text>
          </g>
        )
      })}

      {/* Y-axis unit label */}
      <text
        x={2}
        y={PAD_T - 3}
        fontFamily="Inter"
        fontSize={8.5}
        fontWeight={600}
        letterSpacing="0.10em"
        fill="#666"
      >
        KTS
      </text>

      {/* Gradient definition for area fill.

          Anchored to the plot rather than to each shape's own box: the default objectBoundingBox
          units would restart the ramp inside every run, so a light-air stretch after an outage —
          a short shape — would render darker than the heavy-air stretch before it. The fade has to
          mean height on the axis, which is one scale for the whole chart. */}
      <defs>
        <linearGradient
          id="spdGradient"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={PAD_T}
          x2={0}
          y2={PAD_T + innerH}
        >
          <stop offset="0%" stopColor="#0044CC" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#0044CC" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill — one shape per unbroken run */}
      {areaPaths.map((d, i) => (
        <path key={`area${i}`} d={d} fill="url(#spdGradient)" />
      ))}

      {/* Colored line segments */}
      {visibleData.length > 1 && visibleData.slice(0, -1).map((p, i) => {
        const b = visibleData[i + 1]

        // Two observations an outage apart are not two ends of one line.
        if (exceedsGapThreshold(p.minsAgo, b.minsAgo)) return null

        const windowStart = nowOffsetMinutes
        const windowEnd = nowOffsetMinutes + timeWindowMinutes

        const t1 = 1 - (p.minsAgo - windowStart) / (windowEnd - windowStart)
        const x1 = PAD_L + t1 * innerW
        const y1 = PAD_T + (1 - p.spd / maxSpeed) * innerH

        const t2 = 1 - (b.minsAgo - windowStart) / (windowEnd - windowStart)
        const x2 = PAD_L + t2 * innerW
        const y2 = PAD_T + (1 - b.spd / maxSpeed) * innerH

        const avgSpd = (p.spd + b.spd) / 2

        return (
          <line
            className="chart-data-stroke"
            key={`seg${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={windColor(avgSpd)}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* One observation with no neighbour to join — drawn, because it was measured */}
      {isolatedPoints.map((point, i) => (
        <circle
          key={`lone${i}`}
          cx={point.x}
          cy={point.y}
          r={1.75}
          fill={windColor(point.spd)}
        />
      ))}

      {/* Hover visualization */}
      {hoverPoint && visibleData.find((p) => p.minsAgo === hoverPoint.minsAgo) && (() => {
        const windowStart = nowOffsetMinutes
        const windowEnd = nowOffsetMinutes + timeWindowMinutes
        const t = 1 - (hoverPoint.minsAgo - windowStart) / (windowEnd - windowStart)
        const x = PAD_L + t * innerW
        const y = PAD_T + (1 - hoverPoint.spd / maxSpeed) * innerH

        return (
          <g pointerEvents="none">
            {/* Vertical crosshair */}
            <line
              x1={x}
              y1={PAD_T}
              x2={x}
              y2={PAD_T + innerH}
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            {/* Hover circle */}
            <circle
              cx={x}
              cy={y}
              r={5}
              fill="white"
              stroke={windColor(hoverPoint.spd)}
              strokeWidth={2}
            />
            {/* Speed label tooltip */}
            <g transform={`translate(${x}, ${Math.max(PAD_T + 11, y - 14)})`}>
              <rect
                x={-21}
                y={-13}
                width={42}
                height={14}
                rx={3}
                fill="#0A0A0A"
              />
              <text
                x={0}
                y={-3}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize={9.5}
                fontWeight={600}
                fill="white"
              >
                {hoverPoint.spd.toFixed(1)} kt
              </text>
            </g>
          </g>
        )
      })()}
    </svg>
  )
}

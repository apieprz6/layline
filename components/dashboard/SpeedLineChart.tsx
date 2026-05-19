'use client'

import { useMemo, useRef } from 'react'
import type { MinuteDataPoint } from '@/types'

interface SpeedLineChartProps {
  data: MinuteDataPoint[]
  timeWindowMinutes: number
  nowOffsetMinutes: number
  hoverPoint: MinuteDataPoint | null
  onHoverChange: (point: MinuteDataPoint | null) => void
}

export default function SpeedLineChart({
  data,
  timeWindowMinutes,
  nowOffsetMinutes,
  hoverPoint,
  onHoverChange,
}: SpeedLineChartProps) {
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

    return data
      .filter(
        (point) => point.minsAgo >= windowStart && point.minsAgo <= windowEnd
      )
      .sort((a, b) => b.minsAgo - a.minsAgo) // Sort newest to oldest
  }, [data, timeWindowMinutes, nowOffsetMinutes])

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

  // Generate path for line chart
  const linePath = useMemo(() => {
    if (visibleData.length < 2) return ''

    const windowStart = nowOffsetMinutes
    const windowEnd = nowOffsetMinutes + timeWindowMinutes

    const points = visibleData.map((p) => {
      const t = 1 - (p.minsAgo - windowStart) / (windowEnd - windowStart)
      const x = PAD_L + t * innerW
      const y = PAD_T + (1 - p.spd / maxSpeed) * innerH
      return [x, y]
    })
    return 'M' + points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')
  }, [visibleData, nowOffsetMinutes, timeWindowMinutes, maxSpeed])

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

  // Helper for X coordinate
  const xFor = (minsAgo: number) => {
    const t = 1 - (minsAgo - nowOffsetMinutes) / timeWindowMinutes
    return PAD_L + t * innerW
  }

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

    let best: MinuteDataPoint | null = null
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
      style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: 'crosshair' }}
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

      {/* Gradient definition for area fill */}
      <defs>
        <linearGradient id="spdGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0044CC" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#0044CC" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      {linePath && (
        <path
          d={`${linePath} L${PAD_L + innerW},${PAD_T + innerH} L${PAD_L},${PAD_T + innerH} Z`}
          fill="url(#spdGradient)"
        />
      )}

      {/* Colored line segments */}
      {visibleData.length > 1 && visibleData.slice(0, -1).map((p, i) => {
        const b = visibleData[i + 1]
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

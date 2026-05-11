'use client'

import { useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { getWindColorHex } from '@/lib/utils/wind'

interface PolarChartProps {
  data: MinuteDataPoint[]
  buoyId: string
  referenceTime?: Date
}

const SIZE = 360
const PAD = 42
const CENTER_X = SIZE / 2
const CENTER_Y = SIZE / 2
const R = (SIZE - PAD * 2) / 2
const LABEL_RADIUS = R * 1.13

// Compass directions with angles (0° = North = top)
const COMPASS_LABELS = [
  { label: 'N', angle: 0 },
  { label: 'NE', angle: 45 },
  { label: 'E', angle: 90 },
  { label: 'SE', angle: 135 },
  { label: 'S', angle: 180 },
  { label: 'SW', angle: 225 },
  { label: 'W', angle: 270 },
  { label: 'NW', angle: 315 },
]

function polarToXY(angleDeg: number, r0to1: number, cx: number, cy: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  const x = Math.round((cx + r0to1 * radius * Math.cos(rad)) * 1e6) / 1e6
  const y = Math.round((cy + r0to1 * radius * Math.sin(rad)) * 1e6) / 1e6
  return [x, y]
}

export default function PolarChart({ data, buoyId, referenceTime }: PolarChartProps) {
  // Calculate the time scale (oldest to newest)
  const oldestTime = useMemo(() => {
    if (data.length === 0) return 0
    return Math.max(...data.map(d => d.minsAgo))
  }, [data])

  // Map data points to polar coordinates with r01 values
  const dataPoints = useMemo(() => {
    if (oldestTime === 0) return []

    return data
      .map(point => {
        // r01: 1 = now (outer ring), 0 = oldest (center)
        const r01 = 1 - (point.minsAgo / oldestTime)
        const [x, y] = polarToXY(point.dir, r01, CENTER_X, CENTER_Y, R)
        const color = getWindColorHex(point.spd)
        const opacity = Math.round((0.15 + 0.85 * Math.pow(r01, 1.2)) * 1e6) / 1e6

        return { ...point, x, y, r01, color, opacity }
      })
      .sort((a, b) => a.minsAgo - b.minsAgo) // Sort oldest to newest
  }, [data, oldestTime])

  // Generate line segments, skipping gaps > 90°
  const lineSegments = useMemo(() => {
    const segments: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      color: string
      opacity: number
    }> = []

    for (let i = 0; i < dataPoints.length - 1; i++) {
      const a = dataPoints[i]
      const b = dataPoints[i + 1]

      // Calculate angular difference (shortest path)
      const angDiff = Math.abs(((a.dir - b.dir + 540) % 360) - 180)

      // Skip if angular gap > 90° (wraparound artifact)
      if (angDiff > 90) continue

      // Calculate midpoint radius for opacity
      const midR = (a.r01 + b.r01) / 2
      const opacity = Math.round((0.08 + 0.92 * Math.pow(midR, 1.5)) * 1e6) / 1e6

      // Use average speed for color
      const avgSpeed = (a.spd + b.spd) / 2
      const color = getWindColorHex(avgSpeed)

      segments.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        color,
        opacity,
      })
    }

    return segments
  }, [dataPoints])

  return (
    <div>
      <svg viewBox="0 0 360 360">
        {/* Background gradients */}
        <defs>
          <radialGradient id="bgWash" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F0EDE6" stopOpacity="1" />
            <stop offset="70%" stopColor="#EFEBE2" stopOpacity="1" />
            <stop offset="100%" stopColor="#E8E2D2" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="outerHalo" cx="50%" cy="50%" r="50%">
            <stop offset="92%" stopColor="rgba(0,68,204,0)" />
            <stop offset="100%" stopColor="rgba(0,68,204,0.12)" />
          </radialGradient>
        </defs>

        {/* Background circles */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={R + 6} fill="url(#bgWash)" />
        <circle cx={CENTER_X} cy={CENTER_Y} r={R + 6} fill="url(#outerHalo)" />

        {/* Angle tick lines (every 10°) */}
        {Array.from({ length: 36 }, (_, i) => i * 10).map(angle => {
          const isCardinal = angle % 90 === 0
          const isIntercardinal = angle % 45 === 0
          const isCoarse = angle % 30 === 0

          const stroke = isCardinal
            ? 'rgba(0,0,0,0.32)'
            : isIntercardinal
            ? 'rgba(0,0,0,0.18)'
            : isCoarse
            ? 'rgba(0,0,0,0.10)'
            : 'rgba(0,0,0,0.04)'

          const strokeWidth = isCardinal ? 1 : isCoarse ? 0.75 : 0.5

          // Full radial lines for coarse ticks, short ticks for fine ones
          if (!isCoarse) {
            const [x1, y1] = polarToXY(angle, 0.965, CENTER_X, CENTER_Y, R)
            const [x2, y2] = polarToXY(angle, 1, CENTER_X, CENTER_Y, R)
            return (
              <line
                key={`tick-${angle}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            )
          }

          const [x2, y2] = polarToXY(angle, 1, CENTER_X, CENTER_Y, R)
          return (
            <line
              key={`tick-${angle}`}
              x1={CENTER_X}
              y1={CENTER_Y}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          )
        })}

        {/* Radial time rings (3 rings: outer, middle, inner) */}
        {[1, 0.5, 0].map((r01, i) => {
          const isOuterRing = i === 0
          return (
            <circle
              key={`ring-${i}`}
              cx={CENTER_X}
              cy={CENTER_Y}
              r={Math.max(0, r01 * R)}
              fill="none"
              stroke={isOuterRing ? 'rgba(0,68,204,0.55)' : 'rgba(0,0,0,0.12)'}
              strokeWidth={isOuterRing ? 1.5 : 0.75}
              strokeDasharray={isOuterRing ? '0' : '2 4'}
            />
          )
        })}

        {/* Compass labels */}
        {COMPASS_LABELS.map(({ label, angle }) => {
          const [x, y] = polarToXY(angle, LABEL_RADIUS / R, CENTER_X, CENTER_Y, R)

          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fill: 'var(--text-primary)',
              }}
            >
              {label}
            </text>
          )
        })}

        {/* Line segments connecting data points */}
        {lineSegments.map((segment, i) => (
          <line
            key={`seg-${i}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            stroke={segment.color}
            strokeWidth={2.5}
            strokeOpacity={segment.opacity}
            strokeLinecap="round"
          />
        ))}

        {/* Data points as circles */}
        {dataPoints.map((point, i) => {
          // Subsample for performance (show ~28 points max)
          const step = Math.max(1, Math.floor(dataPoints.length / 28))
          if (i % step !== 0 && i !== 0) return null

          return (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r={2.2}
              fill={point.color}
              opacity={point.opacity}
            />
          )
        })}

        {/* Center dot */}
        <circle cx={CENTER_X} cy={CENTER_Y} r={2.5} fill="rgba(0,0,0,0.5)" />
      </svg>

      {/* CHII2 elevation reminder */}
      {buoyId === 'CHII2' && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--muted)',
            marginTop: '8px',
            textAlign: 'center',
          }}
        >
          Wind measured at 85ft elevation (typically 20-30% higher than surface)
        </div>
      )}
    </div>
  )
}

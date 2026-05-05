'use client'

import { useEffect, useState } from 'react'
import type { BuoyHistoryData } from '@/types'

interface StationCardExpandedProps {
  buoyId: string
}

interface WindStats {
  speedTrend: {
    type: 'building' | 'easing' | 'steady'
    delta: number
  }
  directionTrend: {
    type: 'veering' | 'backing' | 'steady'
    delta: number
  }
  oscillation: number // ±X° range
  gustFactor: number // percentage
  gustFactorLabel: 'Puffy' | 'Moderate' | 'Smooth'
  variability: number // speed std dev
}

// Calculate wind statistics from history data
function computeWindStats(
  minuteHistory: Array<{ minsAgo: number; spd: number; dir: number }>,
  currentSpeed: number,
  currentGust: number | undefined
): WindStats | null {
  if (minuteHistory.length < 3) return null

  // Speed trend: compare avg(last 20min) vs avg(last 2h)
  const last20min = minuteHistory.filter((p) => p.minsAgo <= 20)
  const allPoints = minuteHistory

  const avg20min =
    last20min.reduce((sum, p) => sum + p.spd, 0) / last20min.length
  const avg2h = allPoints.reduce((sum, p) => sum + p.spd, 0) / allPoints.length

  const speedDelta = avg20min - avg2h
  let speedTrendType: 'building' | 'easing' | 'steady' = 'steady'
  if (speedDelta > 0.3) speedTrendType = 'building'
  else if (speedDelta < -0.3) speedTrendType = 'easing'

  // Direction trend: newest - oldest, normalize to [-180, 180]
  const newest = minuteHistory[0]
  const oldest = minuteHistory[minuteHistory.length - 1]
  let dirDelta = newest.dir - oldest.dir

  // Normalize to [-180, 180]
  if (dirDelta > 180) dirDelta -= 360
  if (dirDelta < -180) dirDelta += 360

  let dirTrendType: 'veering' | 'backing' | 'steady' = 'steady'
  if (Math.abs(dirDelta) > 5) {
    dirTrendType = dirDelta > 0 ? 'veering' : 'backing'
  }

  // Oscillation range: std dev of directions over last hour
  const lastHour = minuteHistory.filter((p) => p.minsAgo <= 60)
  const dirStdDev = calculateCircularStdDev(lastHour.map((p) => p.dir))
  const oscillation = dirStdDev / 2 // Half of std dev for ± range

  // Gust factor
  const gustFactor = currentGust
    ? ((currentGust - currentSpeed) / currentSpeed) * 100
    : 0
  let gustFactorLabel: 'Puffy' | 'Moderate' | 'Smooth' = 'Smooth'
  if (gustFactor > 30) gustFactorLabel = 'Puffy'
  else if (gustFactor > 15) gustFactorLabel = 'Moderate'

  // Speed variability: std dev over last hour
  const speedStdDev = calculateStdDev(lastHour.map((p) => p.spd))

  return {
    speedTrend: {
      type: speedTrendType,
      delta: Math.abs(speedDelta),
    },
    directionTrend: {
      type: dirTrendType,
      delta: Math.abs(dirDelta),
    },
    oscillation,
    gustFactor,
    gustFactorLabel,
    variability: speedStdDev,
  }
}

// Calculate standard deviation
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

// Calculate circular standard deviation for directions
function calculateCircularStdDev(directions: number[]): number {
  if (directions.length === 0) return 0

  // Convert to radians and calculate mean direction
  let sumSin = 0
  let sumCos = 0
  directions.forEach((deg) => {
    const rad = (deg * Math.PI) / 180
    sumSin += Math.sin(rad)
    sumCos += Math.cos(rad)
  })

  const meanSin = sumSin / directions.length
  const meanCos = sumCos / directions.length
  const r = Math.sqrt(meanSin * meanSin + meanCos * meanCos)

  // Circular standard deviation in degrees
  const circularStdDev = Math.sqrt(-2 * Math.log(r)) * (180 / Math.PI)
  return circularStdDev
}

export default function StationCardExpanded({ buoyId }: StationCardExpandedProps) {
  const [history, setHistory] = useState<BuoyHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        const response = await fetch('/api/weather/buoys/history')
        if (!response.ok) {
          throw new Error('Failed to fetch history')
        }
        const data = await response.json()
        const buoyHistory = data.buoys.find((b: BuoyHistoryData) => b.buoyId === buoyId)
        setHistory(buoyHistory || null)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [buoyId])

  if (loading) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        Loading history...
      </div>
    )
  }

  if (error || !history) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        History unavailable
      </div>
    )
  }

  if (!history.hourlyHistory || !history.minuteHistory) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        No historical data available
      </div>
    )
  }

  // For now, just show placeholder - will add charts in next iteration
  return (
    <div style={{ padding: '0' }}>
      {/* Trend badges placeholder */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            flex: 1,
            padding: '8px',
            background: 'var(--surface-sunken)',
            borderRadius: '6px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          Speed: {history.minuteHistory[0]?.spd || 0} kts
        </div>
        <div
          style={{
            flex: 1,
            padding: '8px',
            background: 'var(--surface-sunken)',
            borderRadius: '6px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          Dir: {history.minuteHistory[0]?.dir || 0}°
        </div>
      </div>

      {/* Charts placeholder */}
      <div
        style={{
          padding: '20px',
          background: 'var(--surface-sunken)',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginBottom: '12px',
        }}
      >
        📈 Charts coming soon<br />
        <span style={{ fontSize: '9px' }}>
          {history.hourlyHistory.length} hourly points · {history.minuteHistory.length} minute
          points
        </span>
      </div>

      {/* Stats row placeholder */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
        }}
      >
        {['Speed', 'Gust', 'Osc'].map((label) => (
          <div
            key={label}
            style={{
              padding: '8px',
              background: 'var(--surface-sunken)',
              borderRadius: '6px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                marginBottom: '2px',
              }}
            >
              {label}
            </div>
            <div
              className="data-mono"
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              --
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

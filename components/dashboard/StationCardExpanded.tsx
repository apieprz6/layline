'use client'

import { useEffect, useState } from 'react'
import type { BuoyHistoryData } from '@/types'
import { computeWindStats } from '@/lib/utils/statistics'

interface StationCardExpandedProps {
  buoyId: string
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

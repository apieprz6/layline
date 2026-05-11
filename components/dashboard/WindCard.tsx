'use client'

import WindCompass from './WindCompass'
import WindArrow from './WindArrow'
import { getWindCondition } from '@/lib/utils/wind'
import { spacing } from '@/lib/utils/design'

interface WindCardProps {
  current: {
    speed: number
    direction: number
    gust?: number
  }
  forecast?: {
    speed: number
    direction: number
  }
}

export default function WindCard({ current, forecast }: WindCardProps) {
  const condition = getWindCondition(current.speed)

  return (
    <div className="layline-card">
      <div className="flex items-start justify-between" style={{ marginBottom: spacing(4) }}>
        <div>
          <div className="label" style={{ color: 'var(--text-muted)' }}>Current wind</div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="data-mono" style={{ fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)' }}>
              {current.speed}
            </span>
            <span className="data-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              kts
            </span>
          </div>
          {current.gust && (
            <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Gusts to <span className="data-mono">{current.gust} kts</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <WindArrow deg={current.direction} kts={current.speed} size={40} />
          <span className="data-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            {current.direction}°
          </span>
        </div>
      </div>

      <div
        className="inline-block px-3 py-1 rounded-full text-xs font-medium"
        style={{
          background: `${condition.color}1a`,
          color: condition.color,
          border: `1px solid ${condition.color}66`
        }}
      >
        {condition.label} air
      </div>

      {forecast && (
        <>
          <div className="layline-divider" />
          <div className="flex items-center justify-between">
            <div>
              <div className="label" style={{ color: 'var(--text-muted)' }}>Race time forecast</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="data-mono font-semibold">{forecast.speed} kts</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>from</span>
                <span className="data-mono font-semibold">{forecast.direction}°</span>
              </div>
            </div>
            <WindArrow deg={forecast.direction} kts={forecast.speed} size={32} />
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import WindArrow from './WindArrow'

interface Model {
  name: string
  speed: number
  direction: number
  gust: number
}

interface ModelComparisonProps {
  models: Model[]
}

export default function ModelComparison({ models }: ModelComparisonProps) {
  const avgSpeed = Math.round(models.reduce((sum, m) => sum + m.speed, 0) / models.length)
  const spread = Math.max(...models.map(m => m.speed)) - Math.min(...models.map(m => m.speed))

  return (
    <div className="layline-card">
      <div className="label mb-4" style={{ color: 'var(--text-secondary)' }}>Model comparison</div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Average</div>
          <div className="data-mono text-2xl font-semibold">{avgSpeed} kts</div>
        </div>
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Spread</div>
          <div className="data-mono text-2xl font-semibold">{spread} kts</div>
        </div>
      </div>

      <div className="space-y-2">
        {models.map((model, i) => {
          const windColor = model.speed <= 8 ? '#007A52' : model.speed <= 15 ? '#0055BB' : model.speed <= 22 ? '#C47000' : '#CC1100'

          return (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--surface-border)'
              }}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="data-mono text-xs font-semibold" style={{ width: '60px', color: 'var(--text-secondary)' }}>
                  {model.name}
                </div>
                <div className="flex items-center gap-2">
                  <WindArrow deg={model.direction} kts={model.speed} size={20} />
                  <div className="data-mono font-semibold" style={{ color: windColor }}>
                    {model.speed}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>kts</div>
                </div>
              </div>
              <div className="data-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                {model.direction}°
              </div>
            </div>
          )
        })}
      </div>

      {spread > 5 && (
        <div
          className="mt-4 p-2 rounded text-xs"
          style={{
            background: 'rgba(196,112,0,0.1)',
            border: '1px solid rgba(196,112,0,0.3)',
            color: '#C47000'
          }}
        >
          ⚠ High model divergence — treat forecast as approximate
        </div>
      )}
    </div>
  )
}

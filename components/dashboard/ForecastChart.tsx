'use client'

import WindArrow from './WindArrow'

interface ForecastData {
  time: string
  speed: number
  direction: number
  gust?: number
  isRaceTime?: boolean
}

interface ForecastChartProps {
  data: ForecastData[]
}

export default function ForecastChart({ data }: ForecastChartProps) {
  const maxSpeed = Math.max(...data.map(d => d.gust || d.speed)) + 5

  return (
    <div className="layline-card">
      <div className="label mb-4" style={{ color: 'var(--text-secondary)' }}>Wind forecast</div>

      <div className="flex items-end justify-between gap-2" style={{ height: '120px' }}>
        {data.map((forecast, i) => {
          const heightPercent = (forecast.speed / maxSpeed) * 100
          const gustHeightPercent = forecast.gust ? (forecast.gust / maxSpeed) * 100 : heightPercent
          const windColor = forecast.speed <= 8 ? '#007A52' : forecast.speed <= 15 ? '#0055BB' : forecast.speed <= 22 ? '#C47000' : '#CC1100'

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              {/* Wind arrow */}
              <WindArrow deg={forecast.direction} kts={forecast.speed} size={20} />

              {/* Bar chart */}
              <div className="relative w-full" style={{ height: '60px' }}>
                {/* Gust bar */}
                {forecast.gust && (
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height: `${gustHeightPercent}%`,
                      background: `${windColor}22`,
                      border: `1px solid ${windColor}44`,
                      borderRadius: '4px 4px 0 0'
                    }}
                  />
                )}
                {/* Speed bar */}
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{
                    height: `${heightPercent}%`,
                    background: windColor,
                    borderRadius: '4px 4px 0 0'
                  }}
                />
              </div>

              {/* Speed label */}
              <div className="data-mono text-xs font-semibold" style={{ color: windColor }}>
                {forecast.speed}
              </div>

              {/* Time label */}
              <div
                className="data-mono text-xs"
                style={{
                  color: forecast.isRaceTime ? 'var(--blue-500)' : 'var(--text-muted)',
                  fontWeight: forecast.isRaceTime ? 600 : 400
                }}
              >
                {forecast.time}
              </div>
            </div>
          )
        })}
      </div>

      {data.find(d => d.isRaceTime) && (
        <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--blue-500)', fontWeight: 600 }}>●</span> Race start
        </div>
      )}
    </div>
  )
}

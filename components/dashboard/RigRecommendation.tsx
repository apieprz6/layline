'use client'

import { WIND_COLORS } from '@/lib/utils/wind'
import { tint } from '@/lib/utils/design'

interface RigRecommendationProps {
  condition: 'light' | 'medium' | 'heavy'
  windSpeed: number
  recommendations: string[]
}

export default function RigRecommendation({ condition, windSpeed, recommendations }: RigRecommendationProps) {
  const conditionConfig = {
    light: { label: 'Light air setup', color: WIND_COLORS.LIGHT },
    medium: { label: 'Medium air setup', color: WIND_COLORS.MEDIUM },
    heavy: { label: 'Heavy air setup', color: WIND_COLORS.HEAVY }
  }

  const config = conditionConfig[condition]
  // The badge tints are the old hex alphas 1a and 66, i.e. 26/255 and 102/255.

  return (
    <div className="layline-card">
      <div className="label mb-2" style={{ color: 'var(--text-muted)' }}>Rig setup</div>

      <div className="flex items-center gap-2 mb-4">
        <h4 className="h4">{config.label}</h4>
        <div
          className="px-2 py-0.5 rounded text-xs font-semibold data-mono"
          style={{
            background: tint(config.color, 10.2),
            color: config.color,
            border: `1px solid ${tint(config.color, 40)}`
          }}
        >
          {windSpeed} kts
        </div>
      </div>

      <div className="space-y-2">
        {recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2">
            <div
              className="mt-1 w-1.5 h-1.5 rounded-full"
              style={{ background: config.color }}
            />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {rec}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

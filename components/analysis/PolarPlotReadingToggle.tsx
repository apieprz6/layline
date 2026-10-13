'use client'

import type { ReactElement } from 'react'
import type { PolarPlotReading } from '@/types'

/**
 * `Speed` | `% of target`: two readings of one state, so the selection and the window survive the
 * switch. In `%` the certificate becomes a dashed 100% circle and the patches fall back to dots,
 * because a patch is a bin of speed and speed is no longer the radius.
 */
export default function PolarPlotReadingToggle({
  reading,
  onReading,
}: {
  reading: PolarPlotReading
  onReading: (next: PolarPlotReading) => void
}): ReactElement {
  return (
    <div role="group" aria-label="What the radius shows" style={{ display: 'flex', alignSelf: 'flex-start' }}>
      {(
        [
          ['knots', 'Speed'],
          ['pct', '% of target'],
        ] as const
      ).map(([value, label], index) => {
        const on = reading === value
        return (
          <button
            key={value}
            type="button"
            data-testid={`polar-plot-reading-${value}`}
            aria-pressed={on}
            onClick={() => onReading(value)}
            style={{
              padding: '6px 12px',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'var(--surface-border)',
              borderLeftWidth: index === 0 ? 1 : 0,
              borderRadius: index === 0 ? '999px 0 0 999px' : '0 999px 999px 0',
              background: on ? 'var(--text-accent)' : 'var(--surface-raised)',
              color: on ? 'var(--surface-raised)' : 'var(--text-secondary)',
              fontSize: 'var(--text-xs)',
              fontWeight: on ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

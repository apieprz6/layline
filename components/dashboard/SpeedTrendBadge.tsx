import type { WindStats } from '@/lib/utils/statistics'

interface SpeedTrendBadgeProps {
  stats: WindStats | null
}

export default function SpeedTrendBadge({ stats }: SpeedTrendBadgeProps) {
  if (!stats) return null

  const { speedTrend } = stats
  const { type, signedDelta } = speedTrend

  let label: string
  let colorVar: string
  let bgVar: string
  let borderVar: string

  if (type === 'building') {
    label = `↑ Building +${Math.abs(signedDelta).toFixed(1)} kts`
    colorVar = 'var(--trend-building)'
    bgVar = 'var(--trend-building-bg)'
    borderVar = 'var(--trend-building-border)'
  } else if (type === 'easing') {
    label = `↓ Easing ${Math.abs(signedDelta).toFixed(1)} kts`
    colorVar = 'var(--trend-easing)'
    bgVar = 'var(--trend-easing-bg)'
    borderVar = 'var(--trend-easing-border)'
  } else {
    label = '→ Steady'
    colorVar = 'var(--trend-steady)'
    bgVar = 'var(--trend-steady-bg)'
    borderVar = 'var(--trend-steady-border)'
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: bgVar,
        border: `1px solid ${borderVar}`,
        borderRadius: '9999px',
        padding: '3px 9px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9.5px',
          color: colorVar,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}

import type { WindStats } from '@/lib/utils/statistics'

interface DirTrendBadgeProps {
  stats: WindStats | null
}

export default function DirTrendBadge({ stats }: DirTrendBadgeProps) {
  if (!stats) return null

  const { directionTrend } = stats
  const { type, signedDelta } = directionTrend

  let label: string
  let colorVar: string
  let bgVar: string
  let borderVar: string

  if (type === 'steady') {
    label = '→ Steady'
    colorVar = 'var(--trend-steady)'
    bgVar = 'var(--trend-steady-bg)'
    borderVar = 'var(--trend-steady-border)'
  } else if (type === 'veering') {
    label = `↻ Veering +${Math.round(Math.abs(signedDelta))}° / 2h`
    colorVar = 'var(--trend-veering)'
    bgVar = 'var(--trend-veering-bg)'
    borderVar = 'var(--trend-veering-border)'
  } else {
    // backing
    label = `↺ Backing −${Math.round(Math.abs(signedDelta))}° / 2h`
    colorVar = 'var(--trend-backing)'
    bgVar = 'var(--trend-backing-bg)'
    borderVar = 'var(--trend-backing-border)'
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

'use client'

interface WindArrowProps {
  deg: number
  kts: number
  size?: number
  color?: string
}

export default function WindArrow({ deg, kts, size = 32, color }: WindArrowProps) {
  const windColor = (kts: number): string => {
    if (kts <= 8) return '#007A52'
    if (kts <= 15) return '#0055BB'
    if (kts <= 22) return '#C47000'
    return '#CC1100'
  }

  const c = color || windColor(kts)

  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28">
      <g transform={`rotate(${deg})`}>
        <polygon
          points="0,-11 4,-4 0,-7 -4,-4"
          fill={c}
          style={{ filter: `drop-shadow(0 0 4px ${c}88)` }}
        />
        <rect
          x="-1.5"
          y="-4"
          width="3"
          height="10"
          rx="0.8"
          fill={`${c}33`}
        />
      </g>
    </svg>
  )
}

'use client'

import { getWindColorHex } from '@/lib/utils/wind'

interface WindArrowProps {
  deg: number
  kts: number
  size?: number
  color?: string
}

export default function WindArrow({ deg, kts, size = 32, color }: WindArrowProps) {
  const c = color || getWindColorHex(kts)

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

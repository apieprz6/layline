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
    <svg width={size} height={size} viewBox="-32 -32 64 64">
      <g transform={`rotate(${deg + 180})`}>
        <polygon
          points="0,-28 6,-12 0,-18 -6,-12"
          fill={c}
          style={{ filter: `drop-shadow(0 0 8px ${c})` }}
        />
        <rect
          x="-2"
          y="-12"
          width="4"
          height="24"
          rx="1.2"
          fill={`${c}33`}
        />
      </g>
    </svg>
  )
}

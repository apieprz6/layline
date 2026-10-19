'use client'

import { getWindColor } from '@/lib/utils/wind'

interface WindArrowProps {
  deg: number
  kts: number
  size?: number
  color?: string
}

export default function WindArrow({ deg, kts, size = 32, color }: WindArrowProps) {
  const c = color || getWindColor(kts)

  // Colours through `style`, not `fill=`: `c` is a token.
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64">
      <g transform={`rotate(${deg})`}>
        <polygon
          points="0,-28 6,-12 0,-18 -6,-12"
          style={{ fill: c, filter: `drop-shadow(0 0 8px ${c})` }}
        />
        <rect
          x="-2"
          y="-12"
          width="4"
          height="24"
          rx="1.2"
          fillOpacity={0.2}
          style={{ fill: c }}
        />
      </g>
    </svg>
  )
}

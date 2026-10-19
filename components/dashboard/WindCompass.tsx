'use client'

import { getWindColor } from '@/lib/utils/wind'

interface WindCompassProps {
  deg: number
  kts: number
  size?: number
}

export default function WindCompass({ deg, kts, size = 120 }: WindCompassProps) {
  const color = getWindColor(kts)
  const r = size / 2
  // Tokens, so every colour goes through `style` rather than a presentation attribute. The
  // opacities are the hex alphas these strokes used to carry as a suffix, kept exact.
  const ring = { stroke: 'var(--blue-500)' }
  const label = { fill: 'var(--blue-muted-40)' }

  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`}>
      <circle r={r - 4} fill="none" strokeOpacity={0x12 / 255} strokeWidth="1" style={ring} />
      <circle r={r - 16} fill="none" strokeOpacity={0x0d / 255} strokeWidth="1" style={ring} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const rad = (a * Math.PI) / 180
        const r1 = r - 16
        const r2 = a % 90 === 0 ? r - 8 : r - 12
        return (
          <line
            key={a}
            x1={Math.sin(rad) * r1}
            y1={-Math.cos(rad) * r1}
            x2={Math.sin(rad) * r2}
            y2={-Math.cos(rad) * r2}
            strokeOpacity={a % 90 === 0 ? 0x59 / 255 : 0x26 / 255}
            strokeWidth={a % 90 === 0 ? 1 : 0.5}
            style={ring}
          />
        )
      })}
      <text x="0" y={-(r - 14)} textAnchor="middle" dominantBaseline="middle" style={label} fontSize="7" fontFamily="JetBrains Mono,monospace">N</text>
      <text x={r - 14} y="0" textAnchor="middle" dominantBaseline="middle" style={label} fontSize="7" fontFamily="JetBrains Mono,monospace">E</text>
      <text x="0" y={r - 14} textAnchor="middle" dominantBaseline="middle" style={label} fontSize="7" fontFamily="JetBrains Mono,monospace">S</text>
      <text x={-(r - 14)} y="0" textAnchor="middle" dominantBaseline="middle" style={label} fontSize="7" fontFamily="JetBrains Mono,monospace">W</text>
      <g transform={`rotate(${deg})`}>
        <polygon
          points="0,-28 6,-12 0,-18 -6,-12"
          style={{ fill: color, filter: `drop-shadow(0 0 8px ${color})` }}
        />
        <rect
          x="-2"
          y="-12"
          width="4"
          height="22"
          rx="1.5"
          fillOpacity={0x30 / 255}
          style={{ fill: color }}
        />
        <circle cx="0" cy="12" r="3" opacity={0.4} style={{ fill: color }} />
      </g>
    </svg>
  )
}

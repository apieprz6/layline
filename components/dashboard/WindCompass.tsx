'use client'

interface WindCompassProps {
  deg: number
  kts: number
  size?: number
}

export default function WindCompass({ deg, kts, size = 120 }: WindCompassProps) {
  const windColor = (kts: number) => {
    if (kts <= 8) return { color: '#007A52', bg: 'rgba(0,122,82,0.1)', border: 'rgba(0,122,82,0.4)' }
    if (kts <= 15) return { color: '#0055BB', bg: 'rgba(0,85,187,0.1)', border: 'rgba(0,85,187,0.4)' }
    if (kts <= 22) return { color: '#C47000', bg: 'rgba(196,112,0,0.1)', border: 'rgba(196,112,0,0.4)' }
    return { color: '#CC1100', bg: 'rgba(204,17,0,0.1)', border: 'rgba(204,17,0,0.4)' }
  }

  const wc = windColor(kts)
  const r = size / 2
  const ringStroke = '#0044CC'
  const labelFill = 'rgba(0,68,204,0.4)'

  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`}>
      <circle r={r - 4} fill="none" stroke={`${ringStroke}12`} strokeWidth="1" />
      <circle r={r - 16} fill="none" stroke={`${ringStroke}0d`} strokeWidth="1" />
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
            stroke={a % 90 === 0 ? `${ringStroke}59` : `${ringStroke}26`}
            strokeWidth={a % 90 === 0 ? 1 : 0.5}
          />
        )
      })}
      <text x="0" y={-(r - 14)} textAnchor="middle" dominantBaseline="middle" fill={labelFill} fontSize="7" fontFamily="JetBrains Mono,monospace">N</text>
      <text x={r - 14} y="0" textAnchor="middle" dominantBaseline="middle" fill={labelFill} fontSize="7" fontFamily="JetBrains Mono,monospace">E</text>
      <text x="0" y={r - 14} textAnchor="middle" dominantBaseline="middle" fill={labelFill} fontSize="7" fontFamily="JetBrains Mono,monospace">S</text>
      <text x={-(r - 14)} y="0" textAnchor="middle" dominantBaseline="middle" fill={labelFill} fontSize="7" fontFamily="JetBrains Mono,monospace">W</text>
      <g transform={`rotate(${deg})`}>
        <polygon
          points="0,-28 6,-12 0,-18 -6,-12"
          fill={wc.color}
          style={{ filter: `drop-shadow(0 0 8px ${wc.color})` }}
        />
        <rect
          x="-2"
          y="-12"
          width="4"
          height="22"
          rx="1.5"
          fill={`${wc.color}30`}
        />
        <circle cx="0" cy="12" r="3" fill={wc.color} opacity={0.4} />
      </g>
    </svg>
  )
}

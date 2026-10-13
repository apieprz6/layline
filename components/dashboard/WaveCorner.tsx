import type { ReactElement } from 'react'
import { getCompassDirection } from '@/lib/utils/wind'
import { formatTimeHHMM } from '@/lib/utils/timeFormatting'
import type { SecondaryReading } from '@/types'

const LABEL_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: '8.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '1px',
} as const

const FIGURE_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: 1,
} as const

/**
 * Points the way the waves are travelling. NDBC's MWD is the direction they come *from*, so
 * "from NE" draws an arrow toward SW.
 */
function WaveArrow({ fromDeg }: { fromDeg: number }): ReactElement {
  return (
    <svg width={11} height={11} viewBox="0 0 20 20" aria-hidden style={{ flexShrink: 0 }}>
      <g transform={`rotate(${(fromDeg + 180) % 360} 10 10)`}>
        <path
          d="M10 2 L10 17 M5 7 L10 2 L15 7"
          fill="none"
          style={{ stroke: 'var(--accent-primary)' }}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

interface WaveCornerProps {
  reading: SecondaryReading
}

/**
 * The Wind Rose's bottom-left readout for a station that measures waves: height, period and
 * direction at the displayed moment. With no reading then it shows "—" and when the last one
 * was, never that last value as if it were current.
 */
export default function WaveCorner({ reading }: WaveCornerProps): ReactElement {
  const p = reading.point

  return (
    <div data-testid="rose-waves" style={{ pointerEvents: 'none' }}>
      <div style={LABEL_STYLE}>Waves</div>
      {p && p.waveHeight != null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
            <span style={{ ...FIGURE_STYLE, color: 'var(--text-primary)' }}>
              {p.waveHeight.toFixed(1)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
              ft
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '1px',
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              color: 'var(--text-muted)',
            }}
          >
            {p.wavePeriod != null && <span>{p.wavePeriod.toFixed(0)}s</span>}
            {p.waveDir != null && (
              <>
                <WaveArrow fromDeg={p.waveDir} />
                <span>{getCompassDirection(p.waveDir)}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ ...FIGURE_STYLE, color: 'var(--text-muted)' }}>—</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '9.5px', color: 'var(--text-muted)' }}>
            {reading.lastAt ? `No reading since ${formatTimeHHMM(reading.lastAt)}` : 'No reading in 72h'}
          </div>
        </>
      )}
    </div>
  )
}

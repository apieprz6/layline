/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Gust and wave content in the shapes the variants place differently:
 * a tile (B), a one-line strip (C) and a corner readout on the rose (A).
 * All read the moment the rose reads — scrubbed or touched — not "latest".
 *
 * A missing reading renders "—" and one muted line, "No reading since
 * HH:MM". That footnote is the whole explanation, on purpose.
 */

import type { ReactNode } from 'react'
import { getCompassDirection, getWindColorHex } from '@/lib/utils/wind'
import { formatTimeHHMM } from '@/lib/utils/timeFormatting'
import type { ProtoPointWithOffset, Reading } from './readings'

const LABEL = {
  fontFamily: 'var(--font-body)',
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
} as const

const CARD = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-sm)',
} as const

export function Footnote({ lastAt }: { lastAt: Date | null }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: '9.5px', color: 'var(--text-muted)' }}>
      {lastAt ? `No reading since ${formatTimeHHMM(lastAt)}` : 'No reading in 72h'}
    </div>
  )
}

/** Points the way the waves are travelling — "from NE" draws an arrow toward SW. */
export function WaveArrow({ fromDeg, size = 14 }: { fromDeg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flexShrink: 0 }}>
      <g transform={`rotate(${(fromDeg + 180) % 360} 10 10)`}>
        <path d="M10 2 L10 17 M5 7 L10 2 L15 7" fill="none" style={{ stroke: 'var(--accent-primary)' }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function Sparkline({
  points,
  field,
  color,
}: {
  points: ProtoPointWithOffset[] // oldest → newest
  field: 'gust' | 'waveHeight'
  color: string
}) {
  const W = 120
  const H = 28
  const vals = points.map((p) => p[field])
  const real = vals.filter((v): v is number => v !== null)
  if (real.length < 2) return <svg width="100%" height={H} />
  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min || 1
  const segs: string[] = []
  let cur: string[] = []
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) segs.push(cur.join(' L'))
      cur = []
      return
    }
    const x = (i / (vals.length - 1)) * W
    const y = H - 2 - ((v - min) / span) * (H - 4)
    cur.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  })
  if (cur.length > 1) segs.push(cur.join(' L'))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
      {segs.map((d, i) => (
        <path key={i} d={`M${d}`} fill="none" style={{ stroke: color }} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

function Big({ value, unit, color }: { value: string; unit: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 600, lineHeight: 1, color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{unit}</span>
    </span>
  )
}

/* ---------- B: tiles ---------- */

export function GustTile({
  reading,
  windowPoints,
  peak,
  scaleLabel,
  extra,
}: {
  reading: Reading
  windowPoints: ProtoPointWithOffset[]
  peak: number | null
  scaleLabel: string
  extra?: ReactNode
}) {
  const g = reading.point?.gust ?? null
  return (
    <div style={{ ...CARD, padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
        <span style={LABEL}>Gust</span>
        {extra}
      </div>
      {g !== null ? (
        <>
          <Big value={g.toFixed(0)} unit="kts" color={getWindColorHex(g)} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-muted)' }}>
            +{(g - (reading.point?.spd ?? 0)).toFixed(0)} over speed
          </div>
        </>
      ) : (
        <>
          <Big value="—" unit="kts" color="var(--text-muted)" />
          <Footnote lastAt={reading.lastAt} />
        </>
      )}
      <div style={{ marginTop: 'auto' }}>
        <Sparkline points={windowPoints} field="gust" color="#C47000" />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {peak !== null ? `Peak ${peak.toFixed(0)} · ${scaleLabel}` : scaleLabel}
        </div>
      </div>
    </div>
  )
}

export function WaveTile({
  reading,
  windowPoints,
  scaleLabel,
}: {
  reading: Reading
  windowPoints: ProtoPointWithOffset[]
  scaleLabel: string
}) {
  const p = reading.point
  return (
    <div style={{ ...CARD, padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      <span style={LABEL}>Waves</span>
      {p && p.waveHeight !== null ? (
        <>
          <Big value={p.waveHeight.toFixed(1)} unit="ft" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {p.wavePeriod !== null && <span>{p.wavePeriod.toFixed(0)} s</span>}
            {p.waveDir !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                · from {getCompassDirection(p.waveDir)} <WaveArrow fromDeg={p.waveDir} size={12} />
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <Big value="—" unit="ft" color="var(--text-muted)" />
          <Footnote lastAt={reading.lastAt} />
        </>
      )}
      <div style={{ marginTop: 'auto' }}>
        <Sparkline points={windowPoints} field="waveHeight" color="var(--accent-primary)" />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Height · {scaleLabel}
        </div>
      </div>
    </div>
  )
}

/* ---------- C: one-line strip ---------- */

export function WaveStrip({ reading }: { reading: Reading }) {
  const p = reading.point
  const h = p?.waveHeight ?? null
  return (
    <div style={{ ...CARD, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      <span style={LABEL}>Waves</span>
      {p && h !== null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
          <Big value={h.toFixed(1)} unit="ft" />
          {p.wavePeriod !== null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
              {p.wavePeriod.toFixed(0)}
              <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}> s</span>
            </span>
          )}
          {p.waveDir !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600 }}>
              <WaveArrow fromDeg={p.waveDir} />
              {getCompassDirection(p.waveDir)}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <Big value="—" unit="ft" color="var(--text-muted)" />
          <Footnote lastAt={reading.lastAt} />
        </div>
      )}
    </div>
  )
}

/* ---------- A: corner readout on the rose ---------- */

export function WaveCorner({ reading }: { reading: Reading }) {
  const p = reading.point
  return (
    <div style={{ pointerEvents: 'none' }}>
      <div style={{ ...LABEL, fontSize: '8.5px', marginBottom: '1px' }}>Waves</div>
      {p && p.waveHeight !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 600, lineHeight: 1 }}>
              {p.waveHeight.toFixed(1)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>ft</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--text-muted)' }}>
            {p.wavePeriod !== null && <span>{p.wavePeriod.toFixed(0)}s</span>}
            {p.waveDir !== null && (
              <>
                <WaveArrow fromDeg={p.waveDir} size={11} />
                <span>{getCompassDirection(p.waveDir)}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 600, lineHeight: 1, color: 'var(--text-muted)' }}>—</div>
          <Footnote lastAt={reading.lastAt} />
        </>
      )}
    </div>
  )
}

'use client'

import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { AUTOCOMP, CHARTS, RACES, REASON_WORDS, raceName, shortDate, signed } from './data'
import { Big, Chips, Readout, svgPoint, type ChipOption } from './interact'
import { Caption, HatchDef, Segmented } from './Sheet'

/**
 * PROTOTYPE — LAY-149 variant D, the compass. One measurement, two drawings of it: the rose a
 * sailor reads a deviation card as, and the strip that is legible at 390px. They share one state —
 * the overlay and the selected heading — so flipping views never loses your place, which is the
 * reason this is a toggle and not two stacked charts.
 */

type View = 'strip' | 'rose'
type Bins = readonly { m: number | null }[]

const ERA = CHARTS.hdgEras[1]
const BEFORE = CHARTS.hdgEras[0]
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function pointName(centre: number): string {
  return POINTS[Math.round(centre / 22.5) % 16]
}

export default function DCompass(): ReactElement {
  const [view, setView] = useState<View>('strip')
  const [overlay, setOverlay] = useState('before')
  const [bin, setBin] = useState<number | null>(null)
  const race = RACES.find((r) => r.id === overlay)
  const raceBins: Bins | null = race?.hdg.ok ? race.hdg.bins : null

  const chips: ChipOption[] = [
    { id: 'none', label: `Since ${shortDate(AUTOCOMP)}` },
    { id: 'before', label: `+ before ${shortDate(AUTOCOMP)}` },
    ...[...RACES]
      .reverse()
      .filter((r) => r.hdgEra === 2)
      .map((r) => ({
        id: r.id,
        label: `+ ${shortDate(r.date)}`,
        disabledReason: r.hdg.ok ? undefined : REASON_WORDS[r.hdg.reason],
      })),
  ]

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    setBin((b) => (((b ?? (step > 0 ? -1 : 0)) + step + 36) % 36))
  }

  const chart =
    view === 'strip' ? (
      <Strip bin={bin} onBin={setBin} onKey={onKey} showBefore={overlay === 'before'} raceBins={raceBins} />
    ) : (
      <Rose bin={bin} onBin={setBin} onKey={onKey} showBefore={overlay === 'before'} raceBins={raceBins} />
    )

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <div style={{ width: 150 }}>
          <Segmented
            options={[
              { key: 'strip', label: 'Strip' },
              { key: 'rose', label: 'Rose' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>same data · tap a heading</span>
      </div>
      <Chips options={chips} value={overlay} onChange={setOverlay} />
      {chart}
      <Readout>{bin === null ? <Summary /> : <BinDetail bin={bin} raceId={race?.id} />}</Readout>
      <Caption>
        Error at each 10° of heading since the {shortDate(AUTOCOMP)} autocompensation — the resolution the compass builds
        its own deviation table at.{' '}
        {view === 'strip' ? 'Above the line reads high.' : 'Outside the ring reads high, inside reads low.'} Hollow: rests
        on one Race. Hatched: no Race held 3 rows there, and nothing is drawn across it.
        {overlay === 'before' && ' Dashed: before the autocompensation — moved down, same shape.'}
        {race && race.hdg.ok && ` Amber: ${raceName(race)} alone, ${Math.round(race.hdg.coverage)}% of the rose.`}
        {race && !race.hdg.ok && ` ${raceName(race)} has no curve — ${REASON_WORDS[race.hdg.reason]}.`}
      </Caption>
    </div>
  )
}

function Summary(): ReactElement {
  const reached = ERA.bins.filter((b) => b.m !== null) as { c: number; m: number; races: number }[]
  const high = reached.reduce((a, b) => (b.m > a.m ? b : a))
  const low = reached.reduce((a, b) => (b.m < a.m ? b : a))
  return (
    <>
      <Big>
        {signed(high.m, '°')} heading {pointName(high.c)} · {signed(low.m, '°')} heading {pointName(low.c)}
      </Big>
      <div>
        The error swings {(high.m - low.m).toFixed(0)}° with heading — the {signed(ERA.raceMean, '°')} on the card is an
        average of a curve. {ERA.bins.filter((b) => b.races >= 2).length} of 36 headings rest on 2+ Races,{' '}
        {36 - reached.length} on none.
      </div>
    </>
  )
}

function BinDetail({ bin, raceId }: { bin: number; raceId?: string }): ReactElement {
  const now = ERA.bins[bin]
  const was = BEFORE.bins[bin]
  const lo = bin * 10
  const contributors = RACES.filter((r) => r.hdgEra === 2 && r.hdg.ok && r.hdg.bins[bin].n > 0)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <Big>
          {lo}°–{lo + 10}° · {pointName(lo + 5)}
        </Big>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {now.m === null ? 'no figure' : signed(now.m, '°')} now · {was.m === null ? '—' : signed(was.m, '°')} before
        </span>
      </div>
      {contributors.length === 0 ? (
        <div>No Race since {shortDate(AUTOCOMP)} sailed this heading.</div>
      ) : (
        contributors.map((r) => {
          if (!r.hdg.ok) return null
          const b = r.hdg.bins[bin]
          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: r.id === raceId ? 700 : 400,
              }}
            >
              <span>{raceName(r)}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {b.m === null ? `${b.n} row${b.n === 1 ? '' : 's'} — under 3, not counted` : `${signed(b.m, '°')} · ${b.n} rows`}
              </span>
            </div>
          )
        })
      )}
    </>
  )
}

interface ChartProps {
  bin: number | null
  onBin: (bin: number | null) => void
  onKey: (event: KeyboardEvent) => void
  showBefore: boolean
  raceBins: Bins | null
}

/* ------------------------------------------------------------------ strip */

const W = 340
const L = 26
const PW = W - L - 6
const COL = PW / 36

function Strip({ bin, onBin, onKey, showBefore, raceBins }: ChartProps): ReactElement {
  const H = 150
  const mid = 70
  const k = 2.2
  const y = (e: number): number => mid - Math.max(-27, Math.min(27, e)) * k
  const cx = (i: number): number => L + i * COL + COL / 2
  const path = (bins: Bins): string =>
    bins
      .map((b, i) => (b.m === null ? null : `${i === 0 || bins[i - 1].m === null ? 'M' : 'L'} ${cx(i)} ${y(b.m)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 34}`}
      width="100%"
      role="img"
      tabIndex={0}
      aria-label="Compass error by heading. Tap or use arrow keys to pick a heading."
      onKeyDown={onKey}
      onClick={(e) => {
        const { x } = svgPoint(e)
        const i = Math.floor((x - L) / COL)
        onBin(i >= 0 && i < 36 ? (i === bin ? null : i) : null)
      }}
      style={{ display: 'block', cursor: 'pointer', outline: 'none' }}
    >
      <HatchDef id="dc-hatch" />
      {bin !== null && <rect x={L + bin * COL} y={0} width={COL} height={H + 22} fill="var(--state-warning)" opacity="0.14" />}
      {[-20, -10, 10, 20].map((e) => (
        <g key={e}>
          <line x1={L} x2={W - 6} y1={y(e)} y2={y(e)} stroke="var(--surface-divider)" strokeDasharray="2 3" />
          <text x={L - 4} y={y(e) + 3} fontSize="7.5" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {e > 0 ? `+${e}` : e}
          </text>
        </g>
      ))}
      <line x1={L} x2={W - 6} y1={mid} y2={mid} stroke="var(--text-muted)" />
      <text x={L - 4} y={mid + 3} fontSize="7.5" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">0°</text>
      {ERA.bins.map((b, i) => {
        const x = L + i * COL
        if (b.m === null) return <rect key={b.c} x={x + 0.5} y={y(22)} width={COL - 1} height={y(-22) - y(22)} fill="url(#dc-hatch)" />
        const thin = b.races === 1
        return (
          <rect
            key={b.c}
            x={x + 1}
            y={Math.min(y(b.m), mid)}
            width={COL - 2}
            height={Math.max(1, Math.abs(y(b.m) - mid))}
            fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'}
            stroke="var(--text-accent)"
            strokeWidth="0.8"
            opacity={thin ? 1 : 0.8}
          />
        )
      })}
      {showBefore && <path d={path(BEFORE.bins)} fill="none" stroke="var(--text-primary)" strokeWidth="1.6" strokeDasharray="4 3" />}
      {raceBins && <path d={path(raceBins)} fill="none" stroke="var(--state-warning)" strokeWidth="2" />}
      {[0, 90, 180, 270, 360].map((h) => (
        <text key={h} x={L + (h / 360) * PW} y={H - 6} fontSize="8.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
          {['N', 'E', 'S', 'W', 'N'][h / 90]}
        </text>
      ))}
      <text x={L - 4} y={H + 14} fontSize="7" textAnchor="end" fill="var(--text-muted)">races</text>
      {ERA.bins.map((b, i) => (
        <g key={`ev-${b.c}`}>
          <rect
            x={L + i * COL + 0.5}
            y={H + 4}
            width={COL - 1}
            height={14}
            fill={b.races === 0 ? 'url(#dc-hatch)' : 'var(--text-primary)'}
            opacity={b.races === 0 ? 1 : 0.08 + 0.12 * b.races}
          />
          <text x={cx(i)} y={H + 14} fontSize="6.5" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-mono)">
            {b.races || ''}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ rose */

const CX = 160
const CY = 160
const R0 = 88
const PX = 2.4

function polar(heading: number, error: number): [number, number] {
  const r = R0 + Math.max(-27, Math.min(27, error)) * PX
  const a = ((heading - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function wedge(centre: number, inner: number, outer: number): string {
  const a0 = ((centre - 5 - 90) * Math.PI) / 180
  const a1 = ((centre + 5 - 90) * Math.PI) / 180
  const p = (r: number, a: number): string => `${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`
  return `M ${p(inner, a0)} L ${p(outer, a0)} A ${outer} ${outer} 0 0 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 0 0 ${p(inner, a0)} Z`
}

/** Polylines through bin centres, broken at every empty bin and closed across north only when both sides exist. */
function runs(bins: Bins): [number, number][][] {
  const out: [number, number][][] = []
  let current: [number, number][] = []
  bins.forEach((b, i) => {
    if (b.m === null) {
      if (current.length) out.push(current)
      current = []
      return
    }
    current.push(polar(i * 10 + 5, b.m))
  })
  if (current.length) out.push(current)
  if (bins[0].m !== null && bins[35].m !== null) {
    if (out.length > 1) {
      const last = out.pop() ?? []
      out[0] = [...last, ...out[0]]
    } else if (out.length === 1) {
      out[0] = [...out[0], out[0][0]]
    }
  }
  return out
}

function Rose({ bin, onBin, onKey, showBefore, raceBins }: ChartProps): ReactElement {
  const line = (bins: Bins, stroke: string, width: number, dash?: string): ReactElement[] =>
    runs(bins).map((run, i) => (
      <polyline key={`${stroke}-${i}`} points={run.map((p) => p.join(',')).join(' ')} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" />
    ))

  return (
    <svg
      viewBox="0 0 320 320"
      width="100%"
      role="img"
      tabIndex={0}
      aria-label="Compass error by heading, on a rose. Tap or use arrow keys to pick a heading."
      onKeyDown={onKey}
      onClick={(e) => {
        const { x, y } = svgPoint(e)
        const dx = x - CX
        const dy = y - CY
        if (Math.hypot(dx, dy) < 24) return onBin(null)
        const heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
        const i = Math.floor(heading / 10)
        onBin(i === bin ? null : i)
      }}
      style={{ display: 'block', cursor: 'pointer', outline: 'none', maxWidth: 340, margin: '0 auto' }}
    >
      <HatchDef id="dr-hatch" />
      {[-20, -10, 10, 20].map((e) => (
        <circle key={e} cx={CX} cy={CY} r={R0 + e * PX} fill="none" stroke="var(--surface-divider)" strokeDasharray="2 3" />
      ))}
      <circle cx={CX} cy={CY} r={R0} fill="none" stroke="var(--text-muted)" />
      {ERA.bins.map((b, i) =>
        b.m === null ? <path key={b.c} d={wedge(i * 10 + 5, R0 - 22 * PX, R0 + 22 * PX)} fill="url(#dr-hatch)" /> : null
      )}
      {bin !== null && <path d={wedge(bin * 10 + 5, R0 - 27 * PX, R0 + 27 * PX)} fill="var(--state-warning)" opacity="0.16" />}
      {[0, 90, 180, 270].map((h) => {
        const [x, y] = polar(h, 30)
        return (
          <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-muted)">
            {['N', 'E', 'S', 'W'][h / 90]}
          </text>
        )
      })}
      <text x={CX + 3} y={CY - R0 - 10 * PX + 3} fontSize="7.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">+10°</text>
      <text x={CX + 3} y={CY - R0 + 3} fontSize="7.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">0°</text>
      {line(ERA.bins, 'var(--text-accent)', 2.2)}
      {showBefore && line(BEFORE.bins, 'var(--text-primary)', 1.5, '4 3')}
      {raceBins && line(raceBins, 'var(--state-warning)', 2)}
      {ERA.bins.map((b, i) => {
        if (b.m === null) return null
        const [x, y] = polar(i * 10 + 5, b.m)
        const thin = b.races === 1
        return <circle key={b.c} cx={x} cy={y} r={thin ? 2.4 : 3} fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'} stroke="var(--text-accent)" strokeWidth="1.2" />
      })}
    </svg>
  )
}

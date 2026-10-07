'use client'

import { useState, type ReactElement } from 'react'
import {
  AUTOCOMP,
  CHARTS,
  RACES,
  allPairs,
  raceName,
  shortDate,
  signed,
  type Channel,
  type Race,
} from './data'
import { Caption, Eyebrow, HatchDef, Segmented, Stat, StatRow } from './Sheet'

/**
 * PROTOTYPE — LAY-149 variant A, **Rose & overlay**.
 *
 * The position: draw each figure the way a sailor already reads it — a deviation card is a rose —
 * and put both levels on one chart, the season as the line and every Race as faint dots under it.
 * Trust stays LAY-147's σ band; coverage is printed but does not move the verdict.
 */
export const NAME = 'Rose & overlay'

export const TRUST = {
  rule: 'σ band (LAY-147, unchanged)',
  verdict(channel: Channel): { word: string; why: string } {
    if (channel === 'hdg') {
      const era = CHARTS.hdgEras[1]
      return band(era.raceMean, era.raceStd, `${signed(era.raceMean, '°')} against ±${era.raceStd.toFixed(1)}° race-to-race`)
    }
    if (channel === 'awa') {
      const offs = RACES.flatMap((r) => (r.awa.ok ? [r.awa.overall] : []))
      return band(mean(offs), sd(offs), `${signed(mean(offs), '°')} against ±${sd(offs).toFixed(1)}° race-to-race`)
    }
    const biases = RACES.flatMap((r) => (r.stw.fit ? [r.stw.fit.bias] : []))
    return band(CHARTS.stwEra.fit.bias, sd(biases), `${signed(CHARTS.stwEra.fit.bias, ' kt', 2)} against ±${sd(biases).toFixed(2)} kt race-to-race`)
  },
}

function band(value: number, spread: number, why: string): { word: string; why: string } {
  const ratio = Math.abs(value) / spread
  return { word: ratio <= 1 ? 'WITHIN NOISE' : ratio <= 2 ? 'WORTH WATCHING' : 'CLEARLY OFF', why }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sd(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1))
}

export function Drawer({ channel }: { channel: Channel }): ReactElement {
  if (channel === 'hdg') return <Rose />
  if (channel === 'awa') return <Strips />
  return <Scatter />
}

/* ------------------------------------------------------------------ HDG: the rose */

const CX = 160
const CY = 160
const R0 = 88
const PX_PER_DEG = 2.6

function polar(headingDeg: number, errorDeg: number): [number, number] {
  const r = R0 + Math.max(-26, Math.min(26, errorDeg)) * PX_PER_DEG
  const a = ((headingDeg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function wedge(centre: number, inner: number, outer: number): string {
  const a0 = ((centre - 5 - 90) * Math.PI) / 180
  const a1 = ((centre + 5 - 90) * Math.PI) / 180
  const p = (r: number, a: number): string => `${CX + r * Math.cos(a)} ${CY + r * Math.sin(a)}`
  return `M ${p(inner, a0)} L ${p(outer, a0)} A ${outer} ${outer} 0 0 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 0 0 ${p(inner, a0)} Z`
}

function Rose(): ReactElement {
  const [eraIndex, setEra] = useState<0 | 1>(1)
  const era = CHARTS.hdgEras[eraIndex]
  const members = RACES.filter((r) => r.hdgEra === era.era)

  // The season line, broken wherever a bin has no Race behind it — never bridged.
  const runs: [number, number][][] = []
  let current: [number, number][] = []
  era.bins.forEach((b) => {
    if (b.m === null) {
      if (current.length) runs.push(current)
      current = []
      return
    }
    current.push(polar(b.c, b.m))
  })
  if (current.length) runs.push(current)
  // Close across north only when both 355° and 5° are present.
  const wraps = era.bins[0].m !== null && era.bins[35].m !== null && runs.length > 1
  if (wraps) {
    const last = runs.pop() ?? []
    runs[0] = [...last, ...runs[0]]
  }
  const closed = wraps && runs.length === 1 && era.bins.every((b) => b.m !== null)

  return (
    <div>
      <Segmented
        options={[
          { key: '1', label: `Since ${shortDate(AUTOCOMP)} · ${CHARTS.hdgEras[1].races} races` },
          { key: '0', label: `Before · ${CHARTS.hdgEras[0].races} races` },
        ]}
        value={String(eraIndex)}
        onChange={(k) => setEra(k === '1' ? 1 : 0)}
      />
      <svg viewBox="0 0 320 320" width="100%" role="img" aria-label="Compass deviation by heading, on a rose" style={{ display: 'block', marginTop: 8 }}>
        <HatchDef id="a-hatch" />
        {[-20, -10, 10, 20].map((e) => (
          <circle key={e} cx={CX} cy={CY} r={R0 + e * PX_PER_DEG} fill="none" stroke="var(--surface-divider)" strokeDasharray="2 3" />
        ))}
        <circle cx={CX} cy={CY} r={R0} fill="none" stroke="var(--text-muted)" strokeWidth="1" />
        {era.bins
          .filter((b) => b.m === null)
          .map((b) => (
            <path key={b.c} d={wedge(b.c, R0 - 20 * PX_PER_DEG, R0 + 20 * PX_PER_DEG)} fill="url(#a-hatch)" stroke="var(--surface-border)" strokeWidth="0.5" />
          ))}
        {[0, 90, 180, 270].map((h) => {
          const [x, y] = polar(h, 27)
          return (
            <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--text-muted)">
              {['N', 'E', 'S', 'W'][h / 90]}
            </text>
          )
        })}
        <text x={CX} y={CY - R0 - 10 * PX_PER_DEG + 3} textAnchor="middle" fontSize="7.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">+10°</text>
        <text x={CX} y={CY - R0 + 3} textAnchor="middle" fontSize="7.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">0°</text>
        {members.flatMap((race) =>
          race.hdg.ok
            ? race.hdg.bins
                .filter((b) => b.m !== null)
                .map((b) => {
                  const [x, y] = polar(b.c, b.m as number)
                  return <circle key={`${race.id}-${b.c}`} cx={x} cy={y} r="2" fill="var(--text-muted)" opacity="0.35" />
                })
            : []
        )}
        {runs.map((run, i) => (
          <polyline
            key={i}
            points={(closed ? [...run, run[0]] : run).map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke="var(--text-accent)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        ))}
        {era.bins.map((b) => {
          if (b.m === null) return null
          const [x, y] = polar(b.c, b.m)
          return <circle key={b.c} cx={x} cy={y} r={b.races === 1 ? 2.4 : 3} fill={b.races === 1 ? 'var(--surface-raised)' : 'var(--text-accent)'} stroke="var(--text-accent)" strokeWidth="1.2" />
        })}
      </svg>
      <Caption>
        Distance from the ring is the error at that heading — outside reads high, inside reads low. The line is the season,
        each faint dot one Race’s own 10° bin. A hollow point rests on a single Race. Hatched sectors: no Race held 3 rows
        on that heading, so the line breaks there rather than guessing.
      </Caption>
      <StatRow>
        <Stat label="mean of bins" value={signed(era.binMean, '°')} />
        <Stat label={`race mean ±σ`} value={`${signed(era.raceMean, '°')} ±${era.raceStd.toFixed(1)}`} />
        <Stat label="of the rose" value={`${Math.round(era.coverage)}%`} />
        {era.worst && <Stat label={`worst · ${era.worst.c}° · ${era.worst.races} races`} value={signed(era.worst.m, '°')} />}
      </StatRow>
    </div>
  )
}

/* ------------------------------------------------------------------ AWA: two strips */

function Strips(): ReactElement {
  const pairs = allPairs()
  const W = 320
  const x = (deg: number): number => 30 + ((deg + 14) / 28) * (W - 60)
  const rows: { pos: 'upwind' | 'downwind'; label: string }[] = [
    { pos: 'upwind', label: 'Upwind · AWA < 50°' },
    { pos: 'downwind', label: 'Downwind · AWA > 110°' },
  ]
  return (
    <div>
      {rows.map(({ pos, label }) => {
        const these = pairs.filter((p) => p.pos === pos)
        const m = these.length ? mean(these.map((p) => p.off)) : null
        return (
          <div key={pos} style={{ marginBottom: 6 }}>
            <Eyebrow>
              {label} · {these.length} pair{these.length === 1 ? '' : 's'} from {new Set(these.map((p) => p.race.id)).size} races
            </Eyebrow>
            <svg viewBox={`0 0 ${W} 56`} width="100%" role="img" aria-label={`${pos} tack pairs`}>
              <line x1={x(-14)} x2={x(14)} y1="30" y2="30" stroke="var(--surface-border)" />
              <line x1={x(0)} x2={x(0)} y1="8" y2="46" stroke="var(--text-muted)" strokeDasharray="2 2" />
              {[-10, -5, 5, 10].map((d) => (
                <text key={d} x={x(d)} y="54" fontSize="7.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                  {d > 0 ? `+${d}` : d}°
                </text>
              ))}
              {these.map((p, i) => (
                <circle
                  key={i}
                  cx={x(p.off)}
                  cy={30 + ((i % 3) - 1) * 7}
                  r="4"
                  fill={p.race.date < AUTOCOMP ? 'var(--surface-raised)' : 'var(--text-accent)'}
                  stroke="var(--text-accent)"
                  strokeWidth="1.2"
                />
              ))}
              {m !== null && <line x1={x(m)} x2={x(m)} y1="12" y2="48" stroke="var(--state-warning)" strokeWidth="2" />}
            </svg>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {m === null ? 'no pairs' : `${signed(m, '°')} · mean of pairs`}
            </div>
          </div>
        )
      })}
      <Caption>
        Each dot is one tack pair: a steady starboard segment and a steady port one at the same point of sail, within five
        minutes. Hollow dots are before the {shortDate(AUTOCOMP)} compass autocompensation, filled after. Reaching is
        discarded. Upwind and downwind are kept apart because they disagree — {signed(CHARTS.awaEra.up, '°')} against{' '}
        {signed(CHARTS.awaEra.down, '°')} as means of each Race’s own figure — and a vane misalignment would read the
        same sign on both, which is part of why this is not called a vane offset.
      </Caption>
    </div>
  )
}

/* ------------------------------------------------------------------ STW: the scatter */

function Scatter(): ReactElement {
  const [focus, setFocus] = useState<string>('')
  const S = 300
  const pad = 26
  const k = (S - pad - 8) / 10
  const px = (stw: number): number => pad + stw * k
  const py = (sog: number): number => S - pad - sog * k
  const era = CHARTS.stwEra
  const picked: Race | undefined = RACES.find((r) => r.id === focus)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
        {[{ id: '', label: 'Season' }, ...RACES.map((r) => ({ id: r.id, label: shortDate(r.date) }))].map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setFocus(o.id)}
            style={{
              flexShrink: 0,
              border: '1px solid var(--surface-border)',
              borderRadius: 9999,
              padding: '3px 8px',
              fontSize: 10,
              background: focus === o.id ? 'var(--text-primary)' : 'transparent',
              color: focus === o.id ? 'var(--text-inverse)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" role="img" aria-label="SOG against STW">
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={px(v)} x2={px(v)} y1={py(0)} y2={py(10)} stroke="var(--surface-divider)" />
            <line x1={px(0)} x2={px(10)} y1={py(v)} y2={py(v)} stroke="var(--surface-divider)" />
            <text x={px(v)} y={S - 10} fontSize="8" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">{v}</text>
            <text x={12} y={py(v) + 3} fontSize="8" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">{v}</text>
          </g>
        ))}
        <text x={S - 8} y={S - 18} fontSize="8" textAnchor="end" fill="var(--text-muted)">STW kt</text>
        <text x={pad + 4} y={14} fontSize="8" fill="var(--text-muted)">SOG kt</text>
        {RACES.flatMap((r) =>
          r.stw.xy.map(([s, g], i) => (
            <circle key={`${r.id}-${i}`} cx={px(s)} cy={py(g)} r="1.3" fill="var(--text-muted)" opacity={picked ? 0.12 : 0.28} />
          ))
        )}
        {picked?.stw.xy.map(([s, g], i) => (
          <circle key={`p-${i}`} cx={px(s)} cy={py(g)} r="2.2" fill="var(--state-warning)" opacity="0.8" />
        ))}
        <line x1={px(0)} y1={py(0)} x2={px(10)} y2={py(10)} stroke="var(--text-primary)" strokeDasharray="4 3" />
        <line x1={px(era.line[0][0])} y1={py(era.line[0][1])} x2={px(era.line[1][0])} y2={py(era.line[1][1])} stroke="var(--text-accent)" strokeWidth="2" />
        {picked?.stw.line && (
          <line x1={px(picked.stw.line[0][0])} y1={py(picked.stw.line[0][1])} x2={px(picked.stw.line[1][0])} y2={py(picked.stw.line[1][1])} stroke="var(--state-warning)" strokeWidth="2" />
        )}
      </svg>
      <Caption>
        Dashed: the paddlewheel as currently configured (1:1). Blue: the season’s fit, every Race weighted equally.
        {picked
          ? picked.stw.fit
            ? ` Amber: ${raceName(picked)} — ${picked.stw.points} rows, its own fit.`
            : ` Amber: ${raceName(picked)} — ${picked.stw.points} rows, no line of its own (SOG spread ${picked.stw.spread} kt, under 3).`
          : ' Pick a Race to lift its rows out of the season.'}
      </Caption>
      <StatRow>
        <Stat label="gap from 1:1" value={signed(era.fit.bias, ' kt', 2)} />
        <Stat label="R²" value={era.fit.r2.toFixed(2)} />
        <Stat label="rows · races" value={`${era.points} · ${era.races}`} />
        <Stat label="rows with no STW" value={`${era.blank}`} />
      </StatRow>
    </div>
  )
}

/* ------------------------------------------------------------------ per-Race tile */

export function RaceTile({ race }: { race: Race }): ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      <Stat label="compass" value={race.hdg.ok ? signed(race.hdg.mean, '°') : '—'} />
      <Stat label="asymmetry" value={race.awa.ok ? signed(race.awa.overall, '°') : '—'} />
      <Stat label="speed gap" value={race.stw.fit ? signed(race.stw.fit.bias, ' kt', 2) : '—'} />
    </div>
  )
}

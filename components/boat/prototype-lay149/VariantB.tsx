'use client'

import { useState, type ReactElement } from 'react'
import {
  AUTOCOMP,
  CHARTS,
  RACES,
  REASON_WORDS,
  allPairs,
  raceName,
  shortDate,
  signed,
  type Channel,
  type Race,
} from './data'
import { Caption, Eyebrow, HatchDef, Segmented, Stat, StatRow } from './Sheet'

/**
 * PROTOTYPE — LAY-149 variant B, **Strip & evidence**.
 *
 * The position: legibility at 390px beats the sailor's native form, so every chart is a linear
 * strip with an *evidence row* under it saying how much each part rests on. The level is a toggle —
 * the era, or one Race — never both at once. And trust is **coverage, not scatter**: the σ band is
 * gone, replaced by a word for how much of the measurement exists at all.
 */
export const NAME = 'Strip & evidence'

type Evidence = 'SOLID' | 'THIN' | 'ANECDOTAL'

/** Prototype thresholds, deliberately crude — the question is whether coverage is the right axis. */
function evidenceOf(share: number): Evidence {
  return share >= 2 / 3 ? 'SOLID' : share >= 1 / 3 ? 'THIN' : 'ANECDOTAL'
}

export const TRUST = {
  rule: 'coverage replaces σ',
  verdict(channel: Channel): { word: string; why: string } {
    if (channel === 'hdg') {
      const era = CHARTS.hdgEras[1]
      const solid = era.bins.filter((b) => b.races >= 2).length
      return { word: evidenceOf(solid / 36), why: `${solid} of 36 headings rest on 2+ races` }
    }
    if (channel === 'awa') {
      const e = CHARTS.awaEra
      return {
        word: 'ANECDOTAL',
        why: `${e.upPairs} upwind pairs, ${e.downPairs} downwind — one side barely exists`,
      }
    }
    const fitted = RACES.filter((r) => r.stw.fit).length
    return { word: evidenceOf(fitted / RACES.length), why: `${fitted} of ${RACES.length} races carry their own line` }
  },
}

type Level = { kind: 'era'; era: 0 | 1 } | { kind: 'race'; id: string }

function LevelPicker({
  level,
  onChange,
  eras,
}: {
  level: Level
  onChange: (l: Level) => void
  eras: boolean
}): ReactElement {
  const key = level.kind === 'era' ? `era-${level.era}` : 'race'
  const options = eras
    ? [
        { key: 'era-1', label: `Since ${shortDate(AUTOCOMP)}` },
        { key: 'era-0', label: 'Before' },
        { key: 'race', label: 'One race' },
      ]
    : [
        { key: 'era-1', label: 'Season' },
        { key: 'race', label: 'One race' },
      ]
  return (
    <div>
      <Segmented
        options={options}
        value={key}
        onChange={(k) =>
          onChange(
            k === 'race'
              ? { kind: 'race', id: level.kind === 'race' ? level.id : RACES[RACES.length - 1].id }
              : { kind: 'era', era: k === 'era-1' ? 1 : 0 }
          )
        }
      />
      {level.kind === 'race' && (
        <select
          value={level.id}
          onChange={(e) => onChange({ kind: 'race', id: e.target.value })}
          style={{
            marginTop: 6,
            width: '100%',
            fontSize: 12,
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid var(--surface-border)',
            background: 'var(--surface-raised)',
            color: 'var(--text-primary)',
          }}
        >
          {RACES.map((r) => (
            <option key={r.id} value={r.id}>
              {raceName(r)} · {r.hours} h
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function Drawer({ channel }: { channel: Channel }): ReactElement {
  if (channel === 'hdg') return <Strip />
  if (channel === 'awa') return <Dumbbells />
  return <Residuals />
}

/* ------------------------------------------------------------------ HDG: linear strip */

const W = 340
const L = 26
const PW = W - L - 6
const colW = PW / 36

function Strip(): ReactElement {
  const [level, setLevel] = useState<Level>({ kind: 'era', era: 1 })
  const race = level.kind === 'race' ? RACES.find((r) => r.id === level.id) : undefined
  const era = level.kind === 'era' ? CHARTS.hdgEras[level.era] : undefined

  const bins: { c: number; m: number | null; ev: number }[] = era
    ? era.bins.map((b) => ({ c: b.c, m: b.m, ev: b.races }))
    : race && race.hdg.ok
      ? race.hdg.bins.map((b) => ({ c: b.c, m: b.m, ev: b.n }))
      : []

  const H = 150
  const mid = 70
  const k = 2.4
  const y = (e: number): number => mid - Math.max(-26, Math.min(26, e)) * k
  const evMax = era ? Math.max(...bins.map((b) => b.ev), 1) : 12

  return (
    <div>
      <LevelPicker level={level} onChange={setLevel} eras />
      {race && !race.hdg.ok ? (
        <Caption>
          {raceName(race)} produced no compass figure — {REASON_WORDS[race.hdg.reason]} ({race.hdg.points}).
        </Caption>
      ) : (
        <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label="Compass error by heading" style={{ display: 'block', marginTop: 8 }}>
          <HatchDef id="b-hatch" />
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
          {bins.map((b, i) => {
            const x = L + i * colW
            if (b.m === null) {
              return <rect key={b.c} x={x + 0.5} y={y(20)} width={colW - 1} height={y(-20) - y(20)} fill="url(#b-hatch)" />
            }
            const top = Math.min(y(b.m), mid)
            const thin = era ? b.ev === 1 : false
            return (
              <rect
                key={b.c}
                x={x + 1}
                y={top}
                width={colW - 2}
                height={Math.max(1, Math.abs(y(b.m) - mid))}
                fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'}
                stroke="var(--text-accent)"
                strokeWidth="0.8"
                opacity={thin ? 1 : 0.85}
              />
            )
          })}
          {[0, 90, 180, 270, 360].map((h) => (
            <text key={h} x={L + (h / 360) * PW} y={H - 6} fontSize="8.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {['N', 'E', 'S', 'W', 'N'][h / 90]}
            </text>
          ))}
          <text x={L - 4} y={H + 14} fontSize="7" textAnchor="end" fill="var(--text-muted)">{era ? 'races' : 'rows'}</text>
          {bins.map((b, i) => (
            <g key={`ev-${b.c}`}>
              <rect
                x={L + i * colW + 0.5}
                y={H + 4}
                width={colW - 1}
                height={14}
                fill={b.ev === 0 ? 'url(#b-hatch)' : 'var(--text-primary)'}
                opacity={b.ev === 0 ? 1 : 0.08 + 0.5 * Math.min(1, b.ev / evMax)}
              />
              <text x={L + i * colW + colW / 2} y={H + 14} fontSize="6.5" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-mono)">
                {b.ev === 0 ? '' : b.ev > 99 ? '∞' : b.ev}
              </text>
            </g>
          ))}
        </svg>
      )}
      <Caption>
        One column per 10° of heading — the resolution the compass builds its own deviation table at. Above the line reads
        high. The bottom row is what each column rests on: {era ? 'how many Races reached it' : 'how many rows this Race had there — under 3 draws no bar'}.
        Hatched: nothing at all. {era ? 'A hollow bar rests on one Race.' : ''}
      </Caption>
      {era && (
        <StatRow>
          <Stat label="rests on" value={`${era.bins.filter((b) => b.races >= 2).length}/36 headings`} />
          <Stat label="reached at all" value={`${era.bins.filter((b) => b.races >= 1).length}/36`} />
          <Stat label="mean of bins" value={signed(era.binMean, '°')} />
          {era.worst && <Stat label={`worst · ${era.worst.c}° · ${era.worst.races} races`} value={signed(era.worst.m, '°')} />}
        </StatRow>
      )}
      {race && race.hdg.ok && (
        <StatRow>
          <Stat label="of the rose" value={`${Math.round(race.hdg.coverage)}%`} />
          <Stat label="valid rows" value={`${race.hdg.points}`} />
          <Stat label="mean" value={signed(race.hdg.mean, '°')} />
          <Stat label="worst row" value={`${race.hdg.maxAbs.toFixed(0)}°`} />
        </StatRow>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ AWA: dumbbells */

function Dumbbells(): ReactElement {
  const [level, setLevel] = useState<Level>({ kind: 'era', era: 1 })
  const all = allPairs()
  const pairs = level.kind === 'race' ? all.filter((p) => p.race.id === level.id) : all
  const race = level.kind === 'race' ? RACES.find((r) => r.id === level.id) : undefined

  const group = (pos: 'upwind' | 'downwind', lo: number, hi: number): ReactElement => {
    const these = pairs.filter((p) => p.pos === pos)
    const x = (deg: number): number => 70 + ((deg - lo) / (hi - lo)) * 210
    return (
      <div>
        <Eyebrow>
          {pos === 'upwind' ? 'Upwind' : 'Downwind'} · {these.length} pair{these.length === 1 ? '' : 's'}
        </Eyebrow>
        {these.length === 0 ? (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>No pairs.</div>
        ) : (
          <svg viewBox={`0 0 340 ${these.length * 15 + 16}`} width="100%" role="img" aria-label={`${pos} pairs, starboard and port angle`}>
            {[lo, (lo + hi) / 2, hi].map((d) => (
              <text key={d} x={x(d)} y={these.length * 15 + 13} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                {d}°
              </text>
            ))}
            {these.map((p, i) => {
              const yy = i * 15 + 8
              const s = Math.abs(p.stbd)
              const q = Math.abs(p.port)
              return (
                <g key={i}>
                  <text x="0" y={yy + 3} fontSize="7.5" fill="var(--text-muted)" fontFamily="var(--font-mono)">
                    {shortDate(p.race.date)} {p.t}
                  </text>
                  <line x1={x(s)} x2={x(q)} y1={yy} y2={yy} stroke="var(--surface-border)" strokeWidth="2" />
                  <circle cx={x(s)} cy={yy} r="3.5" fill="var(--wind-light)" />
                  <circle cx={x(q)} cy={yy} r="3.5" fill="var(--surface-raised)" stroke="var(--state-danger)" strokeWidth="1.5" />
                  <text x="338" y={yy + 3} fontSize="8" textAnchor="end" fill="var(--text-secondary)" fontFamily="var(--font-mono)">
                    {signed(p.off, '°')}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    )
  }

  return (
    <div>
      <LevelPicker level={level} onChange={setLevel} eras={false} />
      {race && !race.awa.ok && (
        <Caption>
          {raceName(race)} produced no asymmetry — {REASON_WORDS[race.awa.reason]}.
        </Caption>
      )}
      {group('upwind', 15, 50)}
      {group('downwind', 110, 180)}
      <Caption>
        Each line is one tack pair: the apparent wind angle held on starboard (filled) and on port (ring). A symmetric
        instrument puts both ends in the same place. The figure on the right is half the difference. Reaching is
        discarded; 5 minutes is the longest gap a pair may span.
      </Caption>
      <StatRow>
        <Stat label={`upwind · ${CHARTS.awaEra.upPairs} pairs`} value={signed(CHARTS.awaEra.up, '°')} />
        <Stat label={`downwind · ${CHARTS.awaEra.downPairs} pairs`} value={signed(CHARTS.awaEra.down, '°')} />
        <Stat label="races with a pair" value={`${CHARTS.awaEra.races}/${RACES.length}`} />
      </StatRow>
    </div>
  )
}

/* ------------------------------------------------------------------ STW: residual strip */

export function Residuals(): ReactElement {
  const [level, setLevel] = useState<Level>({ kind: 'era', era: 1 })
  const race = level.kind === 'race' ? RACES.find((r) => r.id === level.id) : undefined
  const source: Race[] = race ? [race] : RACES

  // 1 kt STW bins of SOG − STW. In the season each Race is weighted equally inside a bin.
  const bins = Array.from({ length: 10 }, (_, b) => {
    const perRace = source
      .map((r) => r.stw.xy.filter(([s]) => s >= b && s < b + 1).map(([s, g]) => g - s))
      .filter((v) => v.length > 0)
    const rows = perRace.reduce((a, v) => a + v.length, 0)
    const m = perRace.length ? perRace.map((v) => v.reduce((a, x) => a + x, 0) / v.length).reduce((a, x) => a + x, 0) / perRace.length : null
    return { b, m, rows, races: perRace.length }
  })

  const H = 150
  const mid = 75
  const k = 40
  const x = (stw: number): number => 26 + stw * 31
  const y = (gap: number): number => mid - Math.max(-1.6, Math.min(1.6, gap)) * k

  return (
    <div>
      <LevelPicker level={level} onChange={setLevel} eras={false} />
      <svg viewBox={`0 0 340 ${H + 34}`} width="100%" role="img" aria-label="SOG minus STW by boat speed" style={{ display: 'block', marginTop: 8 }}>
        <HatchDef id="b-hatch2" />
        {[-1, -0.5, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={26} x2={336} y1={y(g)} y2={y(g)} stroke="var(--surface-divider)" strokeDasharray="2 3" />
            <text x={22} y={y(g) + 3} fontSize="7.5" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {g > 0 ? `+${g}` : g}
            </text>
          </g>
        ))}
        <line x1={26} x2={336} y1={mid} y2={mid} stroke="var(--text-primary)" strokeDasharray="4 3" />
        <text x={334} y={mid - 4} fontSize="7.5" textAnchor="end" fill="var(--text-muted)">1:1 · as configured</text>
        {source.flatMap((r) =>
          r.stw.xy.map(([s, g], i) => (
            <circle key={`${r.id}-${i}`} cx={x(s)} cy={y(g - s)} r="1.2" fill="var(--text-muted)" opacity={race ? 0.5 : 0.18} />
          ))
        )}
        {bins.map((b) =>
          b.m === null ? (
            <rect key={b.b} x={x(b.b) + 1} y={y(1.5)} width={29} height={y(-1.5) - y(1.5)} fill="url(#b-hatch2)" />
          ) : (
            <line key={b.b} x1={x(b.b) + 4} x2={x(b.b + 1) - 4} y1={y(b.m)} y2={y(b.m)} stroke="var(--text-accent)" strokeWidth="3" />
          )
        )}
        {Array.from({ length: 11 }, (_, v) => (
          <text key={v} x={x(v)} y={H - 4} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {v}
          </text>
        ))}
        <text x={336} y={H + 1} fontSize="7" textAnchor="end" fill="var(--text-muted)">STW kt</text>
        <text x={22} y={H + 15} fontSize="7" textAnchor="end" fill="var(--text-muted)">rows</text>
        {bins.map((b) => (
          <g key={`ev-${b.b}`}>
            <rect x={x(b.b) + 1} y={H + 5} width={29} height={14} fill={b.rows === 0 ? 'url(#b-hatch2)' : 'var(--text-primary)'} opacity={b.rows === 0 ? 1 : 0.08 + 0.5 * Math.min(1, b.rows / 500)} />
            <text x={x(b.b) + 15.5} y={H + 15} fontSize="7" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-mono)">
              {b.rows || ''}
            </text>
          </g>
        ))}
      </svg>
      <Caption>
        The same rows as a SOG-on-STW scatter, turned so the 1:1 line lies flat: height is how far GPS speed sits above
        the paddlewheel. Blue bars are the gap in each 1 kt band{race ? '' : ', every Race weighted equally'} — the
        gap is not one number, it opens as the boat speeds up.
      </Caption>
      <StatRow>
        {race ? (
          <>
            <Stat label="gap from 1:1" value={race.stw.fit ? signed(race.stw.fit.bias, ' kt', 2) : '—'} />
            <Stat label="R²" value={race.stw.fit ? race.stw.fit.r2.toFixed(2) : '—'} />
            <Stat label="SOG spread" value={`${race.stw.spread ?? 0} kt`} />
            {!race.stw.fit && <Stat label="no line" value={REASON_WORDS[race.stw.gate ?? ''] ?? ''} />}
          </>
        ) : (
          <>
            <Stat label="gap from 1:1" value={signed(CHARTS.stwEra.fit.bias, ' kt', 2)} />
            <Stat label="R²" value={CHARTS.stwEra.fit.r2.toFixed(2)} />
            <Stat label="races with own line" value={`${RACES.filter((r) => r.stw.fit).length}/${RACES.length}`} />
          </>
        )}
      </StatRow>
    </div>
  )
}

/* ------------------------------------------------------------------ per-Race tile */

function Bar({ share }: { share: number }): ReactElement {
  return (
    <div style={{ height: 4, background: 'var(--surface-divider)', borderRadius: 2, marginTop: 4 }}>
      <div style={{ width: `${Math.round(share * 100)}%`, height: 4, background: 'var(--text-primary)', borderRadius: 2 }} />
    </div>
  )
}

export function RaceTile({ race }: { race: Race }): ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <div>
        <Stat label={race.hdg.ok ? `${Math.round(race.hdg.coverage)}% of the rose` : REASON_WORDS[race.hdg.reason]} value={race.hdg.ok ? signed(race.hdg.mean, '°') : '—'} />
        <Bar share={race.hdg.ok ? race.hdg.coverage / 100 : 0} />
      </div>
      <div>
        <Stat label={race.awa.ok ? `${race.awa.pairs.length} pair${race.awa.pairs.length === 1 ? '' : 's'}` : REASON_WORDS[race.awa.reason]} value={race.awa.ok ? signed(race.awa.overall, '°') : '—'} />
        <Bar share={race.awa.ok ? Math.min(1, race.awa.pairs.length / 6) : 0} />
      </div>
      <div>
        <Stat label={race.stw.fit ? `R² ${race.stw.fit.r2.toFixed(2)}` : REASON_WORDS[race.stw.gate ?? '']} value={race.stw.fit ? signed(race.stw.fit.bias, ' kt', 2) : '—'} />
        <Bar share={race.stw.fit ? race.stw.fit.r2 : 0} />
      </div>
    </div>
  )
}

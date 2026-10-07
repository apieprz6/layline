'use client'

import { Fragment, useState, type ReactElement } from 'react'
import { AUTOCOMP, CHARTS, RACES, REASON_WORDS, shortDate, signed, type Channel, type Race } from './data'
import { Caption, Eyebrow, HatchDef, Stat, StatRow } from './Sheet'
import { TRUST as SCATTER } from './VariantA'
import { TRUST as COVERAGE } from './VariantB'

/**
 * PROTOTYPE — LAY-149 variant C, **Races as small multiples**.
 *
 * The position: the era is the level a decision is made at, but a sailor only believes it once they
 * have seen the Races it is made of. So the era sits on top as one compact chart, and under it every
 * Race gets its own miniature — the same miniature the per-Race tile on Race analysis shows. Trust
 * needs **both** signals: the scatter band and the coverage word, and the card leads with the weaker.
 */
export const NAME = 'Races as small multiples'

export const TRUST = {
  rule: 'both — the weaker of σ band and coverage leads',
  verdict(channel: Channel): { word: string; why: string } {
    const s = SCATTER.verdict(channel)
    const c = COVERAGE.verdict(channel)
    return { word: `${s.word} · ${c.word}`, why: `${s.why}; ${c.why}` }
  },
}

export function Drawer({ channel }: { channel: Channel }): ReactElement {
  const [focus, setFocus] = useState<string | null>(null)
  if (channel === 'hdg') return <HdgMultiples focus={focus} setFocus={setFocus} />
  if (channel === 'awa') return <AwaLadder />
  return <StwMultiples />
}

/* ------------------------------------------------------------------ minis, shared with the tile */

export function HdgMini({ race, w = 104, h = 44 }: { race: Race; w?: number; h?: number }): ReactElement {
  const mid = h / 2
  const k = (h / 2 - 2) / 25
  if (!race.hdg.ok) return <Empty w={w} h={h} />
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" aria-hidden>
      <HatchDef id={`c-h-${race.id}`} />
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--surface-border)" />
      {race.hdg.bins.map((b, i) => {
        const x = (i / 36) * w
        return b.m === null ? (
          <rect key={b.c} x={x} y={2} width={w / 36} height={h - 4} fill={`url(#c-h-${race.id})`} opacity="0.7" />
        ) : (
          <rect key={b.c} x={x + 0.3} y={Math.min(mid, mid - b.m * k)} width={w / 36 - 0.6} height={Math.max(1, Math.abs(b.m * k))} fill="var(--text-accent)" />
        )
      })}
    </svg>
  )
}

function Empty({ w, h }: { w: number; h: number }): ReactElement {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" aria-hidden>
      <HatchDef id="c-empty" />
      <rect x="0" y="2" width={w} height={h - 4} fill="url(#c-empty)" />
    </svg>
  )
}

export function StwMini({ race, s = 72 }: { race: Race; s?: number }): ReactElement {
  const k = s / 10
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width="100%" aria-hidden>
      <rect x="0" y="0" width={s} height={s} fill="none" stroke="var(--surface-divider)" />
      <line x1="0" y1={s} x2={s} y2="0" stroke="var(--text-primary)" strokeDasharray="2 2" strokeWidth="0.7" />
      {race.stw.xy.map(([x, y], i) => (
        <circle key={i} cx={x * k} cy={s - y * k} r="0.9" fill="var(--text-muted)" opacity="0.5" />
      ))}
      {race.stw.line && (
        <line x1={race.stw.line[0][0] * k} y1={s - race.stw.line[0][1] * k} x2={race.stw.line[1][0] * k} y2={s - race.stw.line[1][1] * k} stroke="var(--text-accent)" strokeWidth="1.5" />
      )}
    </svg>
  )
}

export function AwaMini({ race, w = 104 }: { race: Race; w?: number }): ReactElement {
  const x = (d: number): number => w / 2 + (d / 14) * (w / 2 - 4)
  return (
    <svg viewBox={`0 0 ${w} 16`} width="100%" aria-hidden>
      <line x1="0" x2={w} y1="8" y2="8" stroke="var(--surface-border)" />
      <line x1={w / 2} x2={w / 2} y1="1" y2="15" stroke="var(--text-muted)" strokeDasharray="1.5 1.5" />
      {race.awa.ok &&
        race.awa.pairs.map((p, i) =>
          p.pos === 'upwind' ? (
            <circle key={i} cx={x(p.off)} cy="8" r="3" fill="var(--text-accent)" opacity="0.8" />
          ) : (
            <rect key={i} x={x(p.off) - 3} y="5" width="6" height="6" fill="none" stroke="var(--state-warning)" strokeWidth="1.3" />
          )
        )}
    </svg>
  )
}

function Tile({
  race,
  children,
  figure,
  sub,
  active,
  onClick,
}: {
  race: Race
  children: ReactElement
  figure: string
  sub: string
  active?: boolean
  onClick?: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        border: `1px solid ${active ? 'var(--text-primary)' : 'var(--surface-border)'}`,
        borderRadius: 8,
        padding: 6,
        background: 'var(--surface-raised)',
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {shortDate(race.date)} · {race.label}
      </div>
      {children}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{figure}</div>
      <div style={{ fontSize: 8.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>{sub}</div>
    </button>
  )
}

/** Splits a list of Races at the autocompensation, with a labelled rule across the grid. */
function SplitGrid({ render }: { render: (race: Race) => ReactElement }): ReactElement {
  const before = RACES.filter((r) => r.date < AUTOCOMP)
  const after = RACES.filter((r) => r.date >= AUTOCOMP)
  return (
    <>
      {[after, before].map((group, gi) => (
        <Fragment key={gi}>
          <Eyebrow>
            {gi === 0 ? `Since the ${shortDate(AUTOCOMP)} autocompensation · ${group.length} races` : `Before · ${group.length} races`}
          </Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {[...group].reverse().map((race) => (
              <Fragment key={race.id}>{render(race)}</Fragment>
            ))}
          </div>
        </Fragment>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ HDG */

function HdgMultiples({ focus, setFocus }: { focus: string | null; setFocus: (id: string | null) => void }): ReactElement {
  const W = 340
  const H = 120
  const mid = 60
  const k = 2
  const x = (c: number): number => 22 + (c / 360) * (W - 28)
  const y = (e: number): number => mid - Math.max(-27, Math.min(27, e)) * k
  const picked = RACES.find((r) => r.id === focus)

  const path = (bins: { c: number; m: number | null }[]): string =>
    bins
      .map((b, i) => (b.m === null ? null : `${i === 0 || bins[i - 1].m === null ? 'M' : 'L'} ${x(b.c)} ${y(b.m)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label="Season deviation curves, both eras">
        {[-20, -10, 10, 20].map((e) => (
          <g key={e}>
            <line x1={22} x2={W - 6} y1={y(e)} y2={y(e)} stroke="var(--surface-divider)" strokeDasharray="2 3" />
            <text x={18} y={y(e) + 3} fontSize="7.5" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {e > 0 ? `+${e}` : e}
            </text>
          </g>
        ))}
        <line x1={22} x2={W - 6} y1={mid} y2={mid} stroke="var(--text-muted)" />
        <path d={path(CHARTS.hdgEras[0].bins)} fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(CHARTS.hdgEras[1].bins)} fill="none" stroke="var(--text-accent)" strokeWidth="2.2" />
        {picked?.hdg.ok && <path d={path(picked.hdg.bins)} fill="none" stroke="var(--state-warning)" strokeWidth="1.8" />}
        {[0, 90, 180, 270, 360].map((h) => (
          <text key={h} x={x(h)} y={H + 10} fontSize="8.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {['N', 'E', 'S', 'W', 'N'][h / 90]}
          </text>
        ))}
      </svg>
      <Caption>
        Blue: since {shortDate(AUTOCOMP)}. Dashed: before. Each line breaks where no Race reached a heading. The
        autocompensation moved the curve down; it did not flatten it.
        {picked ? ` Amber: ${shortDate(picked.date)} alone.` : ' Tap a Race to lay it over the season.'}
      </Caption>
      <SplitGrid
        render={(race) => (
          <Tile
            race={race}
            active={focus === race.id}
            onClick={() => setFocus(focus === race.id ? null : race.id)}
            figure={race.hdg.ok ? signed(race.hdg.mean, '°') : '—'}
            sub={race.hdg.ok ? `${Math.round(race.hdg.coverage)}% of rose · ${race.hdg.points} rows` : REASON_WORDS[race.hdg.reason]}
          >
            <HdgMini race={race} />
          </Tile>
        )}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ AWA: one row per Race */

export function AwaLadder(): ReactElement {
  const ordered = [...RACES].reverse()
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr 44px', gap: '2px 8px', alignItems: 'center' }}>
        <span />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
          <span>−14°</span>
          <span>0</span>
          <span>+14°</span>
        </div>
        <span />
        {ordered.map((race, i) => (
          <Fragment key={race.id}>
            {i > 0 && ordered[i - 1].date >= AUTOCOMP && race.date < AUTOCOMP && (
              <div style={{ gridColumn: '1 / -1', borderTop: '1.5px dashed var(--text-muted)', fontSize: 8.5, color: 'var(--text-muted)', padding: '2px 0 3px', fontFamily: 'var(--font-mono)' }}>
                HDG · {shortDate(AUTOCOMP)} autocompensation
              </div>
            )}
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {shortDate(race.date)} {race.label}
            </span>
            {race.awa.ok ? <AwaMini race={race} /> : <span style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>{REASON_WORDS[race.awa.reason]}</span>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'right', color: 'var(--text-primary)' }}>
              {race.awa.ok ? signed(race.awa.overall, '°') : '—'}
            </span>
          </Fragment>
        ))}
      </div>
      <Caption>
        One row per Race, newest first; dots are upwind tack pairs, squares downwind. The dashed rule is the compass
        autocompensation — drawn here because a compass error leaks into the wind columns. If the asymmetry were
        compass-driven it would step at that rule. It moved {signed(CHARTS.awaEra.beforeAutocomp, '°')} →{' '}
        {signed(CHARTS.awaEra.afterAutocomp, '°')} while the compass moved about ten degrees.
      </Caption>
      <StatRow>
        <Stat label={`upwind · ${CHARTS.awaEra.upPairs} pairs`} value={signed(CHARTS.awaEra.up, '°')} />
        <Stat label={`downwind · ${CHARTS.awaEra.downPairs} pairs`} value={signed(CHARTS.awaEra.down, '°')} />
        <Stat label="races with a pair" value={`${CHARTS.awaEra.races}/${RACES.length}`} />
      </StatRow>
    </div>
  )
}

/* ------------------------------------------------------------------ STW */

function StwMultiples(): ReactElement {
  const era = CHARTS.stwEra
  return (
    <div>
      <StatRow>
        <Stat label="season gap from 1:1" value={signed(era.fit.bias, ' kt', 2)} />
        <Stat label="R²" value={era.fit.r2.toFixed(2)} />
        <Stat label="rows · every Race weighted equally" value={`${era.points}`} />
      </StatRow>
      <Caption>
        One era — nothing in the Calibration Log touches STW. Every square is a Race: dashed 1:1 is the paddlewheel as
        configured, blue its own fit, drawn only with 5+ rows and 3 kt of SOG spread.
      </Caption>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 8 }}>
        {[...RACES].reverse().map((race) => (
          <Tile
            key={race.id}
            race={race}
            figure={race.stw.fit ? signed(race.stw.fit.bias, ' kt', 2) : '—'}
            sub={race.stw.fit ? `R² ${race.stw.fit.r2.toFixed(2)} · ${race.stw.points} rows` : `no line · ${REASON_WORDS[race.stw.gate ?? '']}`}
          >
            <StwMini race={race} />
          </Tile>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ per-Race tile */

export function RaceTile({ race }: { race: Race }): ReactElement {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, alignItems: 'start' }}>
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Compass by heading</div>
        <HdgMini race={race} w={160} h={50} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {race.hdg.ok ? `${signed(race.hdg.mean, '°')} · ${Math.round(race.hdg.coverage)}% of rose` : REASON_WORDS[race.hdg.reason]}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>Tack pairs</div>
        <AwaMini race={race} w={160} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {race.awa.ok ? `${signed(race.awa.overall, '°')} · ${race.awa.pairs.length} pairs` : REASON_WORDS[race.awa.reason]}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>SOG on STW</div>
        <StwMini race={race} s={90} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {race.stw.fit ? signed(race.stw.fit.bias, ' kt', 2) : REASON_WORDS[race.stw.gate ?? '']}
        </div>
      </div>
    </div>
  )
}

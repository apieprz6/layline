'use client'

import { useState, type ReactElement } from 'react'
import { AUTOCOMP, RACES, REASON_WORDS, raceName, shortDate, signed, type Pair, type Race } from './data'
import { Big, Chips, Readout, type ChipOption } from './interact'
import { Caption } from './Sheet'

/**
 * PROTOTYPE — LAY-149 variant D, the wind angle. A **tack dial**: the boat at the centre, bow up,
 * like the instrument it is read from. Every tack pair puts a starboard dot on the right and a port
 * dot on the left at the angle each tack held. Port's average is also mirrored onto the starboard
 * side, so a symmetric instrument shows one ray and an asymmetric one shows a wedge — upwind at the
 * top, downwind at the bottom, both on one picture, because comparing the two is the whole check.
 *
 * Diagnostic only: the dial states which tack reads wider and by how much. It never states a value
 * to set the vane to (LAY-138 decision 7), and the caveat under it says why it could not.
 */

type Pos = 'upwind' | 'downwind'
type Tagged = Pair & { race: Race; key: string }

const ALL: Tagged[] = RACES.flatMap((race) =>
  race.awa.ok ? race.awa.pairs.map((p) => ({ ...p, race, key: `${race.id}|${p.t}|${p.pos}` })) : []
)

interface Side {
  /** Mean |AWA| on each tack — per Race first, then across Races, so a long race buys no extra weight. */
  stbd: number
  port: number
  pairs: number
  races: number
}

function summarise(pairs: readonly Tagged[], pos: Pos): Side | null {
  const these = pairs.filter((p) => p.pos === pos)
  if (these.length === 0) return null
  const byRace = new Map<string, Tagged[]>()
  these.forEach((p) => byRace.set(p.race.id, [...(byRace.get(p.race.id) ?? []), p]))
  const perRace = [...byRace.values()].map((list) => ({
    s: list.reduce((a, p) => a + Math.abs(p.stbd), 0) / list.length,
    q: list.reduce((a, p) => a + Math.abs(p.port), 0) / list.length,
  }))
  return {
    stbd: perRace.reduce((a, r) => a + r.s, 0) / perRace.length,
    port: perRace.reduce((a, r) => a + r.q, 0) / perRace.length,
    pairs: these.length,
    races: byRace.size,
  }
}

/** Asymmetry in the signed convention awa_offset.py uses: (starboard + signed port) / 2. */
function asym(side: Side): number {
  return (side.stbd - side.port) / 2
}

const FEW = 5

export default function DWind(): ReactElement {
  const [filter, setFilter] = useState('season')
  const [picked, setPicked] = useState<string | null>(null)

  const race = RACES.find((r) => r.id === filter)
  const pairs = ALL.filter((p) =>
    filter === 'season' ? true : filter === 'since' ? p.race.date >= AUTOCOMP : filter === 'before' ? p.race.date < AUTOCOMP : p.race.id === filter
  )
  const showGhost = filter !== 'season'
  const season = { upwind: summarise(ALL, 'upwind'), downwind: summarise(ALL, 'downwind') }
  const now = { upwind: summarise(pairs, 'upwind'), downwind: summarise(pairs, 'downwind') }
  const pair = ALL.find((p) => p.key === picked)

  const chips: ChipOption[] = [
    { id: 'season', label: 'Season' },
    { id: 'since', label: `Since ${shortDate(AUTOCOMP)}` },
    { id: 'before', label: `Before ${shortDate(AUTOCOMP)}` },
    ...[...RACES].reverse().map((r) => ({
      id: r.id,
      label: `${shortDate(r.date)}${r.awa.ok ? ` · ${r.awa.pairs.length}` : ''}`,
      disabledReason: r.awa.ok ? undefined : REASON_WORDS[r.awa.reason],
    })),
  ]

  return (
    <div>
      <Chips
        options={chips}
        value={filter}
        onChange={(id) => {
          setFilter(id)
          setPicked(null)
        }}
      />
      <Dial pairs={pairs} now={now} ghost={showGhost ? season : null} picked={picked} onPick={(k) => setPicked(k === picked ? null : k)} />
      <Readout>
        {pair ? (
          <PairDetail pair={pair} onClear={() => setPicked(null)} />
        ) : race && !race.awa.ok ? (
          <div>
            {raceName(race)} produced no tack pairs — {REASON_WORDS[race.awa.reason]}. Pairs need a steady starboard and a steady
            port segment at the same point of sail, within five minutes.
          </div>
        ) : (
          <Verdict now={now} />
        )}
      </Readout>
      <PairList pairs={pairs} picked={picked} onPick={(k) => setPicked(k === picked ? null : k)} open={filter !== 'season'} />
      <Caption>
        Dots are the apparent wind angle each tack held — starboard (green) right, port (red) left. The dashed red ray is
        port’s average folded onto the starboard side: where it misses the green ray, the amber wedge is how much wider one
        tack reads. Reaching (50°–110°) is discarded.{showGhost && ' Grey rays: the whole season, for comparison.'} Averages
        weight every Race equally.
      </Caption>
    </div>
  )
}

/* ------------------------------------------------------------------ the dial */

const S = 340
const C = S / 2
const R_IN = 62
const R_OUT = 150

function at(awa: number, r: number, side: 1 | -1): [number, number] {
  const a = (awa * Math.PI) / 180
  return [C + side * r * Math.sin(a), C - r * Math.cos(a)]
}

function Ray({ awa, side, stroke, width = 2, dash, r0 = 22 }: { awa: number; side: 1 | -1; stroke: string; width?: number; dash?: string; r0?: number }): ReactElement {
  const [x0, y0] = at(awa, r0, side)
  const [x1, y1] = at(awa, R_OUT + 8, side)
  return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
}

function sector(a0: number, a1: number, r0: number, r1: number, side: 1 | -1): string {
  const p = (a: number, r: number): string => at(a, r, side).join(' ')
  const sweep = side === 1 ? 1 : 0
  return `M ${p(a0, r0)} L ${p(a0, r1)} A ${r1} ${r1} 0 0 ${sweep} ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 0 ${1 - sweep} ${p(a0, r0)} Z`
}

function Dial({
  pairs,
  now,
  ghost,
  picked,
  onPick,
}: {
  pairs: readonly Tagged[]
  now: Record<Pos, Side | null>
  ghost: Record<Pos, Side | null> | null
  picked: string | null
  onPick: (key: string) => void
}): ReactElement {
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" role="img" aria-label="Tack dial: apparent wind angle held on each tack, upwind and downwind" style={{ display: 'block', maxWidth: 360, margin: '0 auto' }}>
      {/* reaching: discarded, drawn as such */}
      {([1, -1] as const).map((side) => (
        <path key={side} d={sector(50, 110, 24, R_OUT + 8, side)} fill="var(--surface-elevated)" />
      ))}
      <text x={C + 118} y={C + 3} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)">reaching · not used</text>
      <text x={C - 118} y={C + 3} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)">reaching · not used</text>
      {[R_IN, (R_IN + R_OUT) / 2, R_OUT].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="var(--surface-divider)" />
      ))}
      {[0, 30, 50, 110, 150, 180].map((a) =>
        ([1, -1] as const).map((side) => <Ray key={`${a}-${side}`} awa={a} side={side} stroke="var(--surface-divider)" width={1} />)
      )}
      {[30, 50, 110, 150].map((a) => {
        const [x, y] = at(a, R_OUT + 14, 1)
        return (
          <text key={a} x={x} y={y + 3} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {a}°
          </text>
        )
      })}
      <text x={S - 4} y={12} fontSize="8.5" fill="var(--wind-light)" fontWeight="700" textAnchor="end">STARBOARD →</text>
      <text x={4} y={12} fontSize="8.5" fill="var(--state-danger)" fontWeight="700">← PORT</text>
      <text x={C} y={C - R_OUT - 14} fontSize="8" textAnchor="middle" fill="var(--text-muted)">upwind</text>
      <text x={C} y={C + R_OUT + 20} fontSize="8" textAnchor="middle" fill="var(--text-muted)">downwind</text>

      {(['upwind', 'downwind'] as const).map((pos) => {
        const side = now[pos]
        const g = ghost?.[pos]
        return (
          <g key={pos}>
            {g && (
              <>
                <Ray awa={g.stbd} side={1} stroke="var(--text-muted)" width={1.5} />
                <Ray awa={g.port} side={-1} stroke="var(--text-muted)" width={1.5} />
              </>
            )}
            {side && (
              <>
                <path
                  d={sector(Math.min(side.stbd, side.port), Math.max(side.stbd, side.port), 24, R_OUT + 8, 1)}
                  fill="var(--state-warning)"
                  opacity="0.28"
                />
                <Ray awa={side.stbd} side={1} stroke="var(--wind-light)" width={2.5} />
                <Ray awa={side.port} side={-1} stroke="var(--state-danger)" width={2.5} />
                <Ray awa={side.port} side={1} stroke="var(--state-danger)" width={1.5} dash="4 3" />
                <WedgeLabel side={side} pos={pos} />
              </>
            )}
          </g>
        )
      })}

      {(['upwind', 'downwind'] as const).map((pos) => {
        const these = pairs.filter((p) => p.pos === pos)
        return these.map((p, i) => {
          const r = R_IN + ((i + 0.5) / these.length) * (R_OUT - R_IN)
          const [sx, sy] = at(Math.abs(p.stbd), r, 1)
          const [qx, qy] = at(Math.abs(p.port), r, -1)
          const on = p.key === picked
          const dim = picked !== null && !on
          return (
            <g key={p.key} onClick={() => onPick(p.key)} style={{ cursor: 'pointer' }} opacity={dim ? 0.3 : 1}>
              {on && <path d={`M ${qx} ${qy} A ${r} ${r} 0 0 1 ${sx} ${sy}`} fill="none" stroke="var(--text-primary)" strokeWidth="1" strokeDasharray="2 2" />}
              <circle cx={sx} cy={sy} r={on ? 5 : 3.6} fill="var(--wind-light)" stroke={on ? 'var(--text-primary)' : 'none'} />
              <circle cx={qx} cy={qy} r={on ? 5 : 3.6} fill="var(--surface-raised)" stroke="var(--state-danger)" strokeWidth={on ? 2.2 : 1.6} />
              <circle cx={sx} cy={sy} r="10" fill="transparent" />
              <circle cx={qx} cy={qy} r="10" fill="transparent" />
            </g>
          )
        })
      })}

      {/* the boat, bow up */}
      <path d={`M ${C} ${C - 16} C ${C + 7} ${C - 6} ${C + 7} ${C + 8} ${C + 5} ${C + 14} L ${C - 5} ${C + 14} C ${C - 7} ${C + 8} ${C - 7} ${C - 6} ${C} ${C - 16} Z`} fill="var(--text-primary)" />
    </svg>
  )
}

function WedgeLabel({ side, pos }: { side: Side; pos: Pos }): ReactElement {
  const diff = Math.abs(side.stbd - side.port)
  const midAngle = (side.stbd + side.port) / 2
  const [x, y] = at(midAngle, R_OUT + (pos === 'upwind' ? 26 : 26), 1)
  return (
    <g>
      <rect x={x - 19} y={y - 8} width="38" height="14" rx="7" fill="var(--state-warning)" />
      <text x={x} y={y + 2.5} fontSize="8.5" fontWeight="700" textAnchor="middle" fill="var(--text-inverse)" fontFamily="var(--font-mono)">
        Δ{diff.toFixed(1)}°
      </text>
    </g>
  )
}

/* ------------------------------------------------------------------ readouts */

function SideLine({ label, side }: { label: string; side: Side | null }): ReactElement {
  if (!side) {
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
        <Big tone="var(--text-muted)">no pairs</Big>
      </div>
    )
  }
  const wider = side.port > side.stbd ? 'Port' : 'Starboard'
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
      <Big>{signed(asym(side), '°')}</Big>
      <div>
        {wider} reads {Math.abs(side.stbd - side.port).toFixed(1)}° wider
      </div>
      <div style={{ fontSize: 10, color: side.pairs < FEW ? 'var(--state-warning)' : 'var(--text-muted)' }}>
        {side.pairs} pair{side.pairs === 1 ? '' : 's'} · {side.races} race{side.races === 1 ? '' : 's'}
        {side.pairs < FEW ? ' — too few to lean on' : ''}
      </div>
    </div>
  )
}

function Verdict({ now }: { now: Record<Pos, Side | null> }): ReactElement {
  const up = now.upwind
  const down = now.downwind
  let agreement: string
  if (!up || !down) {
    agreement = `No ${!up ? 'upwind' : 'downwind'} pairs here, so the check that separates a vane set off-centre from everything else cannot be made.`
  } else if (Math.sign(asym(up)) !== Math.sign(asym(down))) {
    agreement =
      'Upwind and downwind lean opposite ways. A vane set off-centre leans the same way on both points of sail, so this pattern is not, on its own, a vane offset.'
  } else {
    agreement =
      'Upwind and downwind lean the same way — what a vane set off-centre would do. The compass or qtVlm’s true-wind model could still produce it (see below).'
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SideLine label="Upwind · AWA < 50°" side={up} />
        <SideLine label="Downwind · AWA > 110°" side={down} />
      </div>
      <div style={{ marginTop: 6 }}>{agreement}</div>
    </>
  )
}

function PairDetail({ pair, onClear }: { pair: Tagged; onClear: () => void }): ReactElement {
  const s = Math.abs(pair.stbd)
  const q = Math.abs(pair.port)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Big>
          {pair.pos} · {signed(pair.off, '°')}
        </Big>
        <button type="button" onClick={onClear} style={{ border: 'none', background: 'none', color: 'var(--text-accent)', fontSize: 11, cursor: 'pointer' }}>
          clear
        </button>
      </div>
      <div>
        {raceName(pair.race)} · {pair.t} · {pair.rows} rows
      </div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>
        starboard {s.toFixed(1)}° · port {q.toFixed(1)}° · {q > s ? 'port' : 'starboard'} {Math.abs(q - s).toFixed(1)}° wider
      </div>
    </>
  )
}

function PairList({
  pairs,
  picked,
  onPick,
  open,
}: {
  pairs: readonly Tagged[]
  picked: string | null
  onPick: (key: string) => void
  open: boolean
}): ReactElement {
  return (
    <details open={open} style={{ marginTop: 8 }}>
      <summary style={{ fontSize: 11, color: 'var(--text-accent)', cursor: 'pointer' }}>
        {pairs.length} tack pair{pairs.length === 1 ? '' : 's'}
      </summary>
      <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
        {pairs.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPick(p.key)}
            aria-pressed={p.key === picked}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 54px 40px 40px 44px',
              gap: 4,
              textAlign: 'left',
              border: 'none',
              borderRadius: 6,
              padding: '5px 6px',
              background: p.key === picked ? 'var(--surface-elevated)' : 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <span>
              {shortDate(p.race.date)} {p.t}
            </span>
            <span>{p.pos === 'upwind' ? 'up' : 'down'}</span>
            <span style={{ color: 'var(--wind-light)' }}>{Math.abs(p.stbd).toFixed(0)}°</span>
            <span style={{ color: 'var(--state-danger)' }}>{Math.abs(p.port).toFixed(0)}°</span>
            <span style={{ textAlign: 'right' }}>{signed(p.off, '°')}</span>
          </button>
        ))}
      </div>
    </details>
  )
}

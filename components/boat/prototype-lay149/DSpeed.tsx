'use client'

import { useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import { RACES, REASON_WORDS, raceName, shortDate, signed, type Race } from './data'
import { Big, Chips, Readout, fitLine, svgPoint, type FitMethod, type Line } from './interact'
import { Caption, HatchDef, Segmented } from './Sheet'

/**
 * PROTOTYPE — LAY-149 variant D, boat speed. The same rows drawn two ways that answer two
 * questions: the scatter shows the **line** — the shape the instrument's constants act on — and
 * the gap view lays the 1:1 flat so the **U-shaped** gap a straight line cannot follow is visible.
 * The line is drawn in both. Its coefficients are never printed (LAY-138 decision 7, ADR 0027).
 */

type View = 'scatter' | 'gap'

const BANDS = 10

export default function DSpeed(): ReactElement {
  const [view, setView] = useState<View>('scatter')
  const [method, setMethod] = useState<FitMethod>('orthogonal')
  const [raceId, setRaceId] = useState('')
  const [band, setBand] = useState<number | null>(null)
  const race = RACES.find((r) => r.id === raceId)

  const season = useMemo(() => {
    const pts: [number, number][] = []
    const w: number[] = []
    RACES.forEach((r) => r.stw.xy.forEach((p) => (pts.push(p), w.push(1 / r.stw.points))))
    return fitLine(pts, w, method)
  }, [method])
  const own = useMemo(
    () => (race && race.stw.gate === null ? fitLine(race.stw.xy, race.stw.xy.map(() => 1), method) : null),
    [race, method]
  )

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    setBand((b) => Math.max(0, Math.min(BANDS - 1, (b ?? (step > 0 ? -1 : BANDS)) + step)))
  }

  const props: ChartProps = { race, season, own, band, onBand: setBand, onKey }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <div style={{ width: 190 }}>
          <Segmented
            options={[
              { key: 'scatter', label: 'Scatter' },
              { key: 'gap', label: 'Gap by speed' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>tap a speed</span>
      </div>
      <Chips
        options={[
          { id: '', label: 'Season' },
          ...[...RACES].reverse().map((r) => ({
            id: r.id,
            label: shortDate(r.date),
            disabledReason: r.stw.gate ? REASON_WORDS[r.stw.gate] : undefined,
          })),
        ]}
        value={raceId}
        onChange={setRaceId}
      />
      {view === 'scatter' ? <Scatter {...props} /> : <Gap {...props} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>line fitted</span>
        <div style={{ width: 230 }}>
          <Segmented
            options={[
              { key: 'orthogonal', label: 'both noisy' },
              { key: 'ols', label: 'SOG on STW' },
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>
      </div>
      <Readout>{band === null ? <Summary season={season} own={own} race={race} /> : <BandDetail band={band} race={race} season={season} own={own} />}</Readout>
      <Caption>
        Dashed: the paddlewheel as configured — SOG equals STW. Blue: the season’s line, every Race weighted equally.
        {race && (own ? ` Amber: ${raceName(race)}’s own line.` : ` ${raceName(race)} has no line of its own — ${REASON_WORDS[race.stw.gate ?? '']}; its rows still count in the season.`)}{' '}
        {method === 'ols'
          ? 'Fitted as SOG on STW (ADR 0027 as written) — noise in STW flattens this line, so it reads the paddlewheel as over-reading at speed.'
          : 'Fitted treating both instruments as noisy, since both are. Switch to see how much the method moves the line.'}{' '}
        No row lacks STW here: every blank-STW row was Frozen or Low-Speed.
      </Caption>
    </div>
  )
}

interface ChartProps {
  race: Race | undefined
  season: Line | null
  own: Line | null
  band: number | null
  onBand: (band: number | null) => void
  onKey: (event: KeyboardEvent) => void
}

/** The line's own gap from 1:1 at a boat speed — a reading of the drawn line, not a coefficient. */
function lineGap(line: Line, stw: number): number {
  return line.intercept + line.slope * stw - stw
}

function bandRows(band: number, source: readonly Race[]): { gap: number | null; rows: number; races: number } {
  const per = source
    .map((r) => r.stw.xy.filter(([s]) => s >= band && s < band + 1).map(([s, g]) => g - s))
    .filter((v) => v.length > 0)
  const rows = per.reduce((a, v) => a + v.length, 0)
  const gap = per.length ? per.map((v) => v.reduce((a, x) => a + x, 0) / v.length).reduce((a, x) => a + x, 0) / per.length : null
  return { gap, rows, races: per.length }
}

function Summary({ season, own, race }: { season: Line | null; own: Line | null; race: Race | undefined }): ReactElement {
  const line = race ? own : season
  const label = race ? raceName(race) : 'Season'
  if (!line) {
    return (
      <div>
        {label}: {race?.stw.points ?? 0} rows, no line — {REASON_WORDS[race?.stw.gate ?? ''] ?? 'too few rows'}.
      </div>
    )
  }
  return (
    <>
      <Big>
        {signed(line.bias, ' kt', 2)} · R² {line.r2.toFixed(2)}
      </Big>
      <div>
        {label}: GPS speed averages {Math.abs(line.bias).toFixed(2)} kt {line.bias >= 0 ? 'above' : 'below'} the paddlewheel. The
        line sits {signed(lineGap(line, 4), ' kt', 2)} from 1:1 at 4 kt and {signed(lineGap(line, 8), ' kt', 2)} at 8 kt.
      </div>
    </>
  )
}

function BandDetail({ band, race, season, own }: { band: number; race: Race | undefined; season: Line | null; own: Line | null }): ReactElement {
  const here = bandRows(band, race ? [race] : RACES)
  const line = race ? own : season
  return (
    <>
      <Big>
        {band}–{band + 1} kt STW · {here.gap === null ? 'no rows' : signed(here.gap, ' kt', 2)}
      </Big>
      <div>
        {here.rows === 0
          ? `${race ? raceName(race) : 'No Race'} never sailed this speed.`
          : `GPS speed sits ${Math.abs(here.gap ?? 0).toFixed(2)} kt ${(here.gap ?? 0) >= 0 ? 'above' : 'below'} the paddlewheel here, over ${here.rows} rows${race ? '' : ` from ${here.races} races, each weighted equally`}.`}
      </div>
      {line && here.rows > 0 && (
        <div style={{ color: 'var(--text-muted)' }}>
          The straight line says {signed(lineGap(line, band + 0.5), ' kt', 2)} here
          {here.gap !== null && Math.abs(lineGap(line, band + 0.5) - here.gap) > 0.1 ? ' — the rows disagree with it by more than 0.1 kt.' : '.'}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ scatter */

const SZ = 300
const PAD = 26
const K = (SZ - PAD - 8) / 10

function Scatter({ race, season, own, band, onBand, onKey }: ChartProps): ReactElement {
  const px = (v: number): number => PAD + v * K
  const py = (v: number): number => SZ - PAD - v * K
  const ends = (line: Line, lo: number, hi: number): { x1: number; y1: number; x2: number; y2: number } => ({
    x1: px(lo),
    y1: py(line.intercept + line.slope * lo),
    x2: px(hi),
    y2: py(line.intercept + line.slope * hi),
  })
  return (
    <svg
      viewBox={`0 0 ${SZ} ${SZ}`}
      width="100%"
      role="img"
      tabIndex={0}
      aria-label="SOG against STW. Tap or use arrow keys to pick a speed band."
      onKeyDown={onKey}
      onClick={(e) => {
        const b = Math.floor((svgPoint(e).x - PAD) / K)
        onBand(b >= 0 && b < BANDS ? (b === band ? null : b) : null)
      }}
      style={{ display: 'block', cursor: 'pointer', outline: 'none', maxWidth: 340, margin: '0 auto' }}
    >
      {band !== null && <rect x={px(band)} y={py(10)} width={K} height={10 * K} fill="var(--state-warning)" opacity="0.14" />}
      {[0, 2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={px(v)} x2={px(v)} y1={py(0)} y2={py(10)} stroke="var(--surface-divider)" />
          <line x1={px(0)} x2={px(10)} y1={py(v)} y2={py(v)} stroke="var(--surface-divider)" />
          <text x={px(v)} y={SZ - 10} fontSize="8" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">{v}</text>
          <text x={12} y={py(v) + 3} fontSize="8" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">{v}</text>
        </g>
      ))}
      <text x={SZ - 8} y={SZ - 18} fontSize="8" textAnchor="end" fill="var(--text-muted)">STW kt</text>
      <text x={PAD + 4} y={14} fontSize="8" fill="var(--text-muted)">SOG kt</text>
      {RACES.flatMap((r) =>
        r.stw.xy.map(([s, g], i) => <circle key={`${r.id}-${i}`} cx={px(s)} cy={py(g)} r="1.3" fill="var(--text-muted)" opacity={race ? 0.1 : 0.28} />)
      )}
      {race?.stw.xy.map(([s, g], i) => <circle key={`p-${i}`} cx={px(s)} cy={py(g)} r="2.2" fill="var(--state-warning)" opacity="0.8" />)}
      <line x1={px(0)} y1={py(0)} x2={px(10)} y2={py(10)} stroke="var(--text-primary)" strokeDasharray="4 3" />
      {season && <line {...ends(season, 0.6, 9.6)} stroke="var(--text-accent)" strokeWidth="2.2" />}
      {own && race && (
        <line
          {...ends(own, Math.min(...race.stw.xy.map(([s]) => s)), Math.max(...race.stw.xy.map(([s]) => s)))}
          stroke="var(--state-warning)"
          strokeWidth="2.2"
        />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ gap by speed */

function Gap({ race, season, own, band, onBand, onKey }: ChartProps): ReactElement {
  const source = race ? [race] : RACES
  const H = 150
  const mid = 75
  const k = 40
  const x = (stw: number): number => 26 + stw * 31
  const y = (gap: number): number => mid - Math.max(-1.6, Math.min(1.6, gap)) * k
  const bands = Array.from({ length: BANDS }, (_, b) => ({ b, ...bandRows(b, source) }))
  const gapLine = (line: Line, lo: number, hi: number, stroke: string): ReactElement => (
    <line x1={x(lo)} y1={y(lineGap(line, lo))} x2={x(hi)} y2={y(lineGap(line, hi))} stroke={stroke} strokeWidth="2" />
  )

  return (
    <svg
      viewBox={`0 0 340 ${H + 34}`}
      width="100%"
      role="img"
      tabIndex={0}
      aria-label="SOG minus STW by boat speed. Tap or use arrow keys to pick a speed band."
      onKeyDown={onKey}
      onClick={(e) => {
        const b = Math.floor((svgPoint(e).x - 26) / 31)
        onBand(b >= 0 && b < BANDS ? (b === band ? null : b) : null)
      }}
      style={{ display: 'block', cursor: 'pointer', outline: 'none' }}
    >
      <HatchDef id="ds-hatch" />
      {band !== null && <rect x={x(band)} y={0} width={31} height={H + 22} fill="var(--state-warning)" opacity="0.14" />}
      {[-1, -0.5, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={26} x2={336} y1={y(g)} y2={y(g)} stroke="var(--surface-divider)" strokeDasharray="2 3" />
          <text x={22} y={y(g) + 3} fontSize="7.5" textAnchor="end" fill="var(--text-muted)" fontFamily="var(--font-mono)">
            {g > 0 ? `+${g}` : g}
          </text>
        </g>
      ))}
      <line x1={26} x2={336} y1={mid} y2={mid} stroke="var(--text-primary)" strokeDasharray="4 3" />
      <text x={334} y={mid + 11} fontSize="7.5" textAnchor="end" fill="var(--text-muted)">1:1 · as configured</text>
      {source.flatMap((r) =>
        r.stw.xy.map(([s, g], i) => <circle key={`${r.id}-${i}`} cx={x(s)} cy={y(g - s)} r="1.2" fill="var(--text-muted)" opacity={race ? 0.5 : 0.16} />)
      )}
      {bands.map((b) =>
        b.gap === null ? (
          <rect key={b.b} x={x(b.b) + 1} y={y(1.5)} width={29} height={y(-1.5) - y(1.5)} fill="url(#ds-hatch)" />
        ) : (
          <line key={b.b} x1={x(b.b) + 4} x2={x(b.b + 1) - 4} y1={y(b.gap)} y2={y(b.gap)} stroke="var(--text-primary)" strokeWidth="3" />
        )
      )}
      {season && !race && gapLine(season, 0.6, 9.6, 'var(--text-accent)')}
      {own && race && gapLine(own, Math.min(...race.stw.xy.map(([s]) => s)), Math.max(...race.stw.xy.map(([s]) => s)), 'var(--state-warning)')}
      {Array.from({ length: 11 }, (_, v) => (
        <text key={v} x={x(v)} y={H - 4} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)" fontFamily="var(--font-mono)">
          {v}
        </text>
      ))}
      <text x={336} y={H + 1} fontSize="7" textAnchor="end" fill="var(--text-muted)">STW kt</text>
      <text x={22} y={H + 15} fontSize="7" textAnchor="end" fill="var(--text-muted)">rows</text>
      {bands.map((b) => (
        <g key={`ev-${b.b}`}>
          <rect x={x(b.b) + 1} y={H + 5} width={29} height={14} fill={b.rows === 0 ? 'url(#ds-hatch)' : 'var(--text-primary)'} opacity={b.rows === 0 ? 1 : 0.08 + 0.5 * Math.min(1, b.rows / (race ? 80 : 500))} />
          <text x={x(b.b) + 15.5} y={H + 15} fontSize="7" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-mono)">
            {b.rows || ''}
          </text>
        </g>
      ))}
    </svg>
  )
}

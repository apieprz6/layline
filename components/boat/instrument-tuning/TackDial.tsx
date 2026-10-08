'use client'

/**
 * The **Tack Dial**: the **Apparent Wind Asymmetry**, as something seen rather than read off a
 * signed number.
 *
 * A new form, because none of LAY-149's first-round variants made asymmetry visible — each showed
 * the *offset*, none showed two tacks holding different angles. The dial is drawn bow-up, the way
 * the instrument displays apparent wind: the boat at the centre, starboard to the right, port to
 * the left. Every **Tack Pair** puts a filled starboard dot and a ringed port dot at the angle each
 * tack held, upwind pairs in the top sector and downwind in the bottom, with the reaching sectors
 * drawn shaded and labelled as not used.
 *
 * **Port's average is folded onto the starboard side** as a dashed ray. On a symmetric instrument
 * the two rays coincide; on an asymmetric one the gap fills as a wedge labelled with its width in
 * degrees. Upwind and downwind sit on one picture because comparing them is the check that
 * distinguishes a vane set off-centre — which leans the same way on both points of sail — from
 * everything else, and on this archive they lean opposite ways.
 *
 * **Diagnostic only, and never a Measured Offset.** The dial says which tack reads wider and by how
 * much. It never says what to set the vane to, and the caveat travelling with the figure says why
 * it could not: the recording's apparent wind is qtVlm's recomputation, so the asymmetry may be the
 * vane, the compass, or the true-wind model. Where a season figure guides the owner's own
 * adjustment on the boat, that is the owner's judgement made with the dial, not a value the dial
 * supplied (LAY-138 decision 7).
 */

import { useState, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import {
  DOWNWIND_MIN_AWA_DEG,
  MAX_PAIR_GAP_SECONDS,
  UPWIND_MAX_AWA_DEG,
} from '@/services/analysis/awa-asymmetry'
import { ASYMMETRY_THIN_PAIRS, asymmetryCoverage } from '@/services/analysis/coverage-verdict'
import type {
  CalibrationLogEntry,
  EraAsymmetryFigure,
  EraAwaAsymmetry,
  PairedPointOfSail,
  RaceAwaAsymmetry,
  TackPair,
} from '@/types'

import CalibrationRail, { type RailRace } from './CalibrationRail'
import {
  Big,
  CHART_SVG_STYLE,
  Caption,
  Chips,
  Coverage,
  Readout,
  type ChipOption,
} from './chart-furniture'
import {
  raceLabel,
  races as racesPhrase,
  rows as rowsPhrase,
  shortDate,
  signedDegrees,
  tackPairs,
  type RaceLabels,
} from './chart-text'

const SEASON = 'season'
const POINTS_OF_SAIL: readonly PairedPointOfSail[] = ['upwind', 'downwind']

/** One pair with the Race it came from, which is what a dot is and what the list prints. */
interface DialPair {
  key: string
  pair: TackPair
  race: RaceAwaAsymmetry
}

interface TackDialProps {
  /**
   * The whole season as one figure: every Race's own means averaged, Races weighted equally.
   *
   * Computed by the caller over an unbounded Era rather than pooled here, so the weighting the
   * readout claims is the weighting the service applied — a long distance race buys no extra
   * influence over a season of beer-cans.
   */
  season: EraAwaAsymmetry
  /**
   * The same season cut on the **`HDG`** Calibration Eras, oldest first.
   *
   * `HDG`'s and not `AWA`'s, deliberately: the check these chips exist for is whether the asymmetry
   * moved across an autocompensation that moved the compass about ten degrees. On this archive it
   * went −3.8° to −5.5° — which does not look compass-driven, and is one tap to see.
   */
  eras: readonly EraAwaAsymmetry[]
  /** The whole Calibration Log. The rail marks `AWA`'s own acts and, muted, `HDG`'s. */
  log: readonly CalibrationLogEntry[]
  labels: RaceLabels
}

export default function TackDial({ season, eras, log, labels }: TackDialProps): ReactElement {
  const [level, setLevel] = useState<string>(SEASON)
  const [picked, setPicked] = useState<string | null>(null)

  const everyPair = dialPairs(season)
  const race = season.races.find((measured) => measured.race_id === level) ?? null
  const excluded = season.excluded.find((missing) => missing.race_id === level) ?? null
  const era = eras.find((candidate) => candidate.era.key === level) ?? null

  const shown: EraAwaAsymmetry | null = level === SEASON ? season : era
  const figures: Record<PairedPointOfSail, EraAsymmetryFigure | null> =
    race !== null
      ? { upwind: asRaceFigure(race, 'upwind'), downwind: asRaceFigure(race, 'downwind') }
      : { upwind: shown?.upwind ?? null, downwind: shown?.downwind ?? null }

  const pairs =
    race !== null
      ? everyPair.filter((entry) => entry.race.race_id === race.race_id)
      : era !== null
        ? everyPair.filter((entry) =>
            era.races.some((inEra) => inEra.race_id === entry.race.race_id)
          )
        : everyPair

  const chips: ChipOption[] = [
    { id: SEASON, label: `Season · ${racesPhrase(season.race_count)}` },
    ...eras.map((candidate) => ({
      id: candidate.era.key,
      label:
        candidate.era.from_date === null
          ? `Before ${firstBoundary(eras) ?? 'the first act'}`
          : `Since ${shortDate(candidate.era.from_date)}`,
      emptyReason:
        candidate.upwind === null && candidate.downwind === null
          ? 'no Tack Pair in this Era'
          : undefined,
    })),
    ...[...season.races].reverse().map((measured) => ({
      id: measured.race_id,
      label: raceLabel(labels, measured.race_id, measured.window_start),
    })),
    ...[...season.excluded].reverse().map((missing) => ({
      id: missing.race_id,
      label: raceLabel(labels, missing.race_id, missing.window_start),
      emptyReason: reasonWords(missing),
    })),
  ]

  const railRaces: RailRace[] = [
    ...season.races.map((measured) => ({
      race_id: measured.race_id,
      sailed_at: measured.window_start,
      measured: true,
    })),
    ...season.excluded.map((missing) => ({
      race_id: missing.race_id,
      sailed_at: missing.window_start,
      measured: false,
    })),
  ]

  const selected = everyPair.find((entry) => entry.key === picked) ?? null

  return (
    <div data-testid="tack-dial">
      <Chips
        label="Which Races the dial is drawing"
        options={chips}
        value={level}
        onChange={(id) => {
          setLevel(id)
          // A pair from a Race no longer drawn would stay named in the readout while its dot had
          // gone from the dial.
          setPicked(null)
        }}
      />
      <CalibrationRail
        channel="AWA"
        log={log}
        races={railRaces}
        labels={labels}
        selectedRaceId={race?.race_id ?? excluded?.race_id ?? null}
      />

      <Dial
        pairs={pairs}
        figures={figures}
        // The season's own rays stay drawn in grey behind a narrower level, so one Race or one Era
        // is always read against the season rather than in isolation.
        ghost={
          level === SEASON ? null : { upwind: season.upwind, downwind: season.downwind }
        }
        picked={picked}
        onPick={(key) => setPicked((at) => (at === key ? null : key))}
      />

      <Readout>
        {selected !== null ? (
          <PairDetail entry={selected} labels={labels} />
        ) : excluded !== null ? (
          <div>
            {raceLabel(labels, excluded.race_id, excluded.window_start)} paired no tacks —{' '}
            {reasonWords(excluded)}. A pair needs a steady starboard segment and a steady port
            segment at the same point of sail, no more than {MAX_PAIR_GAP_SECONDS / 60} minutes
            apart.
          </div>
        ) : (
          <Verdict figures={figures} />
        )}
      </Readout>

      <div style={{ marginTop: spacing(2) }}>
        <Coverage statement={asymmetryCoverage(shown ?? season)} />
      </div>

      <PairList
        pairs={pairs}
        picked={picked}
        labels={labels}
        onPick={(key) => setPicked((at) => (at === key ? null : key))}
        open={level !== SEASON}
      />

      <Caption>
        Dots are the apparent wind angle each tack held — starboard right, port left. The dashed ray
        is port&rsquo;s average folded onto the starboard side: where it misses starboard&rsquo;s,
        the wedge is how much wider one tack reads. Reaching ({UPWIND_MAX_AWA_DEG}°–
        {DOWNWIND_MIN_AWA_DEG}°) is discarded, because a held angle there says too little about
        where the wind is for two tacks to be compared.
        {level !== SEASON && ' Grey rays: the whole season, for comparison.'} Every Race weighs the
        same in an average, whatever its length.
      </Caption>
    </div>
  )
}

/* ----------------------------------------------------------------------- shapes */

function dialPairs(season: EraAwaAsymmetry): DialPair[] {
  return season.races.flatMap((race) =>
    race.pairs.map((pair) => ({
      key: `${race.race_id}|${pair.at}|${pair.point_of_sail}`,
      pair,
      race,
    }))
  )
}

/**
 * One Race's figure in the shape an Era's comes in, so the dial draws both the same way.
 *
 * A Race is its own single contributor: `race_count` is one and `race_figures` holds itself. Not a
 * cast and not a second arithmetic — the figure is the service's own, re-labelled.
 */
function asRaceFigure(
  race: RaceAwaAsymmetry,
  pointOfSail: PairedPointOfSail
): EraAsymmetryFigure | null {
  const figure = race[pointOfSail]
  if (figure === null) return null

  return {
    ...figure,
    race_count: 1,
    race_figures: [
      {
        race_id: race.race_id,
        window_start: race.window_start,
        asymmetry_deg: figure.asymmetry_deg,
        held_deg: figure.held_deg,
        pair_count: figure.pair_count,
      },
    ],
  }
}

/** The first recorded act across these Eras, for the chip that names the stretch before it. */
function firstBoundary(eras: readonly EraAwaAsymmetry[]): string | null {
  const dated = eras.map((era) => era.era.from_date).filter((date) => date !== null)
  return dated.length === 0 ? null : shortDate(dated[0])
}

function reasonWords(excluded: Extract<EraAwaAsymmetry['excluded'][number], object>): string {
  if (excluded.reason === 'too-few-rows') {
    return `only ${rowsPhrase(excluded.row_count)} this check could read`
  }
  if (excluded.reason === 'too-few-segments') {
    return `${excluded.segment_count} steady segment${excluded.segment_count === 1 ? '' : 's'}, too few to pair`
  }
  return 'no two steady segments on opposite tacks close enough together'
}

/* ----------------------------------------------------------------------- the dial */

const SIZE = 340
const CENTRE = SIZE / 2
const INNER = 62
const OUTER = 150

/** A point at an apparent wind angle, `side` 1 for starboard and −1 for port. */
function at(awaDeg: number, radius: number, side: 1 | -1): [number, number] {
  const angle = (awaDeg * Math.PI) / 180
  return [CENTRE + side * radius * Math.sin(angle), CENTRE - radius * Math.cos(angle)]
}

function sector(fromDeg: number, toDeg: number, inner: number, outer: number, side: 1 | -1): string {
  const point = (awa: number, radius: number): string => at(awa, radius, side).join(' ')
  const sweep = side === 1 ? 1 : 0

  return [
    `M ${point(fromDeg, inner)}`,
    `L ${point(fromDeg, outer)}`,
    `A ${outer} ${outer} 0 0 ${sweep} ${point(toDeg, outer)}`,
    `L ${point(toDeg, inner)}`,
    `A ${inner} ${inner} 0 0 ${1 - sweep} ${point(fromDeg, inner)}`,
    'Z',
  ].join(' ')
}

function Ray({
  awa,
  side,
  stroke,
  width = 2,
  dash,
}: {
  awa: number
  side: 1 | -1
  stroke: string
  width?: number
  dash?: string
}): ReactElement {
  const [x1, y1] = at(awa, 22, side)
  const [x2, y2] = at(awa, OUTER + 8, side)
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={width}
      strokeDasharray={dash}
      strokeLinecap="round"
    />
  )
}

function Dial({
  pairs,
  figures,
  ghost,
  picked,
  onPick,
}: {
  pairs: readonly DialPair[]
  figures: Record<PairedPointOfSail, EraAsymmetryFigure | null>
  ghost: Record<PairedPointOfSail, EraAsymmetryFigure | null> | null
  picked: string | null
  onPick: (key: string) => void
}): ReactElement {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Tack dial: the apparent wind angle held on each tack, upwind above and downwind below, with port folded onto starboard."
      data-testid="tack-dial-svg"
      style={{ ...CHART_SVG_STYLE, maxWidth: 360, margin: '0 auto', cursor: 'default' }}
    >
      {/* Reaching is discarded, and drawn as discarded rather than left blank. */}
      {([1, -1] as const).map((side) => (
        <path
          key={side}
          d={sector(UPWIND_MAX_AWA_DEG, DOWNWIND_MIN_AWA_DEG, 24, OUTER + 8, side)}
          fill="var(--surface-elevated)"
        />
      ))}
      <text x={CENTRE + 118} y={CENTRE + 3} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)">
        reaching · not used
      </text>
      <text x={CENTRE - 118} y={CENTRE + 3} fontSize="7.5" textAnchor="middle" fill="var(--text-muted)">
        reaching · not used
      </text>

      {[INNER, (INNER + OUTER) / 2, OUTER].map((radius) => (
        <circle
          key={radius}
          cx={CENTRE}
          cy={CENTRE}
          r={radius}
          fill="none"
          stroke="var(--surface-divider)"
        />
      ))}
      {[0, 30, UPWIND_MAX_AWA_DEG, DOWNWIND_MIN_AWA_DEG, 150, 180].map((awa) =>
        ([1, -1] as const).map((side) => (
          <Ray key={`${awa}-${side}`} awa={awa} side={side} stroke="var(--surface-divider)" width={1} />
        ))
      )}
      {[30, UPWIND_MAX_AWA_DEG, DOWNWIND_MIN_AWA_DEG, 150].map((awa) => {
        const [x, y] = at(awa, OUTER + 14, 1)
        return (
          <text
            key={awa}
            x={x}
            y={y + 3}
            fontSize="7.5"
            textAnchor="middle"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {awa}°
          </text>
        )
      })}

      <text x={SIZE - 4} y={12} fontSize="8.5" fill="var(--tack-starboard)" fontWeight="700" textAnchor="end">
        STARBOARD →
      </text>
      <text x={4} y={12} fontSize="8.5" fill="var(--tack-port)" fontWeight="700">
        ← PORT
      </text>
      <text x={CENTRE} y={CENTRE - OUTER - 14} fontSize="8" textAnchor="middle" fill="var(--text-muted)">
        upwind
      </text>
      <text x={CENTRE} y={CENTRE + OUTER + 20} fontSize="8" textAnchor="middle" fill="var(--text-muted)">
        downwind
      </text>

      {POINTS_OF_SAIL.map((pointOfSail) => {
        const figure = figures[pointOfSail]
        const behind = ghost?.[pointOfSail] ?? null

        return (
          <g key={pointOfSail}>
            {behind !== null && (
              <>
                <Ray awa={behind.held_deg.starboard} side={1} stroke="var(--text-muted)" width={1.5} />
                <Ray awa={behind.held_deg.port} side={-1} stroke="var(--text-muted)" width={1.5} />
              </>
            )}
            {figure !== null && <Wedge figure={figure} />}
          </g>
        )
      })}

      {POINTS_OF_SAIL.map((pointOfSail) => {
        const these = pairs.filter((entry) => entry.pair.point_of_sail === pointOfSail)
        return these.map((entry, index) => {
          // Spread along the radius rather than stacked at one, so two pairs that held the same
          // angle are two dots and not one.
          const radius = INNER + ((index + 0.5) / these.length) * (OUTER - INNER)
          const [sx, sy] = at(Math.abs(entry.pair.starboard.held_angle_deg), radius, 1)
          const [px, py] = at(Math.abs(entry.pair.port.held_angle_deg), radius, -1)
          const on = entry.key === picked

          return (
            <g
              key={entry.key}
              onClick={() => onPick(entry.key)}
              style={{ cursor: 'pointer' }}
              opacity={picked !== null && !on ? 0.3 : 1}
              data-testid="tack-pair-dot"
            >
              {on && (
                <path
                  d={`M ${px} ${py} A ${radius} ${radius} 0 0 1 ${sx} ${sy}`}
                  fill="none"
                  stroke="var(--text-primary)"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}
              <circle cx={sx} cy={sy} r={on ? 5 : 3.6} fill="var(--tack-starboard)" stroke={on ? 'var(--text-primary)' : 'none'} />
              <circle
                cx={px}
                cy={py}
                r={on ? 5 : 3.6}
                fill="var(--surface-raised)"
                stroke="var(--tack-port)"
                strokeWidth={on ? 2.2 : 1.6}
              />
              {/* A finger is wider than a 3.6px dot. */}
              <circle cx={sx} cy={sy} r="11" fill="transparent" />
              <circle cx={px} cy={py} r="11" fill="transparent" />
            </g>
          )
        })
      })}

      {/* The boat, bow up, so the dial is read the way the instrument is. */}
      <path
        d={`M ${CENTRE} ${CENTRE - 16} C ${CENTRE + 7} ${CENTRE - 6} ${CENTRE + 7} ${CENTRE + 8} ${CENTRE + 5} ${CENTRE + 14} L ${CENTRE - 5} ${CENTRE + 14} C ${CENTRE - 7} ${CENTRE + 8} ${CENTRE - 7} ${CENTRE - 6} ${CENTRE} ${CENTRE - 16} Z`}
        fill="var(--text-primary)"
      />
    </svg>
  )
}

/** Port's average folded onto starboard, the gap between them filled, and the gap labelled. */
function Wedge({ figure }: { figure: EraAsymmetryFigure }): ReactElement {
  const { starboard, port } = figure.held_deg
  const [x, y] = at((starboard + port) / 2, OUTER + 26, 1)

  return (
    <>
      <path
        d={sector(Math.min(starboard, port), Math.max(starboard, port), 24, OUTER + 8, 1)}
        fill="var(--state-warning)"
        opacity="0.28"
        data-testid={`asymmetry-wedge-${figure.point_of_sail}`}
      />
      <Ray awa={starboard} side={1} stroke="var(--tack-starboard)" width={2.5} />
      <Ray awa={port} side={-1} stroke="var(--tack-port)" width={2.5} />
      <Ray awa={port} side={1} stroke="var(--tack-port)" width={1.5} dash="4 3" />
      <rect x={x - 20} y={y - 8} width="40" height="14" rx="7" fill="var(--state-warning)" />
      <text
        x={x}
        y={y + 2.5}
        fontSize="8.5"
        fontWeight="700"
        textAnchor="middle"
        fill="var(--text-inverse)"
        fontFamily="var(--font-mono)"
      >
        Δ{figure.wider_by_deg.toFixed(1)}°
      </text>
    </>
  )
}

/* ----------------------------------------------------------------------- readouts */

function SideFigure({
  label,
  figure,
}: {
  label: string
  figure: EraAsymmetryFigure | null
}): ReactElement {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      {figure === null ? (
        <Big tone="var(--text-muted)">no pairs</Big>
      ) : (
        <>
          <Big>{signedDegrees(figure.asymmetry_deg)}</Big>
          <div>
            {figure.wider_tack === null
              ? 'Both tacks held the same angle'
              : `${figure.wider_tack === 'port' ? 'Port' : 'Starboard'} reads ${figure.wider_by_deg.toFixed(1)}° wider`}
          </div>
          <div
            style={{
              fontSize: 10,
              color:
                figure.pair_count < ASYMMETRY_THIN_PAIRS
                  ? 'var(--state-warning)'
                  : 'var(--text-muted)',
            }}
          >
            {tackPairs(figure.pair_count)} · {racesPhrase(figure.race_count)}
            {figure.pair_count < ASYMMETRY_THIN_PAIRS ? ' — too few to lean on' : ''}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * What the two points of sail say, and what their agreement does and does not imply.
 *
 * Never one averaged figure. On this archive port reads 11.5° wider upwind and starboard 10.2°
 * wider downwind, so their mean states the opposite of the finding (ADR 0035).
 */
function Verdict({
  figures,
}: {
  figures: Record<PairedPointOfSail, EraAsymmetryFigure | null>
}): ReactElement {
  const { upwind, downwind } = figures

  const closing =
    upwind === null || downwind === null
      ? `No ${upwind === null ? 'upwind' : 'downwind'} pairs here, so the check that separates a vane set off-centre from everything else cannot be made.`
      : Math.sign(upwind.asymmetry_deg) !== Math.sign(downwind.asymmetry_deg)
        ? 'Upwind and downwind lean opposite ways. A vane set off-centre leans the same way on both points of sail, so this is not, on its own, a vane offset.'
        : 'Upwind and downwind lean the same way — what a vane set off-centre would do. The compass, or qtVlm’s true-wind model, could still produce it.'

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing(3) }}>
        <SideFigure label={`Upwind · AWA < ${UPWIND_MAX_AWA_DEG}°`} figure={upwind} />
        <SideFigure label={`Downwind · AWA > ${DOWNWIND_MIN_AWA_DEG}°`} figure={downwind} />
      </div>
      <div style={{ marginTop: spacing(2) }}>{closing}</div>
    </>
  )
}

function PairDetail({ entry, labels }: { entry: DialPair; labels: RaceLabels }): ReactElement {
  const starboard = Math.abs(entry.pair.starboard.held_angle_deg)
  const port = Math.abs(entry.pair.port.held_angle_deg)
  const wider = port > starboard ? 'port' : 'starboard'

  return (
    <>
      <Big>
        {entry.pair.point_of_sail} · {signedDegrees(entry.pair.asymmetry_deg)}
      </Big>
      <div>
        {raceLabel(labels, entry.race.race_id, entry.race.window_start)} ·{' '}
        {entry.pair.at.slice(11, 16)} ·{' '}
        {rowsPhrase(entry.pair.starboard.row_indexes.length + entry.pair.port.row_indexes.length)}{' '}
        over {Math.round(entry.pair.gap_seconds)}s apart
      </div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>
        starboard {starboard.toFixed(1)}° · port {port.toFixed(1)}° · {wider}{' '}
        {Math.abs(port - starboard).toFixed(1)}° wider
      </div>
    </>
  )
}

function PairList({
  pairs,
  picked,
  labels,
  onPick,
  open,
}: {
  pairs: readonly DialPair[]
  picked: string | null
  labels: RaceLabels
  onPick: (key: string) => void
  open: boolean
}): ReactElement {
  return (
    <details open={open} style={{ marginTop: spacing(2) }}>
      <summary style={{ fontSize: 11, color: 'var(--text-accent)', cursor: 'pointer' }}>
        {tackPairs(pairs.length)}
      </summary>
      <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
        {pairs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => onPick(entry.key)}
            aria-pressed={entry.key === picked}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 42px 38px 38px 46px',
              gap: 4,
              textAlign: 'left',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 6px',
              background: entry.key === picked ? 'var(--surface-elevated)' : 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <span>
              {raceLabel(labels, entry.race.race_id, entry.race.window_start)}{' '}
              {entry.pair.at.slice(11, 16)}
            </span>
            <span>{entry.pair.point_of_sail === 'upwind' ? 'up' : 'down'}</span>
            <span style={{ color: 'var(--tack-starboard)' }}>
              {Math.abs(entry.pair.starboard.held_angle_deg).toFixed(0)}°
            </span>
            <span style={{ color: 'var(--tack-port)' }}>
              {Math.abs(entry.pair.port.held_angle_deg).toFixed(0)}°
            </span>
            <span style={{ textAlign: 'right' }}>{signedDegrees(entry.pair.asymmetry_deg)}</span>
          </button>
        ))}
      </div>
    </details>
  )
}

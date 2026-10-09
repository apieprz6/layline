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

import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { DOWNWIND_MIN_AWA_DEG, UPWIND_MAX_AWA_DEG } from '@/services/analysis/awa-asymmetry'
import { ASYMMETRY_THIN_PAIRS, asymmetryCoverage } from '@/services/analysis/coverage-verdict'
import type {
  AsymmetryFigure,
  CalibrationLogEntry,
  EraAwaAsymmetry,
  PairedPointOfSail,
  RaceAwaAsymmetry,
  Tack,
  TackPair,
} from '@/types'

import CalibrationRail, { railRacesFrom } from './CalibrationRail'
import {
  Big,
  CHART_FONT,
  CHART_SVG_STYLE,
  Chips,
  Coverage,
  Note,
  Notes,
  Readout,
  TUNING_CHART_WIDTH,
  TUNING_CHART_HEIGHT,
  TUNING_VIEW_BOX,
  arrowStep,
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
   * The same season cut on **`AWA`'s own** Calibration Eras, oldest first.
   *
   * Its own channel, because these are the boundaries that make the figure mean one thing: a vane
   * **Programmed Offset** is applied before a Recording is written, and re-typing it moves the two
   * tacks' held magnitudes in opposite directions, so the Asymmetry either side of that day is two
   * different quantities.
   */
  eras: readonly EraAwaAsymmetry[]
  /**
   * And the same season cut on the **`HDG`** Eras, for the cross-channel check.
   *
   * Offered beside its own rather than instead of them (ADR 0034 asked for the compass comparison;
   * it did not ask for `AWA`'s own partition to be dropped). A boundary that is already one of
   * `AWA`'s is not offered twice — the same rule the rail follows, where an act the chart owns wins
   * the date over a borrowed one.
   */
  compassEras: readonly EraAwaAsymmetry[]
  /** The whole Calibration Log. The rail marks `AWA`'s own acts and, muted, `HDG`'s. */
  log: readonly CalibrationLogEntry[]
  labels: RaceLabels
}

export default function TackDial({
  season,
  eras,
  compassEras,
  log,
  labels,
}: TackDialProps): ReactElement {
  const [level, setLevel] = useState<string>(SEASON)
  const [picked, setPicked] = useState<string | null>(null)

  const everyPair = dialPairs(season)
  const race = season.races.find((measured) => measured.race_id === level) ?? null
  const excluded = season.excluded.find((missing) => missing.race_id === level) ?? null
  // Either list: a level is an Era by its key, and the two lists' keys carry their own channel
  // (`AWA:2026-09-02` against `HDG:2026-07-04`), so one lookup cannot find the other's Era.
  const era =
    eras.find((candidate) => candidate.era.key === level) ??
    compassEras.find((candidate) => candidate.era.key === level) ??
    null

  // What is on screen, as the two figures and the Races behind them. A Race and an Era both carry
  // an `AsymmetryFigure`; only the Era counts Races, so the count travels beside the figures rather
  // than inside them, and a Race is the one Race it is.
  const shown: EraAwaAsymmetry | null = level === SEASON ? season : era
  const figures: Record<PairedPointOfSail, AsymmetryFigure | null> =
    race !== null
      ? { upwind: race.upwind, downwind: race.downwind }
      : { upwind: shown?.upwind ?? null, downwind: shown?.downwind ?? null }
  const raceCount = (pointOfSail: PairedPointOfSail): number =>
    race !== null ? 1 : (shown?.[pointOfSail]?.race_count ?? 0)

  const pairs =
    race !== null
      ? everyPair.filter((entry) => entry.race.race_id === race.race_id)
      : era !== null
        ? everyPair.filter((entry) =>
            era.races.some((inEra) => inEra.race_id === entry.race.race_id)
          )
        : everyPair

  // `AWA`'s own boundaries, then the compass's — minus any the two share, which a Version that
  // re-typed both channels on one day produces (the owner's first Version is exactly that).
  const ownBoundaries = new Set(eras.map((candidate) => candidate.era.from_date))

  const chips: ChipOption[] = [
    { id: SEASON, label: `Season · ${racesPhrase(season.race_count)}` },
    ...eras.map((candidate) => eraChip(candidate, eras, null)),
    ...compassEras
      .filter((candidate) => !ownBoundaries.has(candidate.era.from_date))
      .map((candidate) => eraChip(candidate, compassEras, 'HDG')),
    ...[...season.races].reverse().map((measured) => ({
      id: measured.race_id,
      // The pair count on the chip, because how much a Race rests on is the first thing to know
      // about it here and two pairs reads very differently from twelve.
      label: `${raceLabel(labels, measured.race_id, measured.window_start)} · ${measured.pairs.length}`,
    })),
    ...[...season.excluded].reverse().map((missing) => ({
      id: missing.race_id,
      label: raceLabel(labels, missing.race_id, missing.window_start),
      emptyReason: reasonWords(missing),
    })),
  ]


  const selected = pairs.find((entry) => entry.key === picked) ?? null

  /**
   * Left and right step through the pairs on screen, as they do through heading bins and speed
   * bands on the two linear charts (ADR 0034: "each chart responds to touch and to the arrow
   * keys"). The pairs are scattered in two dimensions, so the sequence stepped through is the one
   * the list beneath the dial prints — time order.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    const step = arrowStep(event)
    if (step === null || pairs.length === 0) return

    const at = pairs.findIndex((entry) => entry.key === picked)
    const next = (at === -1 ? (step > 0 ? -1 : 0) : at) + step
    setPicked(pairs[((next % pairs.length) + pairs.length) % pairs.length].key)
  }

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
        races={railRacesFrom(season.races, season.excluded)}
        labels={labels}
        selectedRaceId={race?.race_id ?? excluded?.race_id ?? null}
      />

      <Dial
        onKeyDown={onKeyDown}
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
          <PairDetail entry={selected} labels={labels} onClear={() => setPicked(null)} />
        ) : excluded !== null ? (
          <div>
            {raceLabel(labels, excluded.race_id, excluded.window_start)} paired no tacks —{' '}
            {reasonWords(excluded)}.
          </div>
        ) : (
          <Verdict figures={figures} raceCount={raceCount} />
        )}
      </Readout>

      <div style={{ marginTop: spacing(2) }}>
        <Coverage statement={asymmetryCoverage(figures)} />
      </div>

      <PairList
        pairs={pairs}
        picked={picked}
        labels={labels}
        onPick={(key) => setPicked((at) => (at === key ? null : key))}
        open={level !== SEASON}
      />

      <Notes>
        <Note label="How to read it">
          Dots are the apparent wind angle each tack held — starboard right, port left. The dashed
          ray is port&rsquo;s average folded onto the starboard side: where it misses
          starboard&rsquo;s, the wedge is how much wider one tack reads. Reaching (
          {UPWIND_MAX_AWA_DEG}°–{DOWNWIND_MIN_AWA_DEG}°) is discarded, because a held angle there
          says too little about where the wind is for two tacks to be compared.
          {level !== SEASON && ' Grey rays: the whole season, for comparison.'} Every Race weighs
          the same in an average, whatever its length.
        </Note>
        <Note label="Caveat" tone="caveat">
          {season.caveat}
        </Note>
      </Notes>
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
 * One Era as a chip.
 *
 * A borrowed Era names the channel whose act opened it, for the reason the rail's borrowed rules
 * do: an unlabelled "Since 4 Jul" beside `AWA`'s own boundaries would read as a masthead act.
 */
function eraChip(
  shown: EraAwaAsymmetry,
  withinList: readonly EraAwaAsymmetry[],
  borrowedFrom: 'HDG' | null
): ChipOption {
  const suffix = borrowedFrom === null ? '' : ` · ${borrowedFrom}`

  return {
    id: shown.era.key,
    label:
      shown.era.from_date === null
        ? `Before ${firstBoundary(withinList) ?? 'the first act'}${suffix}`
        : `Since ${shortDate(shown.era.from_date)}${suffix}`,
    emptyReason:
      shown.upwind === null && shown.downwind === null ? 'no Tack Pair in this Era' : undefined,
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

const CENTRE_X = TUNING_CHART_WIDTH / 2
const CENTRE_Y = TUNING_CHART_HEIGHT / 2

/**
 * Every radius the dial draws at, measured inward from the box rather than outward from the boat.
 *
 * Outward was how the old dial clipped itself: an outer ring of 150 in a 340-box put "upwind" at
 * `y = 6` and "downwind" at `y = 340`, which is the bottom edge, so the word was cut in half. These
 * are derived from the shared box's own half-height so the furthest thing drawn is inside it by
 * construction — at any viewBox the screen later settles on.
 */
const LABEL_RING = CENTRE_Y - CHART_FONT.label - 3
/** The angle labels — 30°, 50°, 110°, 150° — just outside the rays. */
const ANGLE_RING = LABEL_RING - CHART_FONT.label - 1
/** How far a ray reaches, and where the Δ pill that labels a wedge sits against. */
const RAY = ANGLE_RING - 10
const OUTER = RAY - 8
/** The hole in the middle: dots are spread from here outwards so none lands on the boat. */
const INNER = 48

/** A point at an apparent wind angle, `side` 1 for starboard and −1 for port. */
function at(awaDeg: number, radius: number, side: 1 | -1): [number, number] {
  const angle = (awaDeg * Math.PI) / 180
  return [CENTRE_X + side * radius * Math.sin(angle), CENTRE_Y - radius * Math.cos(angle)]
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
  const [x1, y1] = at(awa, 20, side)
  const [x2, y2] = at(awa, RAY, side)
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
  onKeyDown,
}: {
  pairs: readonly DialPair[]
  figures: Record<PairedPointOfSail, AsymmetryFigure | null>
  ghost: Record<PairedPointOfSail, AsymmetryFigure | null> | null
  picked: string | null
  onPick: (key: string) => void
  onKeyDown: (event: KeyboardEvent) => void
}): ReactElement {
  return (
    <svg
      viewBox={TUNING_VIEW_BOX}
      role="img"
      tabIndex={0}
      aria-label="Tack dial: the apparent wind angle held on each tack, upwind above and downwind below, with port folded onto starboard. Use the arrow keys to step through the Tack Pairs."
      data-testid="tack-dial-svg"
      onKeyDown={onKeyDown}
      style={{ ...CHART_SVG_STYLE, cursor: 'default' }}
    >
      {/* Reaching is discarded, and drawn as discarded rather than left blank. */}
      {([1, -1] as const).map((side) => (
        <path
          key={side}
          d={sector(UPWIND_MAX_AWA_DEG, DOWNWIND_MIN_AWA_DEG, 22, RAY, side)}
          fill="var(--surface-elevated)"
        />
      ))}
      {/* Centred in the reaching sector on each side, which is the one place no ray can run. */}
      {([1, -1] as const).map((side) => (
        <text
          key={`reaching-${side}`}
          x={CENTRE_X + side * (OUTER * 0.66)}
          y={CENTRE_Y + 3}
          fontSize={CHART_FONT.note}
          textAnchor="middle"
          fill="var(--text-muted)"
        >
          reaching · not used
        </text>
      ))}

      {[INNER, (INNER + OUTER) / 2, OUTER].map((radius) => (
        <circle
          key={radius}
          cx={CENTRE_X}
          cy={CENTRE_Y}
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
      {/*
        On the port side, and only there. Port is folded onto starboard, so every wedge and every
        Δ label is drawn to the right — leaving the angle scale on the left is what keeps the two
        off each other at 390px, where the pill and the 50° label were landing on the same pixels.
      */}
      {[30, UPWIND_MAX_AWA_DEG, DOWNWIND_MIN_AWA_DEG, 150].map((awa) => {
        const [x, y] = at(awa, ANGLE_RING, -1)
        return (
          <text
            key={awa}
            x={x}
            y={y + 3}
            fontSize={CHART_FONT.tick}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {awa}°
          </text>
        )
      })}

      <text
        x={TUNING_CHART_WIDTH - 4}
        y={CHART_FONT.label + 2}
        fontSize={CHART_FONT.label}
        fill="var(--tack-starboard)"
        fontWeight="700"
        textAnchor="end"
      >
        STARBOARD →
      </text>
      <text x={4} y={CHART_FONT.label + 2} fontSize={CHART_FONT.label} fill="var(--tack-port)" fontWeight="700">
        ← PORT
      </text>
      <text
        x={CENTRE_X}
        y={CENTRE_Y - LABEL_RING + CHART_FONT.label}
        fontSize={CHART_FONT.note}
        textAnchor="middle"
        fill="var(--text-muted)"
      >
        upwind
      </text>
      <text
        x={CENTRE_X}
        y={CENTRE_Y + LABEL_RING}
        fontSize={CHART_FONT.note}
        textAnchor="middle"
        fill="var(--text-muted)"
      >
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
            <g key={entry.key} opacity={picked !== null && !on ? 0.3 : 1}>
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
              {/*
                Each dot is its own target, rather than one handler on the pair.
                A pair's two dots sit on opposite sides of the boat, so a group
                spanning both has its centre on the centreline — over the dial's
                own grid rays and nowhere near either dot. A tap aimed at a dot
                landed on a grid line and did nothing.
              */}
              <Dot cx={sx} cy={sy} entry={entry} tack="starboard" onPick={onPick} />
              <Dot cx={px} cy={py} entry={entry} tack="port" onPick={onPick} />
            </g>
          )
        })
      })}

      {/* The boat, bow up, so the dial is read the way the instrument is. */}
      <path
        d={`M ${CENTRE_X} ${CENTRE_Y - 16} C ${CENTRE_X + 7} ${CENTRE_Y - 6} ${CENTRE_X + 7} ${CENTRE_Y + 8} ${CENTRE_X + 5} ${CENTRE_Y + 14} L ${CENTRE_X - 5} ${CENTRE_Y + 14} C ${CENTRE_X - 7} ${CENTRE_Y + 8} ${CENTRE_X - 7} ${CENTRE_Y - 6} ${CENTRE_X} ${CENTRE_Y - 16} Z`}
        fill="var(--text-primary)"
      />
    </svg>
  )
}

/**
 * One tack's dot as a tap target: a transparent circle wider than the dot under it.
 *
 * A finger is wider than a 3.6px dot, and at 390px the dial's whole 340-unit viewBox is about 324
 * pixels across. Keyboard-reachable too, because the dial has no arrow-key path of its own the way
 * the two linear charts do — the pairs are scattered in two dimensions, so tab order through the
 * dots is the honest equivalent.
 */
function Dot({
  cx,
  cy,
  entry,
  tack,
  onPick,
}: {
  cx: number
  cy: number
  entry: DialPair
  tack: Tack
  onPick: (key: string) => void
}): ReactElement {
  return (
    <circle
      cx={cx}
      cy={cy}
      r="11"
      fill="transparent"
      role="button"
      tabIndex={0}
      aria-label={`${entry.pair.point_of_sail} Tack Pair at ${entry.pair.at.slice(11, 16)}, ${tack} tack`}
      data-testid="tack-pair-dot"
      data-tack={tack}
      style={{ cursor: 'pointer' }}
      onClick={() => onPick(entry.key)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onPick(entry.key)
      }}
    />
  )
}

/** Port's average folded onto starboard, the gap between them filled, and the gap labelled. */
function Wedge({ figure }: { figure: AsymmetryFigure }): ReactElement {
  const { starboard, port } = figure.held_deg
  const [x, y] = at((starboard + port) / 2, RAY - 2, 1)

  return (
    <>
      <path
        d={sector(Math.min(starboard, port), Math.max(starboard, port), 22, RAY, 1)}
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
        fontSize={CHART_FONT.tick}
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
  raceCount,
}: {
  label: string
  figure: AsymmetryFigure | null
  /** Races behind the figure, which an Era counts and a single Race is one of. */
  raceCount: number
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
            {tackPairs(figure.pair_count)} · {racesPhrase(raceCount)}
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
  raceCount,
}: {
  figures: Record<PairedPointOfSail, AsymmetryFigure | null>
  raceCount: (pointOfSail: PairedPointOfSail) => number
}): ReactElement {
  const { upwind, downwind } = figures

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing(3) }}>
        <SideFigure
          label={`Upwind · AWA < ${UPWIND_MAX_AWA_DEG}°`}
          figure={upwind}
          raceCount={raceCount('upwind')}
        />
        <SideFigure
          label={`Downwind · AWA > ${DOWNWIND_MIN_AWA_DEG}°`}
          figure={downwind}
          raceCount={raceCount('downwind')}
        />
      </div>
      <div style={{ marginTop: spacing(2) }}>{leaning(upwind, downwind)}</div>
    </>
  )
}

/**
 * Whether the two points of sail lean the same way, and what that does and does not imply.
 *
 * Three answers, not two. A side that read *exactly* symmetric leans neither way, so comparing it
 * with `Math.sign` would call a 0.0° upwind figure "the opposite way" from any downwind one at all —
 * reporting a disagreement between a measurement and a measurement of nothing.
 */
function leaning(upwind: AsymmetryFigure | null, downwind: AsymmetryFigure | null): string {
  if (upwind === null || downwind === null) {
    return `No ${upwind === null ? 'upwind' : 'downwind'} pairs here, so the check that separates a vane set off-centre from everything else cannot be made.`
  }

  if (upwind.wider_tack === null || downwind.wider_tack === null) {
    const flat = upwind.wider_tack === null ? 'Upwind' : 'Downwind'
    return `${flat} the two tacks held the same angle, so there is nothing to compare the other point of sail’s lean against.`
  }

  return upwind.wider_tack === downwind.wider_tack
    ? 'Upwind and downwind lean the same way — what a vane set off-centre would do. The compass, or qtVlm’s true-wind model, could still produce it.'
    : 'Upwind and downwind lean opposite ways. A vane set off-centre leans the same way on both points of sail, so this is not, on its own, a vane offset.'
}

function PairDetail({
  entry,
  labels,
  onClear,
}: {
  entry: DialPair
  labels: RaceLabels
  onClear: () => void
}): ReactElement {
  const starboard = Math.abs(entry.pair.starboard.held_angle_deg)
  const port = Math.abs(entry.pair.port.held_angle_deg)
  const wider = port > starboard ? 'port' : 'starboard'

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Big>
          {entry.pair.point_of_sail} · {signedDegrees(entry.pair.asymmetry_deg)}
        </Big>
        {/* Tapping the dot again clears it, but a 3.6px dot is hard to find twice. */}
        <button
          type="button"
          onClick={onClear}
          style={{
            flexShrink: 0,
            border: 'none',
            background: 'none',
            color: 'var(--text-accent)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          back to the season
        </button>
      </div>
      <div>
        {raceLabel(labels, entry.race.race_id, entry.race.window_start)} ·{' '}
        {entry.pair.at.slice(11, 16)} ·{' '}
        {rowsPhrase(entry.pair.starboard.row_indexes.length)} on starboard and{' '}
        {rowsPhrase(entry.pair.port.row_indexes.length)} on port,{' '}
        {Math.round(entry.pair.gap_seconds)}s apart
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

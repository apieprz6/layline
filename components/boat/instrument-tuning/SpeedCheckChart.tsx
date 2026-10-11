'use client'

/**
 * `STW` against `SOG`: the same rows drawn two ways, because they answer two questions.
 *
 * - **Scatter** (default): `SOG` on `STW`, with the 1:1 line dashed — the paddlewheel as it is
 *   currently configured — and **the fitted line drawn**, because a straight line is the shape the
 *   instrument's constants act on and the owner's review asked for it to stay on screen.
 * - **Gap by speed**: the same rows turned so 1:1 lies flat, with the mean gap per 1 kt band and
 *   the row count beneath. This is the view that shows the gap is **U-shaped** — about +0.45 kt at
 *   2–3 kt, near zero at 4–6, and +0.3 to +0.5 kt at 8–9 — which a straight line cannot follow, and
 *   the line is drawn here too so the places the rows leave it are visible.
 *
 * **The line is fitted orthogonally by default**, treating both instruments as noisy, which is what
 * they are; a toggle switches to ADR 0027's `SOG`-on-`STW` regression. The method matters: on this
 * archive one says the paddlewheel over-reads at speed (slope 0.94) and the other says it
 * under-reads (1.02), and least squares on one variable is biased flat by noise in the other. The
 * toggle exists so that dependence is visible rather than buried in a footnote.
 *
 * **No coefficient is ever printed** — not the slope, not the intercept, however labelled, because
 * either is a drafted correction (ADR 0027, LAY-138 decision 7). This component could not print one
 * if it wanted to: the service hands it two end points of a segment and `R²`, and nothing else. The
 * readout gives the line's gap from 1:1 at 4 kt and at 8 kt, which is a reading *of the drawn line*
 * in the Measured Offset's own unit.
 */

import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { speedCoverage } from '@/services/analysis/coverage-verdict'
import type { OfferedFitMethod } from '@/services/analysis/instrument-tuning'
import {
  MIN_FIT_POINTS,
  MIN_SOG_SPREAD_KNOTS,
  lineGapAt,
  type EraDivergence,
  type FittedLine,
  type NoFitReason,
  type RaceDivergence,
  type SpeedBandGap,
  type SpeedPoint,
} from '@/services/analysis/paddlewheel'
import type { CalibrationLogEntry } from '@/types'

import CalibrationRail, { type RailRace } from './CalibrationRail'
import {
  Absent,
  Big,
  CHART_FONT,
  CHART_SVG_STYLE,
  ChipPicker,
  Chips,
  Coverage,
  Figure,
  Figures,
  HatchDef,
  LINEAR,
  LINEAR_PLOT_WIDTH,
  Note,
  Notes,
  Readout,
  Segmented,
  TUNING_CHART_HEIGHT,
  TUNING_CHART_WIDTH,
  TUNING_VIEW_BOX,
  arrowStep,
  svgPoint,
  type ChipOption,
} from './chart-furniture'
import {
  raceLabel,
  races as racesPhrase,
  rows as rowsPhrase,
  signedKnots,
  type RaceLabels,
} from './chart-text'

type View = 'scatter' | 'gap'

const SEASON = 'season'

/** The speed axis never shrinks below this, so a light-air season is not drawn as a fast one. */
const MIN_AXIS_KNOTS = 10

const REASON_WORDS: Record<NoFitReason, string> = {
  'no-points': 'no Countable row carried both speeds',
  'too-few-points': `fewer than ${MIN_FIT_POINTS} rows carrying both speeds`,
  'narrow-spread': `under ${MIN_SOG_SPREAD_KNOTS} kt of SOG between its slowest row and its fastest`,
  flat: 'the two channels never varied together, so no line through them is defined',
}

/**
 * The `STW` caveat — the one of the three the services do not carry.
 *
 * The other two travel with their figures because each is about how the figure was *derived*: a
 * compass read through `CTW`, an apparent wind recomputed by qtVlm. This one is about the venue, so
 * no service is in a position to assert it — whether current is negligible on the COLYC race circle
 * is a fact about Lake Michigan that the arithmetic cannot know. It lives with the chart that has
 * to state it.
 */
const PADDLEWHEEL_CAVEAT =
  'Assumes current is negligible on this venue, since a current would move SOG and leave STW ' +
  'alone and read here as a paddlewheel error. The 1:1 line is the paddlewheel as currently ' +
  'configured; no uncorrected reading is reconstructed.'

const METHOD_WORDS: Record<OfferedFitMethod, string> = {
  orthogonal:
    'Fitted treating both instruments as noisy, since both are. Switch to see how far the method moves the line.',
  'sog-on-stw':
    'Fitted as SOG on STW (ADR 0027 as written) — noise in STW flattens this line, so it reads the paddlewheel as over-reading at speed.',
}

interface SpeedCheckChartProps {
  /**
   * The same Era fitted both ways.
   *
   * Both, rather than one and a re-fit on toggle: the fit is the service's arithmetic and belongs
   * there (so does the decision that a line has gates to clear), and a chart that refitted on a
   * click would be a second copy of it. The rows are identical in the two.
   */
  byMethod: Record<OfferedFitMethod, EraDivergence>
  /** The whole Calibration Log, for the rail's dashed rules. `STW` carries its own marks only. */
  log: readonly CalibrationLogEntry[]
  labels: RaceLabels
}

export default function SpeedCheckChart({
  byMethod,
  log,
  labels,
}: SpeedCheckChartProps): ReactElement {
  const [view, setView] = useState<View>('scatter')
  const [method, setMethod] = useState<OfferedFitMethod>('orthogonal')
  const [raceId, setRaceId] = useState<string>(SEASON)
  const [band, setBand] = useState<number | null>(null)

  const era = byMethod[method]
  const race = era.races.find((candidate) => candidate.race_id === raceId) ?? null

  const axisMax = Math.max(
    MIN_AXIS_KNOTS,
    Math.ceil(
      era.races.reduce(
        (widest, candidate) =>
          candidate.points.reduce(
            (atRace, point) => Math.max(atRace, point.stw, point.sog),
            widest
          ),
        0
      )
    )
  )

  // One level, so `Chips` draws nothing and the picker's resting label names it. One Race out of
  // however many the Era holds, newest first.
  const season = `Season · ${racesPhrase(era.races.length)}`
  const raceOptions: ChipOption[] = [...era.races].reverse().map((candidate) => ({
    id: candidate.race_id,
    label: raceLabel(labels, candidate.race_id, candidate.sailed_at),
    emptyReason: candidate.fit.fitted ? undefined : REASON_WORDS[candidate.fit.reason],
  }))

  const railRaces: RailRace[] = era.races.map((candidate) => ({
    race_id: candidate.race_id,
    sailed_at: candidate.sailed_at,
    measured: candidate.fit.fitted,
  }))

  const bands = bandAxis(era.gap_by_speed, axisMax)

  const onKeyDown = (event: KeyboardEvent): void => {
    const step = arrowStep(event)
    if (step === null) return
    setBand((at) => Math.max(0, Math.min(axisMax - 1, (at ?? (step > 0 ? -1 : axisMax)) + step)))
  }

  const pick = (index: number | null): void => {
    setBand((at) => (index !== null && index === at ? null : index))
  }

  const drawn: ChartProps = {
    era,
    race,
    band,
    bands,
    axisMax,
    onPick: pick,
    onKeyDown,
  }

  return (
    <div data-testid="speed-check-chart">
      <div style={{ display: 'flex', gap: spacing(2), alignItems: 'center', marginBottom: 6 }}>
        <div style={{ width: 190 }}>
          <Segmented
            label="How to draw the speed check"
            options={[
              { key: 'scatter', label: 'Scatter' },
              { key: 'gap', label: 'Gap by speed' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
      </div>

      <Chips
        label="Which Races the chart is drawing"
        options={[{ id: SEASON, label: season }]}
        value={raceId}
        onChange={setRaceId}
      />
      <ChipPicker
        label="Which Race the chart is lifting out"
        resting="All Races"
        options={raceOptions}
        value={raceId === SEASON ? '' : raceId}
        onChange={(id) => setRaceId(id === '' ? SEASON : id)}
      />
      <CalibrationRail
        channel="STW"
        log={log}
        races={railRaces}
        labels={labels}
        selectedRaceId={raceId === SEASON ? null : raceId}
      />

      {view === 'scatter' ? <Scatter {...drawn} /> : <Gap {...drawn} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2), marginTop: 4 }}>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)', flexShrink: 0 }}>fit</span>
        <div style={{ width: 230 }}>
          <Segmented
            label="How the line is fitted"
            options={[
              { key: 'orthogonal', label: 'both noisy' },
              { key: 'sog-on-stw', label: 'SOG on STW' },
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>
      </div>

      <Readout>
        {band === null ? (
          <Summary era={era} race={race} labels={labels} />
        ) : (
          <BandDetail band={band} bands={bands} line={lineOf(era, race)} race={race} />
        )}
      </Readout>

      <div style={{ marginTop: spacing(2) }}>
        <Coverage statement={speedCoverage(era)} />
      </div>

      {race !== null && !race.fit.fitted && (
        <Absent>
          {raceLabel(labels, race.race_id, race.sailed_at)} has no line of its own —{' '}
          {REASON_WORDS[race.fit.reason]}; its rows still count in the season.
        </Absent>
      )}

      <Notes>
        <Note label="How to read it">
          Dashed: the paddlewheel as configured — GPS speed equals paddlewheel speed. Blue: this
          Era’s fit, over the speeds it was fitted on and no wider.
          {race?.fit.fitted === true &&
            ` Amber: ${raceLabel(labels, race.race_id, race.sailed_at)}’s own line, against the Era’s.`}{' '}
          {METHOD_WORDS[method]}
        </Note>
        <Note label="Coverage">
          <BlankStw era={era} />
        </Note>
        <Note label="Caveat" tone="caveat">
          {PADDLEWHEEL_CAVEAT}
        </Note>
      </Notes>
    </div>
  )
}

/* ----------------------------------------------------------------------- shapes */

/** The line being read: one Race's own where a Race is picked, otherwise the Era's. */
function lineOf(era: EraDivergence, race: RaceDivergence | null): FittedLine | null {
  const outcome = race === null ? era.fit : race.fit
  return outcome.fitted ? outcome.line : null
}

/**
 * The fitted line's two ends in the gap view's own coordinates, or nothing.
 *
 * A list of nought or one, so the caller draws it without a null branch. Nothing where there is no
 * line, and nothing where `lineGapAt` declines either end — which it does outside the range the fit
 * was fitted on, and which no figure may stand in for.
 */
function gapEnds(
  line: FittedLine | null
): { from: { stw: number; gap: number }; to: { stw: number; gap: number } }[] {
  if (line === null) return []

  const [from, to] = line.ends
  const atFrom = lineGapAt(line, from.stw)
  const atTo = lineGapAt(line, to.stw)
  if (atFrom === null || atTo === null) return []

  return [{ from: { stw: from.stw, gap: atFrom }, to: { stw: to.stw, gap: atTo } }]
}

/** One band of the axis: the service's figure where it has one, and an honest gap where it does not. */
interface AxisBand {
  band: number
  gap: SpeedBandGap | null
}

/**
 * Every 1 kt band across the axis, including the ones with no rows.
 *
 * `gapBySpeedBand` returns only the bands it measured, which is right for arithmetic and wrong for
 * a chart: a speed the boat never sailed and a speed it sailed badly must not look alike, so the
 * empty ones are restored here and hatched rather than left as a silent gap in the row of ticks.
 */
function bandAxis(measured: readonly SpeedBandGap[], axisMax: number): AxisBand[] {
  const byBand = new Map(measured.map((gap) => [gap.band, gap]))
  return Array.from({ length: axisMax }, (_, band) => ({ band, gap: byBand.get(band) ?? null }))
}

/* ----------------------------------------------------------------------- readouts */

function BlankStw({ era }: { era: EraDivergence }): ReactElement {
  const { blank_stw, countable, excluded_blank_stw: excluded } = era.coverage

  if (blank_stw === 0) {
    const elsewhere = excluded.frozen + excluded.low_speed + excluded.maneuver_window
    return (
      <>
        No row the chart reads lacks an STW
        {elsewhere > 0
          ? `: all ${elsewhere} blank-STW rows in these Races were Frozen, Low-Speed or inside a Maneuver Window, and so were never Countable.`
          : ' anywhere in these Races.'}
      </>
    )
  }

  return (
    <>
      The paddlewheel said nothing on {blank_stw} of {countable} Countable rows here, which are
      counted and not plotted — a blank is not a reading of zero.
    </>
  )
}

function Summary({
  era,
  race,
  labels,
}: {
  era: EraDivergence
  race: RaceDivergence | null
  labels: RaceLabels
}): ReactElement {
  const line = lineOf(era, race)
  const name = race === null ? 'This Era' : raceLabel(labels, race.race_id, race.sailed_at)
  const gap = race === null ? era.measured_offset_knots : race.measured_offset_knots

  if (line === null) {
    const outcome = race === null ? era.fit : race.fit
    return (
      <div>
        {name} has no line — {outcome.fitted ? '' : REASON_WORDS[outcome.reason]}.
        {gap !== null && ` Its rows still read ${signedKnots(gap)} from 1:1 on average.`}
      </div>
    )
  }

  const atFour = lineGapAt(line, 4)
  const atEight = lineGapAt(line, 8)

  return (
    <>
      <Big>
        {gap === null ? '—' : signedKnots(gap)} · R² {line.r_squared.toFixed(2)}
      </Big>
      <div>
        {name}: GPS speed reads{' '}
        {gap === null
          ? 'no measurable gap from'
          : `${Math.abs(gap).toFixed(2)} kt ${gap >= 0 ? 'above' : 'below'}`}{' '}
        the paddlewheel over {rowsPhrase(line.points)}.
      </div>
      {/*
        The line's gap at two speeds, which is the `STW` card's own headline (ADR 0035) and the only
        reading of the drawn line that may be printed — never a slope. Two labelled figures rather
        than a clause naming both, so the speeds they belong to cannot drift from them.
      */}
      <Figures>
        <Figure
          label="line vs 1:1 at 4 kt"
          value={atFour === null ? 'off the chart' : signedKnots(atFour)}
        />
        <Figure label="at 8 kt" value={atEight === null ? 'off the chart' : signedKnots(atEight)} />
      </Figures>
    </>
  )
}

function BandDetail({
  band,
  bands,
  line,
  race,
}: {
  band: number
  bands: readonly AxisBand[]
  line: FittedLine | null
  race: RaceDivergence | null
}): ReactElement {
  const here = bands[band]?.gap ?? null
  const saysLine = line === null ? null : lineGapAt(line, band + 0.5)

  return (
    <>
      <Big>
        {band}–{band + 1} kt · {here === null ? 'no rows' : signedKnots(here.mean_gap_knots)}
      </Big>
      <div>
        {here === null
          ? // Two sentences and not one with a substitution in it: "No Race in this Era never
            // sailed this speed" is a double negative that says the opposite of both.
            race === null
            ? 'No Race in this Era sailed this speed.'
            : 'This Race never sailed this speed.'
          : `Over ${rowsPhrase(here.rows)}${
              race === null ? ` from ${racesPhrase(here.races)}, each weighted equally` : ''
            }.`}
      </div>
      {saysLine !== null && here !== null && (
        <div style={{ color: 'var(--text-muted)' }}>
          The straight line says {signedKnots(saysLine)} here
          {Math.abs(saysLine - here.mean_gap_knots) > 0.1
            ? ' — the rows disagree with it by more than 0.1 kt, which is the U a straight line cannot follow.'
            : '.'}
        </div>
      )}
    </>
  )
}

/* ----------------------------------------------------------------------- the two views */

interface ChartProps {
  era: EraDivergence
  race: RaceDivergence | null
  band: number | null
  bands: readonly AxisBand[]
  axisMax: number
  onPick: (band: number | null) => void
  onKeyDown: (event: KeyboardEvent) => void
}

/**
 * The scatter's plot is **square**, and that is not decoration.
 *
 * `SOG` and `STW` are the same quantity on the two axes, so one knot has to be the same number of
 * pixels on each: it is what puts the dashed 1:1 line at 45°, and a 45° line is the shape the eye
 * reads "the two instruments agree" off. In a 340x300 box the height is what binds, so the plot is
 * as wide as it is tall and the slack goes into the right-hand margin rather than into stretching
 * a knot.
 */
const SCATTER_PLOT = TUNING_CHART_HEIGHT - 10 - 26
const SCATTER_LEFT = 30
const SCATTER_TOP = 10
/** The baseline, which the x-axis labels sit under. */
const SCATTER_BOTTOM = SCATTER_TOP + SCATTER_PLOT

/** Every Race's points, so the season stays visible behind a picked Race rather than vanishing. */
function allPoints(era: EraDivergence): { race_id: string; points: readonly SpeedPoint[] }[] {
  return era.races.map((race) => ({ race_id: race.race_id, points: race.points }))
}

function Scatter({ era, race, band, axisMax, onPick, onKeyDown }: ChartProps): ReactElement {
  const perKnot = SCATTER_PLOT / axisMax
  const x = (knots: number): number => SCATTER_LEFT + knots * perKnot
  const y = (knots: number): number => SCATTER_BOTTOM - knots * perKnot

  const segment = (line: FittedLine, stroke: string, key: string): ReactElement => (
    <line
      key={key}
      x1={x(line.ends[0].stw)}
      y1={y(line.ends[0].sog)}
      x2={x(line.ends[1].stw)}
      y2={y(line.ends[1].sog)}
      stroke={stroke}
      strokeWidth="2.2"
      data-testid="fitted-line"
    />
  )

  const ticks = Array.from({ length: Math.floor(axisMax / 2) + 1 }, (_, step) => step * 2)

  return (
    <svg
      viewBox={TUNING_VIEW_BOX}
      role="img"
      tabIndex={0}
      aria-label="GPS speed against paddlewheel speed. Tap or use the arrow keys to pick a 1 knot band."
      data-testid="speed-scatter"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const tapped = svgPoint(event)
        if (tapped === null) return

        const picked = Math.floor((tapped.x - SCATTER_LEFT) / perKnot)
        onPick(picked >= 0 && picked < axisMax ? picked : null)
      }}
      style={CHART_SVG_STYLE}
    >
      {band !== null && (
        <rect
          x={x(band)}
          y={y(axisMax)}
          width={perKnot}
          height={axisMax * perKnot}
          fill="var(--state-warning)"
          opacity="0.14"
        />
      )}

      {ticks.map((knots) => (
        <g key={knots}>
          <line
            x1={x(knots)}
            x2={x(knots)}
            y1={y(0)}
            y2={y(axisMax)}
            stroke="var(--surface-divider)"
          />
          <line x1={x(0)} x2={x(axisMax)} y1={y(knots)} y2={y(knots)} stroke="var(--surface-divider)" />
          <text
            x={x(knots)}
            y={SCATTER_BOTTOM + 12}
            fontSize={CHART_FONT.tick}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {knots}
          </text>
          <text
            x={SCATTER_LEFT - 5}
            y={y(knots) + 3}
            fontSize={CHART_FONT.tick}
            textAnchor="end"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {knots}
          </text>
        </g>
      ))}
      <text
        x={TUNING_CHART_WIDTH - 4}
        y={SCATTER_BOTTOM + 12}
        fontSize={CHART_FONT.label}
        textAnchor="end"
        fill="var(--text-muted)"
      >
        STW kt
      </text>
      <text
        x={SCATTER_LEFT + 4}
        y={SCATTER_TOP + CHART_FONT.label}
        fontSize={CHART_FONT.label}
        fill="var(--text-muted)"
      >
        SOG kt
      </text>

      {allPoints(era).map((group) =>
        group.points.map((point) => (
          <circle
            key={`${group.race_id}-${point.row_index}`}
            cx={x(point.stw)}
            cy={y(point.sog)}
            r="1.3"
            fill="var(--text-muted)"
            opacity={race === null ? 0.28 : 0.1}
          />
        ))
      )}
      {race?.points.map((point) => (
        <circle
          key={`picked-${point.row_index}`}
          cx={x(point.stw)}
          cy={y(point.sog)}
          r="2.2"
          fill="var(--state-warning)"
          opacity="0.8"
        />
      ))}

      <line
        x1={x(0)}
        y1={y(0)}
        x2={x(axisMax)}
        y2={y(axisMax)}
        stroke="var(--text-primary)"
        strokeDasharray="4 3"
        data-testid="one-to-one"
      />
      {/*
        Both lines, where a Race is picked and has one. The Era's stays drawn behind the Race's own
        in blue, because the question a picked Race asks is how far it sits from the season — and a
        chart that replaced one line with the other answers a different question silently.
      */}
      {era.fit.fitted && segment(era.fit.line, 'var(--text-accent)', 'era')}
      {race?.fit.fitted === true &&
        segment(race.fit.line, 'var(--state-warning)', 'race')}
    </svg>
  )
}

/** Knots of gap from 1:1 beyond which the view clips rather than rescaling under the reader. */
const GAP_CLIP_KNOTS = 1.6

function Gap({ era, race, band, bands, axisMax, onPick, onKeyDown }: ChartProps): ReactElement {
  const column = LINEAR_PLOT_WIDTH / axisMax
  // The same half-height the compass strip uses, so the two linear charts on this screen draw
  // their zero lines at the same place and read as one instrument.
  const perKnotGap = LINEAR.halfHeight / GAP_CLIP_KNOTS

  const x = (knots: number): number => LINEAR.axisLeft + knots * column
  const y = (gap: number): number =>
    LINEAR.zeroY - Math.max(-GAP_CLIP_KNOTS, Math.min(GAP_CLIP_KNOTS, gap)) * perKnotGap

  const line = lineOf(era, race)
  const shown = race === null ? era.races : [race]
  const busiest = bands.reduce((most, at) => Math.max(most, at.gap?.rows ?? 0), 1)

  return (
    <svg
      viewBox={TUNING_VIEW_BOX}
      role="img"
      tabIndex={0}
      aria-label="GPS speed minus paddlewheel speed, by boat speed. Tap or use the arrow keys to pick a 1 knot band."
      data-testid="speed-gap"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const tapped = svgPoint(event)
        if (tapped === null) return

        const picked = Math.floor((tapped.x - LINEAR.axisLeft) / column)
        onPick(picked >= 0 && picked < axisMax ? picked : null)
      }}
      style={CHART_SVG_STYLE}
    >
      <HatchDef id="speed-gap-hatch" />

      {band !== null && (
        <rect
          x={x(band)}
          y={0}
          width={column}
          height={LINEAR.evidenceY + LINEAR.evidenceHeight}
          fill="var(--state-warning)"
          opacity="0.14"
        />
      )}

      {[-1, -0.5, 0.5, 1].map((gap) => (
        <g key={gap}>
          <line
            x1={LINEAR.axisLeft}
            x2={TUNING_CHART_WIDTH - LINEAR.axisRight}
            y1={y(gap)}
            y2={y(gap)}
            stroke="var(--surface-divider)"
            strokeDasharray="2 3"
          />
          <text
            x={LINEAR.axisLeft - 5}
            y={y(gap) + 3}
            fontSize={CHART_FONT.tick}
            textAnchor="end"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {gap > 0 ? `+${gap}` : gap}
          </text>
        </g>
      ))}

      {/* 1:1 lies flat here, which is the whole point of this view. */}
      <line
        x1={LINEAR.axisLeft}
        x2={TUNING_CHART_WIDTH - LINEAR.axisRight}
        y1={LINEAR.zeroY}
        y2={LINEAR.zeroY}
        stroke="var(--text-primary)"
        strokeDasharray="4 3"
        data-testid="one-to-one"
      />
      <text
        x={TUNING_CHART_WIDTH - LINEAR.axisRight}
        y={LINEAR.zeroY + 12}
        fontSize={CHART_FONT.note}
        textAnchor="end"
        fill="var(--text-muted)"
      >
        1:1 · as configured
      </text>

      {shown.map((candidate) =>
        candidate.points.map((point) => (
          <circle
            key={`${candidate.race_id}-${point.row_index}`}
            cx={x(point.stw)}
            cy={y(point.sog - point.stw)}
            r="1.2"
            fill="var(--text-muted)"
            opacity={race === null ? 0.16 : 0.5}
          />
        ))
      )}

      {bands.map((at) =>
        at.gap === null ? (
          <rect
            key={at.band}
            data-testid="speed-absent-band"
            x={x(at.band) + 1}
            y={y(GAP_CLIP_KNOTS)}
            width={Math.max(0.5, column - 2)}
            height={y(-GAP_CLIP_KNOTS) - y(GAP_CLIP_KNOTS)}
            fill="url(#speed-gap-hatch)"
          />
        ) : (
          <line
            key={at.band}
            x1={x(at.band) + 3}
            x2={x(at.band + 1) - 3}
            y1={y(at.gap.mean_gap_knots)}
            y2={y(at.gap.mean_gap_knots)}
            stroke="var(--text-primary)"
            strokeWidth="3"
          />
        )
      )}

      {/*
        The fit as a straight line against the flat 1:1, so the U the rows make around it shows.
        Drawn from `lineGapAt` at its own two ends, and not drawn at all where either comes back
        null — a `?? 0` here would put an end point on the 1:1 line, which is a claim that the fit
        agrees with the paddlewheel exactly there.
      */}
      {gapEnds(line).map((ends) => (
        <line
          key="fit"
          x1={x(ends.from.stw)}
          y1={y(ends.from.gap)}
          x2={x(ends.to.stw)}
          y2={y(ends.to.gap)}
          stroke={race === null ? 'var(--text-accent)' : 'var(--state-warning)'}
          strokeWidth="2"
          data-testid="fitted-line"
        />
      ))}

      {Array.from({ length: axisMax + 1 }, (_, knots) => (
        <text
          key={knots}
          x={x(knots)}
          y={LINEAR.columnLabelY}
          fontSize={CHART_FONT.tick}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontFamily="var(--font-mono)"
        >
          {knots}
        </text>
      ))}
      <text
        x={TUNING_CHART_WIDTH - LINEAR.axisRight}
        y={LINEAR.columnLabelY + 12}
        fontSize={CHART_FONT.label}
        textAnchor="end"
        fill="var(--text-muted)"
      >
        STW kt
      </text>

      <text
        x={LINEAR.axisLeft - 5}
        y={LINEAR.evidenceY + LINEAR.evidenceHeight - 4}
        fontSize={CHART_FONT.micro}
        textAnchor="end"
        fill="var(--text-muted)"
      >
        rows
      </text>
      {bands.map((at) => (
        <g key={`rows-${at.band}`}>
          <rect
            x={x(at.band) + 1}
            y={LINEAR.evidenceY}
            width={Math.max(0.5, column - 2)}
            height={LINEAR.evidenceHeight}
            fill={at.gap === null ? 'url(#speed-gap-hatch)' : 'var(--text-primary)'}
            opacity={at.gap === null ? 1 : 0.08 + 0.5 * Math.min(1, at.gap.rows / busiest)}
          />
          <text
            x={x(at.band) + column / 2}
            y={LINEAR.evidenceY + LINEAR.evidenceHeight - 4}
            fontSize={CHART_FONT.micro}
            textAnchor="middle"
            fill="var(--text-primary)"
            fontFamily="var(--font-mono)"
          >
            {at.gap?.rows ?? ''}
          </text>
        </g>
      ))}
    </svg>
  )
}

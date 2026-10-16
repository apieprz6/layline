'use client'

/**
 * Boat speed: does the paddlewheel need recalibrating? The answer first, then three ways to see why.
 *
 * - **The verdict** leads, in a sentence, because it is the question the card exists to answer
 *   (ADR 0041). It reads the Era's points only, so it is the same under either fit method.
 * - **Chart** (default): one column per knot of `STW`, every Race's own average gap as a dot and
 *   the season's as a bar, against a close-enough stripe around zero. A column whose dots sit
 *   together outside the stripe is the paddlewheel; dots strung across it are current and noise.
 *   This is the view that shows the gap is **U-shaped** — slow at 2–4 kt, spot on from 4 to 9 —
 *   which is why the answer on the owner's season is "leave it".
 * - **Checklist**: the five questions the verdict was drawn from, each with its evidence.
 * - **Scatter**: `SOG` on `STW` with the 1:1 line dashed — where the dots would sit if the
 *   paddlewheel were spot on, its calibration being in every row already — and **the fitted line
 *   drawn**, because the owner's review asked for it to stay on screen.
 *
 * **The line is fitted orthogonally by default**, treating both instruments as noisy, which is what
 * they are; a toggle under the scatter switches to ADR 0027's `SOG`-on-`STW` regression. On this
 * archive one says the paddlewheel over-reads at speed and the other that it under-reads, and least
 * squares on one variable is biased flat by noise in the other. The toggle lives with the scatter
 * because the scatter is the only view with a line in it.
 *
 * **No coefficient is ever printed** — not the slope, not the intercept, not a percentage, however
 * labelled, because each is a drafted correction (ADR 0027, LAY-138 decision 7, ADR 0041). The
 * service hands this component two end points of a segment and `R²`, and the verdict hands it
 * gaps in knots at stated speeds; nothing else.
 */

import { useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { speedCoverage } from '@/services/analysis/coverage-verdict'
import type { OfferedFitMethod } from '@/services/analysis/instrument-tuning'
import {
  HEADLINE_SPEEDS_KNOTS,
  lineGapAt,
  type EraDivergence,
  type FittedLine,
  type RaceDivergence,
  type SpeedBandGap,
  type SpeedPoint,
} from '@/services/analysis/paddlewheel'
import {
  CLOSE_ENOUGH_KNOTS,
  MIN_RACES_PER_BAND,
  MIN_ROWS_PER_RACE,
  paddlewheelVerdict,
  type PaddlewheelVerdict,
  type SpeedBandRead,
} from '@/services/analysis/paddlewheel-verdict'
import type { CalibrationLogEntry } from '@/types'

import CalibrationRail, { type RailRace } from './CalibrationRail'
import { BAND_COLOUR, BAND_WORDS, Checklist, VerdictBanner, slowFast } from './SpeedVerdict'
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
  NO_FIT_WORDS as REASON_WORDS,
  raceLabel,
  races as racesPhrase,
  rows as rowsPhrase,
  signedKnots,
  type RaceLabels,
} from './chart-text'

type View = 'chart' | 'checklist' | 'scatter'

const SEASON = 'season'

/** The speed axis never shrinks below this, so a light-air season is not drawn as a fast one. */
const MIN_AXIS_KNOTS = 10

/**
 * The `STW` caveat — the one of the three the services do not carry.
 *
 * The other two travel with their figures because each is about how the figure was *derived*: a
 * compass read through `CTW`, an apparent wind recomputed by qtVlm. This one is about the venue:
 * the verdict can see a current that swings with heading, but a steady set along the course would
 * look like the paddlewheel to every check it makes, and only knowing the water rules that out.
 */
const PADDLEWHEEL_CAVEAT =
  'Current moves SOG and leaves STW alone, so it reads here as a paddlewheel error. The verdict ' +
  'checks whether the gap swings with heading, which current does; a steady current along the ' +
  'course would still go unseen. The display applies the Instrument Calibration before the ' +
  'recording is written, so every STW here already carries it; no uncorrected reading is ' +
  'reconstructed.'

const METHOD_WORDS: Record<OfferedFitMethod, string> = {
  orthogonal: 'The fit treats GPS and paddlewheel as equally imperfect.',
  'sog-on-stw': 'The fit treats the paddlewheel as exact, which tilts the line flatter than it should be.',
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
  const [view, setView] = useState<View>('chart')
  const [method, setMethod] = useState<OfferedFitMethod>('orthogonal')
  const [raceId, setRaceId] = useState<string>(SEASON)
  const [band, setBand] = useState<number | null>(null)

  const era = byMethod[method]
  const race = era.races.find((candidate) => candidate.race_id === raceId) ?? null
  // The points, not the line: the same Era under either method, so it is read once.
  const verdict = useMemo(() => paddlewheelVerdict(byMethod.orthogonal), [byMethod.orthogonal])

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
    verdict,
    axisMax,
    onPick: pick,
    onKeyDown,
  }

  return (
    <div data-testid="speed-check-chart">
      <VerdictBanner verdict={verdict} />

      <div style={{ width: 270, marginBottom: 6 }}>
        <Segmented
          label="How to see why"
          options={[
            { key: 'chart', label: 'Chart' },
            { key: 'checklist', label: 'Checklist' },
            { key: 'scatter', label: 'Scatter' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {/* The checklist answers for the Era as a whole, so it has no Race to lift out. */}
      {view !== 'checklist' && (
        <>
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
        </>
      )}
      <CalibrationRail
        channel="STW"
        log={log}
        races={railRaces}
        labels={labels}
        selectedRaceId={raceId === SEASON || view === 'checklist' ? null : raceId}
      />

      {view === 'chart' && <Bands {...drawn} />}
      {view === 'checklist' && <Checklist verdict={verdict} />}
      {view === 'scatter' && (
        <>
          <Scatter {...drawn} />
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
        </>
      )}

      {view !== 'checklist' && (
        <Readout>
          {view === 'chart' ? (
            band === null ? (
              <div style={{ color: 'var(--text-muted)' }}>Tap a speed to see the Races behind it.</div>
            ) : (
              <BandVerdictDetail band={band} read={verdict.bands[band] ?? null} era={era} race={race} labels={labels} />
            )
          ) : band === null ? (
            <Summary era={era} race={race} labels={labels} />
          ) : (
            <BandDetail band={band} bands={bands} line={lineOf(era, race)} race={race} />
          )}
        </Readout>
      )}

      <div style={{ marginTop: spacing(2) }}>
        <Coverage statement={speedCoverage(era)} />
      </div>

      {view === 'scatter' && race !== null && !race.fit.fitted && (
        <Absent>
          {raceLabel(labels, race.race_id, race.sailed_at)} has no line of its own —{' '}
          {REASON_WORDS[race.fit.reason]}; its rows still count in the season.
        </Absent>
      )}

      <Notes>
        {view !== 'checklist' && (
          <Note label="How to read it">
            {view === 'chart' ? (
              <>
                Each dot is one Race’s average at that speed; the bar is the season. Green stripe:
                within {CLOSE_ENOUGH_KNOTS} kt of GPS, too close to tell from current. A speed needs{' '}
                {MIN_RACES_PER_BAND} Races with {MIN_ROWS_PER_RACE} rows each there for a verdict.
                {race !== null &&
                  ` Ringed: ${raceLabel(labels, race.race_id, race.sailed_at)}.`}
              </>
            ) : (
              <>
                Each dot is one moment: paddlewheel speed across, GPS speed up. Dashed: where the dots
                would sit if the paddlewheel were spot on — above it the paddlewheel read slow, below
                it fast. Blue: the trend through the dots.
                {race?.fit.fitted === true &&
                  ` Amber: ${raceLabel(labels, race.race_id, race.sailed_at)} alone.`}{' '}
                {METHOD_WORDS[method]}
              </>
            )}
          </Note>
        )}
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
        {HEADLINE_SPEEDS_KNOTS.map((knots, index) => {
          const at = lineGapAt(line, knots)
          return (
            <Figure
              key={knots}
              // The first names what the pair is; the second is read as the same thing again.
              label={index === 0 ? `line vs 1:1 at ${knots} kt` : `at ${knots} kt`}
              value={at === null ? 'off the chart' : signedKnots(at)}
            />
          )
        })}
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

/* ----------------------------------------------------------------------- the views */

interface ChartProps {
  era: EraDivergence
  race: RaceDivergence | null
  band: number | null
  bands: readonly AxisBand[]
  verdict: PaddlewheelVerdict
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

/** Knots of gap from 1:1 beyond which the chart clips rather than rescaling under the reader. */
const BAND_CLIP_KNOTS = 1

/** A Race's rows in one band of `STW`. */
function rowsIn(race: RaceDivergence, band: number): number {
  return race.points.filter((point) => Math.floor(point.stw) === band).length
}

/**
 * The verdict's own picture: per knot of `STW`, every counted Race's mean gap as a dot, the
 * season's as a bar in the band's verdict colour, and the close-enough stripe around zero.
 *
 * No fitted line here. The question this view answers is whether the Races agree at each speed,
 * and a straight line through a U would draw a disagreement the verdict does not rest on. The line
 * lives on the scatter.
 */
function Bands({ race, band, bands, verdict, axisMax, onPick, onKeyDown }: ChartProps): ReactElement {
  const column = LINEAR_PLOT_WIDTH / axisMax
  // The same half-height the compass strip uses, so the two linear charts on this screen draw
  // their zero lines at the same place and read as one instrument.
  const perKnotGap = LINEAR.halfHeight / BAND_CLIP_KNOTS

  const x = (knots: number): number => LINEAR.axisLeft + knots * column
  const y = (gap: number): number =>
    LINEAR.zeroY - Math.max(-BAND_CLIP_KNOTS, Math.min(BAND_CLIP_KNOTS, gap)) * perKnotGap

  const busiest = bands.reduce((most, at) => Math.max(most, at.gap?.rows ?? 0), 1)

  return (
    <svg
      viewBox={TUNING_VIEW_BOX}
      role="img"
      tabIndex={0}
      aria-label="Each Race’s gap between GPS and paddlewheel speed, by boat speed. Tap or use the arrow keys to pick a 1 knot band."
      data-testid="speed-bands"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const tapped = svgPoint(event)
        if (tapped === null) return

        const picked = Math.floor((tapped.x - LINEAR.axisLeft) / column)
        onPick(picked >= 0 && picked < axisMax ? picked : null)
      }}
      style={CHART_SVG_STYLE}
    >
      <HatchDef id="speed-bands-hatch" />

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

      <rect
        data-testid="close-enough"
        x={LINEAR.axisLeft}
        y={y(CLOSE_ENOUGH_KNOTS)}
        width={LINEAR_PLOT_WIDTH}
        height={y(-CLOSE_ENOUGH_KNOTS) - y(CLOSE_ENOUGH_KNOTS)}
        fill="var(--state-success)"
        opacity="0.12"
      />

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
            {Math.abs(gap)}
          </text>
        </g>
      ))}
      {/* Slow and fast, in words, so the axis never asks which instrument was subtracted. */}
      <text
        x={LINEAR.axisLeft + 3}
        y={y(BAND_CLIP_KNOTS) - 3}
        fontSize={CHART_FONT.label}
        fill="var(--state-warning)"
      >
        ↑ reads slow
      </text>
      <text
        x={LINEAR.axisLeft + 3}
        y={y(-BAND_CLIP_KNOTS) + 11}
        fontSize={CHART_FONT.label}
        fill="var(--state-info)"
      >
        ↓ reads fast
      </text>

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
        y={y(-CLOSE_ENOUGH_KNOTS) + 10}
        fontSize={CHART_FONT.note}
        textAnchor="end"
        fill="var(--state-success)"
      >
        close enough · ±{CLOSE_ENOUGH_KNOTS} kt
      </text>

      {Array.from({ length: axisMax }, (_, at) => {
        const read: SpeedBandRead | undefined = verdict.bands[at]
        if (read === undefined || read.rows === 0) {
          return (
            <rect
              key={at}
              data-testid="speed-absent-band"
              x={x(at) + 1}
              y={y(BAND_CLIP_KNOTS)}
              width={Math.max(0.5, column - 2)}
              height={y(-BAND_CLIP_KNOTS) - y(BAND_CLIP_KNOTS)}
              fill="url(#speed-bands-hatch)"
            />
          )
        }

        const colour = BAND_COLOUR[read.verdict]
        const middle = x(at) + column / 2
        const gaps = read.races.map((counted) => counted.mean_gap_knots)
        const picked = race === null ? undefined : read.races.find((counted) => counted.race_id === race.race_id)

        return (
          <g key={at}>
            {gaps.length > 1 && (
              <line
                x1={middle}
                x2={middle}
                y1={y(Math.max(...gaps))}
                y2={y(Math.min(...gaps))}
                stroke={colour}
                opacity="0.6"
              />
            )}
            {read.races.map((counted) => (
              <circle
                key={counted.race_id}
                data-testid="speed-race-dot"
                cx={middle}
                cy={y(counted.mean_gap_knots)}
                r="2.4"
                fill={colour}
                opacity={read.verdict === 'thin' ? 0.35 : 0.55}
              />
            ))}
            {picked !== undefined && (
              <circle
                data-testid="speed-picked-dot"
                cx={middle}
                cy={y(picked.mean_gap_knots)}
                r="4.2"
                fill="none"
                stroke="var(--text-primary)"
                strokeWidth="1.5"
              />
            )}
            {read.verdict !== 'thin' && read.mean_gap_knots !== null && (
              <line
                data-testid="speed-band-mean"
                data-verdict={read.verdict}
                x1={x(at) + 3}
                x2={x(at + 1) - 3}
                y1={y(read.mean_gap_knots)}
                y2={y(read.mean_gap_knots)}
                stroke={colour}
                strokeWidth="3.5"
              />
            )}
          </g>
        )
      })}

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
            fill={at.gap === null ? 'url(#speed-bands-hatch)' : 'var(--text-primary)'}
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

/** A tapped speed on the chart: its verdict, how many Races agree, and each Race's own figure. */
function BandVerdictDetail({
  band,
  read,
  era,
  race,
  labels,
}: {
  band: number
  read: SpeedBandRead | null
  era: EraDivergence
  race: RaceDivergence | null
  labels: RaceLabels
}): ReactElement {
  const range = `${band}–${band + 1} kt`

  if (read === null || read.rows === 0) {
    return (
      <>
        <Big>{range} · no rows</Big>
        <div>No Race in this Era sailed this speed.</div>
      </>
    )
  }

  const nameOf = (race_id: string): string => {
    const sailed = era.races.find((candidate) => candidate.race_id === race_id)
    return sailed === undefined ? race_id : raceLabel(labels, race_id, sailed.sailed_at)
  }
  const pickedHere = race === null ? null : read.races.find((counted) => counted.race_id === race.race_id)
  const pickedRows = race === null ? 0 : rowsIn(race, band)

  return (
    <>
      <Big>
        {range} · {BAND_WORDS[read.verdict]}
        {read.verdict !== 'thin' && read.mean_gap_knots !== null && ` · ${slowFast(read.mean_gap_knots)}`}
      </Big>
      <div>
        {read.verdict === 'thin'
          ? `${read.races.length === 0 ? 'No Race' : `Only ${racesPhrase(read.races.length)}`} sailed long enough at this speed to count — a verdict needs ${MIN_RACES_PER_BAND}.`
          : `${read.agreeing} of ${racesPhrase(read.races.length)} lean the same way.`}
      </div>
      {race !== null && (
        <div>
          {pickedHere !== undefined && pickedHere !== null
            ? `${raceLabel(labels, race.race_id, race.sailed_at)} here: ${slowFast(pickedHere.mean_gap_knots)}.`
            : pickedRows === 0
              ? 'This Race never sailed this speed.'
              : `This Race has ${rowsPhrase(pickedRows)} here, too few to count.`}
        </div>
      )}
      {read.races.length > 0 && (
        <div style={{ color: 'var(--text-muted)' }}>
          {read.races
            .map((counted) => `${nameOf(counted.race_id)}: ${slowFast(counted.mean_gap_knots)}`)
            .join(' · ')}
        </div>
      )}
    </>
  )
}

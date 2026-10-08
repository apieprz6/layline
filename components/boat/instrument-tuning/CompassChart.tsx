'use client'

/**
 * The `HDG` **Measured Offset** by heading: one measurement, two drawings of it.
 *
 * The compass error is a **curve, not an offset** — on this archive it reads about +12.7° heading
 * NNE and −8.9° heading WSW since the 4 July autocompensation, a 22° swing, and the card's single
 * mean is an average of that. So the chart's job is to show the shape, and there are two forms a
 * sailor reads a shape like this in:
 *
 * - **Strip** (default): one column per 10° bin across 0–360°, which is the form that stays legible
 *   at 390px, with an evidence row beneath saying how many Races each heading rests on.
 * - **Rose**: the same bins laid on a compass rose, which is the form a deviation card is printed
 *   in and the one that makes a one-cycle swing obvious.
 *
 * **One state behind both.** The overlay and the selected heading survive the toggle, so flipping
 * views never loses the sailor's place — which is the reason ADR 0034 made this a toggle rather
 * than two stacked charts, on a sheet that cannot afford two charts' height anyway.
 *
 * Absence is drawn as absence. A heading no Race held three rows on is **hatched, with no line or
 * bar across it** and never interpolated; a bin resting on a single Race is drawn hollow, because
 * one Race's bin is that Race's heading mix rather than the Era's.
 *
 * Diagnostic only. Nothing here is a value to type into the compass, and the caveat that travels
 * with the figure says why it could not be: the export carries no `HDG` column, so this is measured
 * through `CTW`, and `CTW = HDG + leeway`.
 */

import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { BIN_SIZE_DEG, MIN_ROWS_PER_BIN } from '@/services/analysis/compass-deviation'
import { headingCoverage } from '@/services/analysis/coverage-verdict'
import type { CalibrationLogEntry, EraHeadingBin, EraHeadingOffset, HeadingBin } from '@/types'

import CalibrationRail, { railRacesFrom } from './CalibrationRail'
import {
  Big,
  CHART_SVG_STYLE,
  TUNING_CHART_WIDTH,
  Caption,
  Chips,
  Coverage,
  DetailRow,
  HatchDef,
  Readout,
  Segmented,
  arrowStep,
  svgPoint,
  type ChipOption,
} from './chart-furniture'
import {
  compassPoint,
  eraLabel,
  raceLabel,
  races as racesPhrase,
  rows as rowsPhrase,
  shortDate,
  signedDegrees,
  type RaceLabels,
} from './chart-text'

type View = 'strip' | 'rose'

/** Any series of bins the chart can draw a curve through: an Era's, or one Race's. */
type Curve = readonly Pick<EraHeadingBin, 'mean_error_deg'>[]

/** The overlay chip's value: no overlay, the Era before this one, or one Race by id. */
const NO_OVERLAY = 'none'
const PREVIOUS_ERA = 'previous'

interface CompassChartProps {
  /** The Era being read. Always drawn. */
  era: EraHeadingOffset
  /**
   * The Era before it, drawn as a dashed line and **on by default**.
   *
   * On by default because "the autocompensation moved the curve and left its shape" is the most
   * important thing this archive knows about this compass, and it cannot be seen one Era at a time.
   * Null where this is the first Era, and then the chip is not offered.
   */
  previous: EraHeadingOffset | null
  /** The whole Calibration Log, for the rail's dashed rules. */
  log: readonly CalibrationLogEntry[]
  labels: RaceLabels
}

export default function CompassChart({
  era,
  previous,
  log,
  labels,
}: CompassChartProps): ReactElement {
  const [view, setView] = useState<View>('strip')
  const [overlay, setOverlay] = useState<string>(previous === null ? NO_OVERLAY : PREVIOUS_ERA)
  const [bin, setBin] = useState<number | null>(null)

  const binCount = era.bins.length
  const overlaidRace = era.races.find((race) => race.race_id === overlay) ?? null
  const excludedRace = era.excluded.find((race) => race.race_id === overlay) ?? null

  const chips: ChipOption[] = [
    { id: NO_OVERLAY, label: `This Era · ${eraLabel(era.era)}` },
    ...(previous === null
      ? []
      : [{ id: PREVIOUS_ERA, label: `+ before ${shortDate(era.era.from_date ?? '')}` }]),
    ...[...era.races]
      .reverse()
      .map((race) => ({ id: race.race_id, label: `+ ${raceLabel(labels, race.race_id, race.window_start)}` })),
    ...[...era.excluded].reverse().map((race) => ({
      id: race.race_id,
      label: `+ ${raceLabel(labels, race.race_id, race.window_start)}`,
      emptyReason: `only ${rowsPhrase(race.row_count)} this check could read`,
    })),
  ]


  const onKeyDown = (event: KeyboardEvent): void => {
    const step = arrowStep(event)
    if (step === null || binCount === 0) return
    setBin((at) => ((at ?? (step > 0 ? -1 : 0)) + step + binCount) % binCount)
  }

  const pick = (index: number | null): void => {
    setBin((at) => (index !== null && index === at ? null : index))
  }

  const drawn: ChartProps = {
    bins: era.bins,
    bin,
    onPick: pick,
    onKeyDown,
    previousBins: overlay === PREVIOUS_ERA ? (previous?.bins ?? null) : null,
    raceBins: overlaidRace?.bins ?? null,
  }

  return (
    <div data-testid="compass-chart">
      <div style={{ display: 'flex', gap: spacing(2), alignItems: 'center', marginBottom: 6 }}>
        <div style={{ width: 150 }}>
          <Segmented
            label="How to draw the compass error"
            options={[
              { key: 'strip', label: 'Strip' },
              { key: 'rose', label: 'Rose' },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
          same data · tap a heading
        </span>
      </div>

      <Chips
        label="What to draw over this Era's curve"
        options={chips}
        value={overlay}
        onChange={setOverlay}
      />
      <CalibrationRail
        channel="HDG"
        log={log}
        races={railRacesFrom(era.races, era.excluded)}
        labels={labels}
        selectedRaceId={overlaidRace?.race_id ?? excludedRace?.race_id ?? null}
      />

      {view === 'strip' ? <Strip {...drawn} /> : <Rose {...drawn} />}

      <Readout>
        {bin === null ? (
          <Summary era={era} />
        ) : (
          <BinDetail era={era} previous={previous} bin={bin} labels={labels} overlay={overlay} />
        )}
      </Readout>

      <div style={{ marginTop: spacing(2) }}>
        <Coverage statement={headingCoverage(era)} />
      </div>

      <Caption>
        The error at each {BIN_SIZE_DEG}° of heading — the resolution the fluxgate builds its own
        deviation table at.{' '}
        {view === 'strip'
          ? 'Above the line reads high.'
          : 'Outside the ring reads high, inside reads low.'}{' '}
        Hollow: the heading rests on one Race. Hatched: no Race held {MIN_ROWS_PER_BIN} rows there,
        and nothing is drawn across it.
        {overlay === PREVIOUS_ERA && previous !== null && ' Dashed: the Era before this one.'}
        {overlaidRace !== null &&
          ` Amber: ${raceLabel(labels, overlaidRace.race_id, overlaidRace.window_start)} alone, ${Math.round(
            overlaidRace.heading_coverage * 100
          )}% of the rose.`}
        {excludedRace !== null &&
          ` ${raceLabel(labels, excludedRace.race_id, excludedRace.window_start)} produced no curve — only ${rowsPhrase(
            excludedRace.row_count
          )} this check could read.`}
      </Caption>
    </div>
  )
}

/* ----------------------------------------------------------------------- readouts */

function Summary({ era }: { era: EraHeadingOffset }): ReactElement {
  const { swing } = era

  if (swing === null) {
    return (
      <div>
        No heading in this Era rests on {MIN_ROWS_PER_BIN} rows of any Race, so there is no curve to
        read. {racesPhrase(era.race_count)} measured; {era.excluded.length} produced nothing.
      </div>
    )
  }

  return (
    <>
      <Big>
        {signedDegrees(swing.highest.mean_error_deg)} heading{' '}
        {compassPoint(swing.highest.bin_center_deg)} ·{' '}
        {signedDegrees(swing.lowest.mean_error_deg)} heading{' '}
        {compassPoint(swing.lowest.bin_center_deg)}
      </Big>
      <div>
        The error swings {swing.swing_deg.toFixed(0)}° with heading, so any single figure for this
        compass is an average of a curve
        {era.mean_of_races_deg === null
          ? ''
          : ` — ${signedDegrees(era.mean_of_races_deg)} weighting every Race equally`}
        {era.mean_of_bins_deg === null
          ? ''
          : `, ${signedDegrees(era.mean_of_bins_deg)} weighting every heading equally`}
        .{' '}
        {/* What the curve could not be read at all. The coverage line beneath states how many
            headings rest on two or more Races; this states how many rest on none, which is a
            different fact and the one that says how much of the rose is simply blank. */}
        {era.heading_bin_count - era.headings_covered > 0 &&
          `${era.heading_bin_count - era.headings_covered} of ${era.heading_bin_count} headings were never sailed long enough to read.`}
      </div>
    </>
  )
}

function BinDetail({
  era,
  previous,
  bin,
  labels,
  overlay,
}: {
  era: EraHeadingOffset
  previous: EraHeadingOffset | null
  bin: number
  labels: RaceLabels
  overlay: string
}): ReactElement {
  const now = era.bins[bin]
  const before = previous?.bins[bin] ?? null
  const start = now.bin_start_deg

  // Every Race that put a row in this bin, including the ones whose bin fell under the gate —
  // listed as not counted rather than omitted, so "nobody sailed here" and "nobody sailed here
  // long enough" are different sentences (ADR 0034).
  const behind = era.races.filter((race) => race.bins[bin].row_count > 0)

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: spacing(2),
          alignItems: 'baseline',
        }}
      >
        <Big>
          {start}°–{start + BIN_SIZE_DEG}° · {compassPoint(now.bin_center_deg)}
        </Big>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>
          {now.mean_error_deg === null ? 'no figure' : signedDegrees(now.mean_error_deg)} now
          {previous !== null &&
            ` · ${before?.mean_error_deg == null ? '—' : signedDegrees(before.mean_error_deg)} before`}
        </span>
      </div>

      {behind.length === 0 ? (
        <div>No Race in this Era sailed this heading.</div>
      ) : (
        behind.map((race) => {
          const theirs: HeadingBin = race.bins[bin]
          return (
            <DetailRow
              key={race.race_id}
              emphasis={race.race_id === overlay}
              name={raceLabel(labels, race.race_id, race.window_start)}
              figure={
                theirs.mean_error_deg === null
                  ? `${rowsPhrase(theirs.row_count)} — under ${MIN_ROWS_PER_BIN}, not counted`
                  : `${signedDegrees(theirs.mean_error_deg)} · ${rowsPhrase(theirs.row_count)}`
              }
            />
          )
        })
      )}
    </>
  )
}

/* ----------------------------------------------------------------------- the two views */

interface ChartProps {
  bins: readonly EraHeadingBin[]
  bin: number | null
  onPick: (bin: number | null) => void
  onKeyDown: (event: KeyboardEvent) => void
  previousBins: Curve | null
  raceBins: Curve | null
}

/** Degrees beyond which a bar is clipped rather than rescaling the axis under the reader. */
const CLIP_DEG = 27

/**
 * How far a hatched bin's mark extends, in degrees of the error axis.
 *
 * Inside `CLIP_DEG` on purpose: a hatch that filled the plot to its very edge would read as a bar
 * at the maximum rather than as "nothing was measured here", which is the one thing it has to say.
 */
const HATCH_DEG = 22
const GRID_DEG = [-20, -10, 10, 20]

const AXIS_LEFT = 26
const PLOT_WIDTH = TUNING_CHART_WIDTH - AXIS_LEFT - 6

function Strip({
  bins,
  bin,
  onPick,
  onKeyDown,
  previousBins,
  raceBins,
}: ChartProps): ReactElement {
  const height = 150
  const mid = 70
  const perDegree = 2.2
  const column = PLOT_WIDTH / bins.length

  const y = (error: number): number =>
    mid - Math.max(-CLIP_DEG, Math.min(CLIP_DEG, error)) * perDegree
  const centre = (index: number): number => AXIS_LEFT + index * column + column / 2

  /** A curve as a path, lifted at every bin with no figure. Never bridged across a gap. */
  const path = (curve: Curve): string =>
    curve
      .map((at, index) =>
        at.mean_error_deg === null
          ? null
          : `${index === 0 || curve[index - 1].mean_error_deg === null ? 'M' : 'L'} ${centre(
              index
            )} ${y(at.mean_error_deg)}`
      )
      .filter((step) => step !== null)
      .join(' ')

  return (
    <svg
      viewBox={`0 0 ${TUNING_CHART_WIDTH} ${height + 34}`}
      role="img"
      tabIndex={0}
      aria-label="Compass error by heading, as a strip. Tap or use the arrow keys to pick a heading."
      data-testid="compass-strip"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const tapped = svgPoint(event)
        if (tapped === null) return

        const index = Math.floor((tapped.x - AXIS_LEFT) / column)
        onPick(index >= 0 && index < bins.length ? index : null)
      }}
      style={CHART_SVG_STYLE}
    >
      <HatchDef id="compass-strip-hatch" />

      {bin !== null && (
        <rect
          x={AXIS_LEFT + bin * column}
          y={0}
          width={column}
          height={height + 22}
          fill="var(--state-warning)"
          opacity="0.14"
        />
      )}

      {GRID_DEG.map((error) => (
        <g key={error}>
          <line
            x1={AXIS_LEFT}
            x2={TUNING_CHART_WIDTH - 6}
            y1={y(error)}
            y2={y(error)}
            stroke="var(--surface-divider)"
            strokeDasharray="2 3"
          />
          <text
            x={AXIS_LEFT - 4}
            y={y(error) + 3}
            fontSize="7.5"
            textAnchor="end"
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
          >
            {error > 0 ? `+${error}` : error}
          </text>
        </g>
      ))}

      <line x1={AXIS_LEFT} x2={TUNING_CHART_WIDTH - 6} y1={mid} y2={mid} stroke="var(--text-muted)" />
      <text
        x={AXIS_LEFT - 4}
        y={mid + 3}
        fontSize="7.5"
        textAnchor="end"
        fill="var(--text-muted)"
        fontFamily="var(--font-mono)"
      >
        0°
      </text>

      {bins.map((at, index) => {
        const x = AXIS_LEFT + index * column
        if (at.mean_error_deg === null) {
          return (
            <rect
              key={at.bin_start_deg}
              data-testid="compass-absent-bin"
              x={x + 0.5}
              y={y(HATCH_DEG)}
              width={column - 1}
              height={y(-HATCH_DEG) - y(HATCH_DEG)}
              fill="url(#compass-strip-hatch)"
            />
          )
        }

        const thin = at.race_count === 1
        return (
          <rect
            key={at.bin_start_deg}
            x={x + 1}
            y={Math.min(y(at.mean_error_deg), mid)}
            width={Math.max(0.5, column - 2)}
            height={Math.max(1, Math.abs(y(at.mean_error_deg) - mid))}
            fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'}
            stroke="var(--text-accent)"
            strokeWidth="0.8"
            opacity={thin ? 1 : 0.8}
          />
        )
      })}

      {previousBins !== null && (
        <path
          d={path(previousBins)}
          data-testid="compass-previous-era"
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="1.6"
          strokeDasharray="4 3"
        />
      )}
      {raceBins !== null && (
        <path
          d={path(raceBins)}
          data-testid="compass-race-overlay"
          fill="none"
          stroke="var(--state-warning)"
          strokeWidth="2"
        />
      )}

      {[0, 90, 180, 270, 360].map((heading) => (
        <text
          key={heading}
          x={AXIS_LEFT + (heading / 360) * PLOT_WIDTH}
          y={height - 6}
          fontSize="8.5"
          textAnchor="middle"
          fill="var(--text-muted)"
          fontFamily="var(--font-mono)"
        >
          {['N', 'E', 'S', 'W', 'N'][heading / 90]}
        </text>
      ))}

      {/* The evidence row: how many Races each heading rests on, which is the coverage verdict's
          own input drawn where the curve is read rather than stated once underneath. */}
      <text x={AXIS_LEFT - 4} y={height + 14} fontSize="7" textAnchor="end" fill="var(--text-muted)">
        races
      </text>
      {bins.map((at, index) => (
        <g key={`evidence-${at.bin_start_deg}`}>
          <rect
            x={AXIS_LEFT + index * column + 0.5}
            y={height + 4}
            width={column - 1}
            height={14}
            fill={at.race_count === 0 ? 'url(#compass-strip-hatch)' : 'var(--text-primary)'}
            opacity={at.race_count === 0 ? 1 : Math.min(0.6, 0.08 + 0.12 * at.race_count)}
          />
          <text
            x={centre(index)}
            y={height + 14}
            fontSize="6.5"
            textAnchor="middle"
            fill="var(--text-primary)"
            fontFamily="var(--font-mono)"
          >
            {at.race_count || ''}
          </text>
        </g>
      ))}
    </svg>
  )
}

const ROSE_SIZE = 320
const ROSE_CENTRE = ROSE_SIZE / 2
/** The zero ring's radius: outside reads high, inside reads low. */
const ZERO_RING = 88
const ROSE_PER_DEGREE = 2.4

function polar(headingDeg: number, errorDeg: number): [number, number] {
  const radius = ZERO_RING + Math.max(-CLIP_DEG, Math.min(CLIP_DEG, errorDeg)) * ROSE_PER_DEGREE
  // Clockwise from north, which is how a compass is numbered and not how `atan2` is.
  const angle = ((headingDeg - 90) * Math.PI) / 180
  return [ROSE_CENTRE + radius * Math.cos(angle), ROSE_CENTRE + radius * Math.sin(angle)]
}

function sector(centreDeg: number, halfWidthDeg: number, inner: number, outer: number): string {
  const from = ((centreDeg - halfWidthDeg - 90) * Math.PI) / 180
  const to = ((centreDeg + halfWidthDeg - 90) * Math.PI) / 180
  const at = (radius: number, angle: number): string =>
    `${ROSE_CENTRE + radius * Math.cos(angle)} ${ROSE_CENTRE + radius * Math.sin(angle)}`

  return [
    `M ${at(inner, from)}`,
    `L ${at(outer, from)}`,
    `A ${outer} ${outer} 0 0 1 ${at(outer, to)}`,
    `L ${at(inner, to)}`,
    `A ${inner} ${inner} 0 0 0 ${at(inner, from)}`,
    'Z',
  ].join(' ')
}

/**
 * The curve as polylines through bin centres, broken at every bin with no figure.
 *
 * Closed across north only where both the first and last bin have one — a rose whose curve joined
 * up through a heading nobody sailed would assert a measurement at that heading.
 */
function runs(curve: Curve, binSize: number): [number, number][][] {
  const out: [number, number][][] = []
  let current: [number, number][] = []

  curve.forEach((at, index) => {
    if (at.mean_error_deg === null) {
      if (current.length > 0) out.push(current)
      current = []
      return
    }
    current.push(polar(index * binSize + binSize / 2, at.mean_error_deg))
  })
  if (current.length > 0) out.push(current)

  const first = curve[0]?.mean_error_deg ?? null
  const last = curve[curve.length - 1]?.mean_error_deg ?? null
  if (first !== null && last !== null && out.length > 0) {
    if (out.length === 1) out[0] = [...out[0], out[0][0]]
    else {
      const wrapping = out.pop() ?? []
      out[0] = [...wrapping, ...out[0]]
    }
  }

  return out
}

function Rose({ bins, bin, onPick, onKeyDown, previousBins, raceBins }: ChartProps): ReactElement {
  const binSize = 360 / bins.length
  const half = binSize / 2

  const line = (
    curve: Curve,
    stroke: string,
    width: number,
    dash?: string,
    testid?: string
  ): ReactElement[] =>
    runs(curve, binSize).map((run, index) => (
      <polyline
        key={`${stroke}-${index}`}
        data-testid={testid}
        points={run.map((point) => point.join(',')).join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinejoin="round"
      />
    ))

  return (
    <svg
      viewBox={`0 0 ${ROSE_SIZE} ${ROSE_SIZE}`}
      role="img"
      tabIndex={0}
      aria-label="Compass error by heading, on a rose. Tap or use the arrow keys to pick a heading."
      data-testid="compass-rose"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const tapped = svgPoint(event)
        if (tapped === null) return

        const dx = tapped.x - ROSE_CENTRE
        const dy = tapped.y - ROSE_CENTRE
        // The middle of the rose clears the selection: it is the one place no heading claims.
        if (Math.hypot(dx, dy) < 24) return onPick(null)

        const heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
        onPick(Math.floor(heading / binSize))
      }}
      style={{ ...CHART_SVG_STYLE, maxWidth: 340, margin: '0 auto' }}
    >
      <HatchDef id="compass-rose-hatch" />

      {GRID_DEG.map((error) => (
        <circle
          key={error}
          cx={ROSE_CENTRE}
          cy={ROSE_CENTRE}
          r={ZERO_RING + error * ROSE_PER_DEGREE}
          fill="none"
          stroke="var(--surface-divider)"
          strokeDasharray="2 3"
        />
      ))}
      <circle
        cx={ROSE_CENTRE}
        cy={ROSE_CENTRE}
        r={ZERO_RING}
        fill="none"
        stroke="var(--text-muted)"
      />

      {bins.map((at, index) =>
        at.mean_error_deg === null ? (
          <path
            key={at.bin_start_deg}
            data-testid="compass-absent-bin"
            d={sector(
              index * binSize + half,
              half,
              ZERO_RING - HATCH_DEG * ROSE_PER_DEGREE,
              ZERO_RING + HATCH_DEG * ROSE_PER_DEGREE
            )}
            fill="url(#compass-rose-hatch)"
          />
        ) : null
      )}

      {bin !== null && (
        <path
          d={sector(
            bin * binSize + half,
            half,
            ZERO_RING - CLIP_DEG * ROSE_PER_DEGREE,
            ZERO_RING + CLIP_DEG * ROSE_PER_DEGREE
          )}
          fill="var(--state-warning)"
          opacity="0.16"
        />
      )}

      {[0, 90, 180, 270].map((heading) => {
        const [x, y] = polar(heading, 30)
        return (
          <text
            key={heading}
            x={x}
            y={y + 3}
            textAnchor="middle"
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {['N', 'E', 'S', 'W'][heading / 90]}
          </text>
        )
      })}
      <text
        x={ROSE_CENTRE + 3}
        y={ROSE_CENTRE - ZERO_RING - 10 * ROSE_PER_DEGREE + 3}
        fontSize="7.5"
        fill="var(--text-muted)"
        fontFamily="var(--font-mono)"
      >
        +10°
      </text>
      <text
        x={ROSE_CENTRE + 3}
        y={ROSE_CENTRE - ZERO_RING + 3}
        fontSize="7.5"
        fill="var(--text-muted)"
        fontFamily="var(--font-mono)"
      >
        0°
      </text>

      {line(bins, 'var(--text-accent)', 2.2)}
      {previousBins !== null &&
        line(previousBins, 'var(--text-primary)', 1.5, '4 3', 'compass-previous-era')}
      {raceBins !== null && line(raceBins, 'var(--state-warning)', 2, undefined, 'compass-race-overlay')}

      {bins.map((at, index) => {
        if (at.mean_error_deg === null) return null
        const [x, y] = polar(index * binSize + half, at.mean_error_deg)
        const thin = at.race_count === 1
        return (
          <circle
            key={at.bin_start_deg}
            cx={x}
            cy={y}
            r={thin ? 2.4 : 3}
            fill={thin ? 'var(--surface-raised)' : 'var(--text-accent)'}
            stroke="var(--text-accent)"
            strokeWidth="1.2"
          />
        )
      })}
    </svg>
  )
}

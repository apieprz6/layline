/**
 * The rest of the per-Race breakdown, under the map and the Polar Plot: this race's two figures
 * against its Polar, its sails against the chart, and its share of each calibration check — in
 * that order (ADR 0033), each as its own row.
 *
 * No AI summary, and nothing in the place it would have had. It led the mockup's screen because
 * there was nothing better to lead with, and there now is: the map. What follows is the same numbers
 * the map is made of, read as a summary of what was just seen.
 *
 * No **Manoeuvre splits** either, by the owner's decision on LAY-162: a recording at thirty-second
 * resolution holds a tack in one or two rows, and no cost read off that would mean anything.
 *
 * Every tile reads a service the season already uses, over this race's rows, so a race page and
 * the screen behind it cannot read the same sailing two ways:
 *
 * - **Performance** is the Polar Plot's own `performance` — `sumEfficiency` over the rows its dots
 *   are drawn from, summed once on the server (ADR 0040). No second payload, no re-scoring.
 * - **Sail selection vs. chart** is `raceChartAgreement`: the Sail Selection Screen's fold over this
 *   race's rows, against the same chart Version that screen draws.
 * - **The calibration check** is `raceInstrumentCheck`: the Instrument Tuning screen's three per-Race
 *   functions, with the reason in words wherever a channel produced nothing — never a zero and
 *   never a gap (ADR 0034).
 *
 * A Server Component: figures, sentences and two links, with nothing to interact with.
 */

import Link from 'next/link'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import EfficiencyFigure from '@/components/analysis/EfficiencyFigure'
import { AGREEMENT_GLYPHS, AGREEMENT_WORDS } from '@/components/analysis/sail-selection-chrome'
import {
  CHANNEL_TITLE,
  NO_FIT_WORDS,
  asymmetryAbsence,
  rows as rowsPhrase,
  signedKnots,
  tackPairs,
  widerReading,
  type CheckedChannel,
} from '@/components/boat/instrument-tuning/chart-text'
import Explainer from '@/components/common/Explainer'
import { radius, spacing } from '@/lib/utils/design'
import { ASYMMETRY_CAVEAT } from '@/services/analysis/awa-asymmetry'
import { HEADING_OFFSET_CAVEAT } from '@/services/analysis/compass-deviation'
import { ASYMMETRY_SOLID_PAIRS } from '@/services/analysis/coverage-verdict'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import { fillerAnchoredShare, vmgFillerAnchoredShare } from '@/services/analysis/polar-performance'
import { TARGET_VMG_CAVEAT } from '@/services/analysis/polar-targets'
import type {
  CellAgreement,
  CellVerdict,
  RaceChartAgreement,
  RaceSailChartRead,
} from '@/services/analysis/sail-selection'
import { describeDuration } from '@/services/recordings/coverage'
import type { RaceInstrumentCheck, RaceTrack } from '@/types'

interface RaceBreakdownProps {
  /** The race's track, whose Polar Plot carries the race's two figures. */
  track: RaceTrack
  sailChart: RaceSailChartRead
  instruments: RaceInstrumentCheck
}

export default function RaceBreakdown({
  track,
  sailChart,
  instruments,
}: RaceBreakdownProps): ReactElement {
  return (
    <>
      <PerformanceTile track={track} />
      <SailChartTile read={sailChart} />
      <CalibrationTile check={instruments} />
    </>
  )
}

/* ------------------------------------------------------------------------------ performance */

/**
 * The race's **Polar Efficiency** and **VMG Efficiency**, with the season screens' own treatment.
 *
 * Not named for the Polar Plot above it: that card is "Boat performance vs. polars", the picture,
 * and these are the two figures the picture adds up to.
 */
function PerformanceTile({ track }: { track: RaceTrack }): ReactElement {
  if (track.plot === null) {
    return (
      <Tile title="Polar & VMG efficiency" testId="race-performance">
        <Absent>
          {track.scoring === 'polar-unreadable'
            ? 'The Polar this race names could not be read, so neither figure can be computed.'
            : 'This race records no Polar Version, so neither figure can be computed.'}
        </Absent>
      </Tile>
    )
  }

  const { performance } = track.plot

  return (
    <Tile title="Polar & VMG efficiency" testId="race-performance">
      <div style={{ display: 'flex', gap: spacing(2) }}>
        <EfficiencyFigure
          label="Polar efficiency"
          ratio={performance.polar_efficiency}
          filler={fillerAnchoredShare(performance)}
          testId="race-polar-efficiency"
          instead={NOTHING_SCORED}
        />
        <EfficiencyFigure
          label="VMG efficiency"
          ratio={performance.vmg_efficiency}
          // Its own share over its own rows, as on the season screen: a row can carry a Target
          // Speed and no Target VMG, so one share for both would describe rows not in the number.
          filler={vmgFillerAnchoredShare(performance)}
          testId="race-vmg-efficiency"
          instead={NOTHING_SCORED}
        />
      </div>

      {performance.elapsed_seconds > 0 && (
        <p style={NOTE_STYLE}>
          Both figures are total distance over total target distance across{' '}
          {describeDuration(performance.elapsed_seconds)} of scored sailing — the moments the plot
          above draws, and no others. {TARGET_VMG_CAVEAT}
        </p>
      )}
    </Tile>
  )
}

const NOTHING_SCORED = 'Nothing in this race could be scored against its Polar.'

/* ---------------------------------------------------------------------------- sail vs chart */

/** Each verdict a row can take, in words that read after a share: "20% no sail recorded". */
const VERDICT_WORDS: Readonly<Record<CellVerdict, string>> = {
  agrees: 'the chart’s sail',
  differs: 'another sail',
  'not-recorded': 'no sail recorded',
  'off-chart': 'a sail the chart has no word for',
  'other-version': 'under another chart Version',
}

const VERDICT_ORDER: readonly CellVerdict[] = [
  'agrees',
  'differs',
  'not-recorded',
  'off-chart',
  'other-version',
]

const CELL_ORDER: readonly CellAgreement[] = [
  'agrees',
  'mixed',
  'differs',
  'not-recorded',
  'off-chart',
  'other-version',
]

/**
 * This race's own **Cell Agreement** slice.
 *
 * The share is of *judgeable* sailing — Agrees plus Differs — as on the Overall tab and the screen,
 * and what it rests on is said beside it, so a race that recorded its sails for a third of the
 * evening does not read as one that followed the chart all night. The word is never "wrong", about
 * the chart or about the crew (ADR 0030).
 */
function SailChartTile({ read }: { read: RaceSailChartRead }): ReactElement {
  return (
    <Tile title="Sail selection vs. chart" testId="race-sail-chart">
      {read.ok ? <Agreement agreement={read.agreement} /> : <Absent>{noChart(read.reason)}</Absent>}

      <Link href="/boat-performance/sail-selection" style={LINK_STYLE}>
        The whole archive on the chart →
      </Link>
    </Tile>
  )
}

function noChart(reason: Extract<RaceSailChartRead, { ok: false }>['reason']): string {
  return reason === 'no-chart'
    ? 'No Crossover Chart has been uploaded, so there is nothing to lay this race’s sails over.'
    : 'The archive could not be read, so this race’s sailing cannot be laid over the chart.'
}

function Agreement({ agreement }: { agreement: RaceChartAgreement }): ReactElement {
  if (agreement.placed_rows === 0) {
    return <Absent>This race’s Countable sailing falls on no cell of the chart, so there is nothing to compare.</Absent>
  }

  const share = efficiencyPercent(agreement.agreement)

  return (
    <>
      {share === null ? (
        <Absent>{unjudged(agreement)}</Absent>
      ) : (
        <>
          <span
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: spacing(2),
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-accent)',
            }}
          >
            <span
              data-testid="race-chart-agreement"
              style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}
            >
              {share}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              carried what the chart calls for
            </span>
          </span>
          <p style={NOTE_STYLE}>{sides(agreement)}</p>
        </>
      )}

      <p style={NOTE_STYLE}>
        Of this race’s sailing on the chart: {composition(agreement)}. Across the{' '}
        {cellCount(agreement)} it reached: {cellMix(agreement)}.
      </p>
    </>
  )
}

/** Why sailing on the chart produced no share, from what it was instead. */
function unjudged({ verdicts, placed_rows }: RaceChartAgreement): string {
  if (verdicts['other-version'] === placed_rows) {
    return 'This race was sailed under a different Crossover Chart Version from the one the Sail Selection screen draws, so its sails are placed on the chart and not judged against it.'
  }
  if (verdicts['not-recorded'] === placed_rows) {
    return 'This race recorded no sail for any of its sailing on the chart, so none of it can be judged.'
  }
  return 'Nothing this race carried can be judged against the chart.'
}

/**
 * Each side's own percent of target, stated side by side and never subtracted (ADR 0030).
 *
 * A side with nothing in it is a sentence, never a dash: a race where nothing differed is a real
 * state and a flattering one.
 */
function sides({ following, differing }: RaceChartAgreement): string {
  const when = efficiencyPercent(following.polar_efficiency)
  const otherwise = efficiencyPercent(differing.polar_efficiency)

  if (when !== null && otherwise !== null) {
    return `${when} of target when it did, ${otherwise} when it did not.`
  }
  if (when !== null) return `${when} of target when it did, and nothing carried otherwise.`
  if (otherwise !== null) {
    return `${otherwise} of target when it did not, and nothing carried what the chart calls for.`
  }
  return 'None of it could be scored against the Polar.'
}

function composition({ verdicts, placed_rows }: RaceChartAgreement): string {
  return VERDICT_ORDER.filter((verdict) => verdicts[verdict] > 0)
    .map((verdict) => `${sharePercent(verdicts[verdict] / placed_rows)} ${VERDICT_WORDS[verdict]}`)
    .join(', ')
}

function cellCount({ cells }: RaceChartAgreement): string {
  const count = Object.values(cells).reduce((sum, each) => sum + (each ?? 0), 0)
  return `${count} cell${count === 1 ? '' : 's'}`
}

function cellMix({ cells }: RaceChartAgreement): string {
  return CELL_ORDER.filter((agreement) => (cells[agreement] ?? 0) > 0)
    .map(
      (agreement) =>
        `${AGREEMENT_GLYPHS[agreement]} ${cells[agreement]} ${AGREEMENT_WORDS[agreement]}`
    )
    .join('; ')
}

/* ------------------------------------------------------------------------------ calibration */

/** One channel's column. */
interface ChannelColumn {
  channel: CheckedChannel
  /** The figures, each with the speed or point of sail it belongs to where there are two. */
  figures: { at?: string; reading: string }[]
  /** Words in place of the figures, where the race produced none. Null where it did. */
  instead: string | null
  /** What the figure rests on, in words. Null where there is no figure to rest on anything. */
  basis: string | null
  /** 0–1, or null where there is no figure to draw evidence for. */
  bar: number | null
}

/**
 * This race's share of each **Calibration Channel**: the figure, what it rests on, and a bar.
 *
 * ADR 0034's per-Race tile — numbers over thin coverage bars, the bars being this race's own share
 * of the rose, its Tack Pairs, and its line's `R²` — with the headlines ADR 0035 shaped per channel,
 * as the Overall tab's row prints them. Neutral throughout: a figure here says go and look at an
 * instrument and never what to set it to (LAY-138 decision 7).
 */
function CalibrationTile({ check }: { check: RaceInstrumentCheck }): ReactElement {
  const columns = [compass(check), windAngle(check), boatSpeed(check)]

  return (
    <Tile title="Instrument calibration check" testId="race-calibration">
      {/* A row at a time — names, figures, what each rests on, bars — so the three columns stay in
          step whatever one of them has to say, as on the Overall tab's row. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          columnGap: spacing(2),
          rowGap: 2,
          alignItems: 'start',
        }}
      >
        {columns.map((column) => (
          <span key={column.channel} style={CHANNEL_NAME_STYLE}>
            {CHANNEL_TITLE[column.channel]}
          </span>
        ))}
        {columns.map((column) => (
          <ChannelFigures key={column.channel} column={column} />
        ))}
        {columns.map((column) => (
          <span key={column.channel} style={BASIS_STYLE}>
            {column.basis}
          </span>
        ))}
        {columns.map((column) => (
          <ChannelBar key={column.channel} column={column} />
        ))}
      </div>

      <p style={NOTE_STYLE}>
        This race alone, which is thin evidence for any instrument. Diagnostic only — never a value
        to set.
      </p>

      <Explainer summary="What do these rest on?">
        {HEADING_OFFSET_CAVEAT} {ASYMMETRY_CAVEAT} Boat speed is the paddlewheel against GPS, as a
        line fitted through this race’s own rows.
      </Explainer>

      <Link href="/boat-performance/instrument-tuning" style={LINK_STYLE}>
        The whole season, channel by channel →
      </Link>
    </Tile>
  )
}

function compass({ heading, heading_swing_deg }: RaceInstrumentCheck): ChannelColumn {
  if (!heading.ok) {
    return {
      channel: 'HDG',
      figures: [],
      instead: `No compass reading — only ${rowsPhrase(heading.row_count)} this check could read.`,
      basis: null,
      bar: null,
    }
  }

  const { heading_coverage } = heading.offset
  const basis = `${sharePercent(heading_coverage)} of the rose`

  return heading_swing_deg === null
    ? {
        channel: 'HDG',
        figures: [],
        instead: 'Only one heading carries a figure, so there is no swing to span.',
        basis,
        bar: heading_coverage,
      }
    : {
        channel: 'HDG',
        figures: [{ reading: `${heading_swing_deg.toFixed(1)}° swing` }],
        instead: null,
        basis,
        bar: heading_coverage,
      }
}

function windAngle({ asymmetry }: RaceInstrumentCheck): ChannelColumn {
  if (!asymmetry.ok) {
    return {
      channel: 'AWA',
      figures: [],
      instead: `No Tack Pair — ${asymmetryAbsence(asymmetry)}.`,
      basis: null,
      bar: null,
    }
  }

  const { upwind, downwind } = asymmetry.asymmetry
  const pairs = (upwind?.pair_count ?? 0) + (downwind?.pair_count ?? 0)

  return {
    channel: 'AWA',
    figures: [
      { at: 'up', reading: widerReading(upwind) },
      { at: 'down', reading: widerReading(downwind) },
    ],
    instead: null,
    basis: tackPairs(pairs),
    // Against the count that reads `SOLID` for a season, so a full bar is never one race's claim.
    bar: Math.min(1, pairs / ASYMMETRY_SOLID_PAIRS),
  }
}

function boatSpeed({ speed }: RaceInstrumentCheck): ChannelColumn {
  if (!speed.fitted) {
    return {
      channel: 'STW',
      figures: [],
      instead: `No line — ${NO_FIT_WORDS[speed.reason]}.`,
      basis: null,
      bar: null,
    }
  }

  return {
    channel: 'STW',
    figures: speed.gaps.map((gap) => ({
      at: `${gap.stw_knots} kt`,
      // A speed this race's line never reached is off it, never extrapolated to.
      reading: gap.gap_knots === null ? 'off its line' : signedKnots(gap.gap_knots),
    })),
    instead: null,
    basis: `R² ${speed.r_squared.toFixed(2)}`,
    bar: Math.max(0, Math.min(1, speed.r_squared)),
  }
}

function ChannelFigures({ column }: { column: ChannelColumn }): ReactElement {
  if (column.instead !== null) {
    return (
      <span
        data-testid="race-calibration-figures"
        data-channel={column.channel}
        style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic', minWidth: 0 }}
      >
        {column.instead}
      </span>
    )
  }

  return (
    <span
      data-testid="race-calibration-figures"
      data-channel={column.channel}
      style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
    >
      {column.figures.map((figure) => (
        <span
          key={figure.at ?? figure.reading}
          style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}
        >
          {figure.at !== undefined && (
            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', flexShrink: 0 }}>
              {figure.at}
            </span>
          )}
          {/* Never wrapped: a figure split from its unit is the one thing a figure may not do. */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            {figure.reading}
          </span>
        </span>
      ))}
    </span>
  )
}

/**
 * The bar, or nothing where the race produced no figure: an empty track under no figure would draw
 * the evidence for a measurement nobody made. The cell still stands, keeping the columns in step.
 */
function ChannelBar({ column }: { column: ChannelColumn }): ReactElement {
  if (column.bar === null) return <span />

  return (
    <span
      data-testid="race-calibration-bar"
      data-channel={column.channel}
      data-share={column.bar.toFixed(2)}
      style={{
        display: 'block',
        height: 4,
        background: 'var(--surface-divider)',
        borderRadius: 2,
        marginTop: 3,
      }}
    >
      <span
        style={{
          display: 'block',
          width: `${Math.round(column.bar * 100)}%`,
          height: 4,
          background: 'var(--text-primary)',
          borderRadius: 2,
        }}
      />
    </span>
  )
}

/* -------------------------------------------------------------------------------- furniture */

/** One row of the breakdown: a heading over a card. */
function Tile({
  title,
  testId,
  children,
}: {
  title: string
  testId: string
  children: ReactNode
}): ReactElement {
  return (
    <section
      data-testid={testId}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}
    >
      <h2 style={SECTION_HEADING}>{title}</h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing(2),
          background: 'var(--surface-raised)',
          border: '1px solid var(--surface-border)',
          borderRadius: radius('md'),
          padding: spacing(3),
        }}
      >
        {children}
      </div>
    </section>
  )
}

/** A figure that is not there, said in words — in the one treatment the page gives an absence. */
function Absent({ children }: { children: ReactNode }): ReactElement {
  return (
    <p style={{ ...NOTE_STYLE, fontSize: 'var(--text-sm)', fontStyle: 'italic' }}>{children}</p>
  )
}

/** The page's own section heading, so these read as rows of the same page as Coverage. */
const SECTION_HEADING: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
}

const LINK_STYLE: CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-accent)',
}

const CHANNEL_NAME_STYLE: CSSProperties = {
  fontSize: 8.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  lineHeight: 1.3,
  minWidth: 0,
}

const BASIS_STYLE: CSSProperties = {
  fontSize: 8.5,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
  minWidth: 0,
}

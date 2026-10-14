import Link from 'next/link'
import type { ReactElement } from 'react'
import {
  NO_FIT_WORDS,
  signedKnots,
  widerReading,
  type CheckedChannel,
} from '@/components/boat/instrument-tuning/chart-text'
import ChannelColumns, { type ChannelFigure } from '@/components/boat/instrument-tuning/ChannelColumns'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import {
  ASYMMETRY_SOLID_PAIRS,
  SOLID_SHARE,
  asymmetryCoverage,
  headingCoverage,
  speedCoverage,
} from '@/services/analysis/coverage-verdict'
import {
  HEADLINE_SPEEDS_KNOTS,
  type InstrumentTuningSeason,
} from '@/services/analysis/instrument-tuning'
import { lineGapAt, type EraDivergence } from '@/services/analysis/paddlewheel'
import type { InstrumentTuningRead } from '@/services/analysis/readInstrumentTuning'
import type { CoverageStatement, CoverageVerdict, EraAwaAsymmetry, EraHeadingOffset } from '@/types'

interface InstrumentTuningTeaserProps {
  /**
   * The season, or the reason there is none — the read as `readInstrumentTuning` hands it over.
   *
   * The whole union and not an unwrapped season, because this row has something to say in each of
   * its three states and the words differ: an archive that could not be read is not an archive with
   * nothing in it, and neither is a coverage word. The screen behind this row unwraps the same read
   * into three different screens for the same reason.
   */
  read: InstrumentTuningRead
}

/**
 * The Overall tab's **Instrument tuning** row: three channels, each with its figure, what that
 * figure rests on, and a bar for how far that is from `solid`.
 *
 * **The shape is LAY-149's variant D**, the recommended mix the owner chose — its per-Race
 * "Instrument calibration check" tile, three columns of `Stat` over a coverage bar, brought to the
 * Overall tab. It replaces ADR 0035's single worst-of-three word by the owner's decision on LAY-160
 * (see that ADR's amendment): a sailor deciding whether to open the screen is better served by the
 * three figures and their evidence than by one word standing for all three.
 *
 * ## What each column prints, and why it is not the prototype's number
 *
 * The prototype printed one scalar per channel — the `HDG` era mean, a single `AWA` mean of both
 * points of sail, and the `STW` fit's bias. ADR 0035 retired all three, on findings from the same
 * archive the prototype ran on:
 *
 * - **Compass: the swing**, not the mean. The curve reads about `+12.7°` heading NNE and `−8.9°`
 *   heading WSW, so the `+3.3°` mean is a number matching no heading the compass actually shows.
 *   Which headings those are is the chart's own readout, one tap away; the spread is what this
 *   leads with.
 * - **Wind angle: both points of sail**, each saying which tack reads wider. Their mean sits near
 *   zero and states the opposite of the finding, because the two lean opposite ways. A side that
 *   paired no tacks says so on its own line rather than leaving the other to stand alone.
 * - **Boat speed: the line's gap from 1:1 at 4 kt and at 8 kt** — the one reading of the fitted
 *   line that may be printed. Never a slope or an intercept (ADR 0027), and never one scalar for a
 *   gap that is U-shaped by speed.
 *
 * ## The bars, and what makes them comparable
 *
 * Each bar is how close that channel is to **`solid`** coverage, so a full bar means the same thing
 * in all three: the share of the headings, or of the Races with their own line, divided by
 * `SOLID_SHARE`; the weaker point of sail's pair count divided by `ASYMMETRY_SOLID_PAIRS`. Drawn
 * that way deliberately — three bars that looked alike while scaling differently would be worse
 * than no bars, and the raw shares do scale differently, a two-thirds share being `SOLID` where
 * seven pairs are not. No new cut-point is introduced: these are ADR 0034's own, read off
 * `coverage-verdict.ts`.
 *
 * Neutral throughout, one tone whatever the figures say (ADR 0034): coverage states how much
 * evidence there is and never that an instrument is wrong, and no figure here is a value to type
 * into a display (LAY-138 decision 7).
 *
 * A Server Component: a link, some figures and three bars, with nothing to interact with.
 */
export default function InstrumentTuningTeaser({
  read,
}: InstrumentTuningTeaserProps): ReactElement {
  return (
    <Link
      href="/boat-performance/instrument-tuning"
      data-testid="instrument-tuning-teaser"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: spacing(3),
        textDecoration: 'none',
      }}
    >
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Instrument tuning</span>

      {!read.ok ? (
        <WithoutASeason read={read} />
      ) : (
        <Season panels={channels(read.season)} />
      )}
    </Link>
  )
}

/** The three channels side by side, and the one sentence under them. */
function Season({ panels }: { panels: readonly ChannelPanel[] }): ReactElement {
  return (
    <>
      <ChannelColumns
        columns={panels.map((panel) => ({
          channel: panel.channel,
          figures: panel.figures,
          instead: panel.instead,
          basis: panel.coverage.reason,
          bar: panel.towardsSolid,
        }))}
        testIds={{
          name: 'tuning-channel',
          figures: 'tuning-figures',
          basis: 'tuning-reason',
          bar: 'coverage-bar',
        }}
      />

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {/* The coverage word ADR 0035 chose, kept as a clause rather than as the row's whole
            figure: it is the one sentence saying which of the three to trust least, and what the
            bars above are a summary of. */}
        Coverage is{' '}
        <span data-testid="tuning-coverage">{worst(panels).coverage.verdict.toLowerCase()}</span> at
        its thinnest, each bar being how close that channel is to solid. Over every Race in the
        archive. Tap for the three charts.
      </span>
    </>
  )
}

/**
 * What the row says where there is no season behind it.
 *
 * Both in the words the screen itself uses, so the row and the screen a tap opens cannot drift into
 * disagreeing about what happened. An empty archive is not a failure and says so; a failed read
 * says that **nothing** is shown rather than drawing three bars over the part that loaded.
 */
function WithoutASeason({
  read,
}: {
  read: Extract<InstrumentTuningRead, { ok: false }>
}): ReactElement {
  const said =
    read.reason === 'no-races'
      ? {
          instead: 'No race has been uploaded yet.',
          caption: 'These checks read a season of recordings. Tap for the three charts.',
        }
      : {
          instead: 'The archive could not be read.',
          caption:
            'Nothing is shown rather than figures measured over part of it. Try again shortly.',
        }

  return (
    <>
      <span
        style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
      >
        {said.instead}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {said.caption}
      </span>
    </>
  )
}

/** One channel's column, computed. */
interface ChannelPanel {
  channel: CheckedChannel
  figures: ChannelFigure[]
  /** Words in place of the figures, where the channel produced none. Null where it did. */
  instead: string | null
  coverage: CoverageStatement
  /** 0–1 of the way to `solid`, or null where there is no figure to draw evidence for. */
  towardsSolid: number | null
}

/** Worst first, which is the order a `max` over the three verdicts reads in (ADR 0035). */
const WORST_FIRST: readonly CoverageVerdict[] = ['ANECDOTAL', 'THIN', 'SOLID']

/**
 * The floor under a channel that produced nothing at all.
 *
 * Not a new cut-point: `coverage-verdict.ts` already decides that an empty population is
 * `ANECDOTAL` — "by decision rather than by `NaN` falling through two failed comparisons" — and a
 * channel with no Era to read is the emptiest population there is. What is added here is only the
 * sentence, because there is no Era to compose one from.
 */
function nothingMeasured(reason: string): CoverageStatement {
  return { verdict: 'ANECDOTAL', reason }
}

/** A share of a population, as a fraction of the share that reads `SOLID`. */
function towardsSolidShare(found: number, population: number): number | null {
  if (population <= 0) return null
  return Math.min(1, found / population / SOLID_SHARE)
}

/**
 * The three channels, in the causal order the screen reads them in: `HDG → AWA → STW`.
 *
 * Each over **what a tap would show**: the current Era on the compass and on boat speed — the last
 * of each, as `InstrumentTuningCharts` draws — and the pooled season on the **Tack Dial**, which is
 * the level that dial opens at. A row stating a figure over an Era the screen does not draw would
 * send a sailor looking for something that is not there.
 */
function channels(season: InstrumentTuningSeason): ChannelPanel[] {
  return [
    compass(season.heading[season.heading.length - 1] ?? null),
    windAngle(season.asymmetry.season),
    boatSpeed(season.speed.orthogonal[season.speed.orthogonal.length - 1] ?? null),
  ]
}

function compass(era: EraHeadingOffset | null): ChannelPanel {
  if (era === null) {
    return {
      channel: 'HDG',
      figures: [],
      instead: 'No Race has produced a compass reading yet.',
      coverage: nothingMeasured('no Race has produced a compass reading yet'),
      towardsSolid: null,
    }
  }

  const coverage = headingCoverage(era)
  const towardsSolid = towardsSolidShare(
    era.headings_on_two_or_more_races,
    era.heading_bin_count
  )

  // An Era with Races in it but no bin clearing the three-row gate: its coverage is real and nought
  // of the compass carries a figure, which is a different sentence from no Race at all.
  if (era.swing === null) {
    return {
      channel: 'HDG',
      figures: [],
      instead: 'No heading carries a figure yet.',
      coverage,
      towardsSolid: null,
    }
  }

  return {
    channel: 'HDG',
    figures: [{ reading: `${era.swing.swing_deg.toFixed(1)}° swing` }],
    instead: null,
    coverage,
    towardsSolid,
  }
}

function windAngle(season: EraAwaAsymmetry): ChannelPanel {
  const { upwind, downwind } = season
  const coverage = asymmetryCoverage(season)

  if (upwind === null && downwind === null) {
    return {
      channel: 'AWA',
      figures: [],
      instead: 'No Tack Pair has been found yet.',
      coverage,
      towardsSolid: null,
    }
  }

  return {
    channel: 'AWA',
    figures: [
      { at: 'up', reading: widerReading(upwind) },
      { at: 'down', reading: widerReading(downwind) },
    ],
    instead: null,
    coverage,
    // The weaker point of sail against the count that reads `SOLID`, which is the quantity the
    // verdict itself is read off: the comparison between the two sides is the whole check, so a
    // side that paired nothing cannot be averaged away by a well-covered other one.
    towardsSolid: Math.min(
      1,
      Math.min(upwind?.pair_count ?? 0, downwind?.pair_count ?? 0) / ASYMMETRY_SOLID_PAIRS
    ),
  }
}

function boatSpeed(era: EraDivergence | null): ChannelPanel {
  if (era === null) {
    return {
      channel: 'STW',
      figures: [],
      instead: 'No Race has produced a speed comparison yet.',
      coverage: nothingMeasured('no Race has produced a speed comparison yet'),
      towardsSolid: null,
    }
  }

  const coverage = speedCoverage(era)
  const towardsSolid = towardsSolidShare(era.races_with_a_line, era.races.length)

  if (!era.fit.fitted) {
    return {
      channel: 'STW',
      figures: [],
      instead: `No season line yet — ${NO_FIT_WORDS[era.fit.reason]}.`,
      coverage,
      towardsSolid,
    }
  }

  const { line } = era.fit

  // The line's gap at the two speeds the `STW` card headlines (ADR 0035), read with the chart's own
  // arithmetic. A speed the line was never fitted over is off the chart rather than extrapolated.
  return {
    channel: 'STW',
    figures: HEADLINE_SPEEDS_KNOTS.map((knots) => {
      const gap = lineGapAt(line, knots)
      return {
        at: `${knots} kt`,
        reading: gap === null ? 'off the chart' : signedKnots(gap),
      }
    }),
    instead: null,
    coverage,
    towardsSolid,
  }
}

/**
 * The channel whose coverage is worst.
 *
 * A tie goes to the earliest, which is the `HDG → AWA → STW` order the screen reads in and the
 * order deviation propagates in. Nothing is lost by it: the word is the same either way.
 */
function worst(panels: readonly ChannelPanel[]): ChannelPanel {
  return panels.reduce((found, panel) =>
    WORST_FIRST.indexOf(panel.coverage.verdict) < WORST_FIRST.indexOf(found.coverage.verdict)
      ? panel
      : found
  )
}

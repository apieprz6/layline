/**
 * What each **Calibration Channel** headlines, over a season or over one Race (ADR 0035).
 *
 * The "This season" rail's **Instrument tuning** row, a Race page's calibration tile and the MCP
 * `instrument_tuning` tool all state these, so they are worked out once, here, rather than in the
 * components that draw them: a tool may not re-derive what a component computes (ADR 0042, *A tool
 * inherits every rule and owns none*).
 *
 * ## What each channel leads with, and why it is not the prototype's number
 *
 * The prototype printed one scalar per channel — the `HDG` era mean, a single `AWA` mean of both
 * points of sail, and the `STW` fit's bias. ADR 0035 retired all three, on findings from the same
 * archive the prototype ran on:
 *
 * - **Compass: the swing**, not the mean. The curve reads about `+12.7°` heading NNE and `−8.9°`
 *   heading WSW, so the `+3.3°` mean is a number matching no heading the compass actually shows.
 * - **Wind angle: both points of sail**, each saying which tack reads wider. Their mean sits near
 *   zero and states the opposite of the finding, because the two lean opposite ways.
 * - **Boat speed: the line's gap from 1:1 at 4 kt and at 6 kt** — the one reading of the fitted
 *   line that may be printed. Never a slope or an intercept (ADR 0027), and never one scalar for a
 *   gap that is U-shaped by speed.
 *
 * ## How close to solid, and what makes the three comparable
 *
 * A season headline's `towards_solid` is how close that channel is to **`SOLID`** coverage, so a
 * full bar means the same thing in all three: the share of the headings, or of the Races with their
 * own line, divided by `SOLID_SHARE`; the weaker point of sail's pair count divided by
 * `ASYMMETRY_SOLID_PAIRS`. No new cut-point is introduced: these are ADR 0034's own, read off
 * `coverage-verdict.ts`.
 *
 * Neutral throughout: coverage states how much evidence there is and never that an instrument is
 * wrong, and no figure here is a value to type into a display (LAY-138 decision 7).
 */

import {
  ASYMMETRY_SOLID_PAIRS,
  SOLID_SHARE,
  asymmetryCoverage,
  headingCoverage,
  speedCoverage,
} from '@/services/analysis/coverage-verdict'
import { sharePercent } from '@/services/analysis/figures'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import {
  NO_FIT_WORDS,
  asymmetryAbsence,
  rows,
  signedKnots,
  tackPairs,
  widerReading,
} from '@/services/analysis/instrument-tuning-text'
import { HEADLINE_SPEEDS_KNOTS, lineGapAt, type EraDivergence } from '@/services/analysis/paddlewheel'
import type {
  ChannelColumn,
  CoverageStatement,
  CoverageVerdict,
  EraAwaAsymmetry,
  EraHeadingOffset,
  RaceInstrumentCheck,
  SeasonChannelHeadline,
} from '@/types'

/* ---------------------------------------------------------------------------------- season */

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
export function seasonHeadlines(season: InstrumentTuningSeason): SeasonChannelHeadline[] {
  return [
    compassHeadline(season.heading[season.heading.length - 1] ?? null),
    windAngleHeadline(season.asymmetry.season),
    boatSpeedHeadline(season.speed.orthogonal[season.speed.orthogonal.length - 1] ?? null),
  ]
}

/** The compass over one `HDG` Era, or null where no Race produced a compass reading. */
export function compassHeadline(era: EraHeadingOffset | null): SeasonChannelHeadline {
  if (era === null) {
    return {
      channel: 'HDG',
      figures: [],
      instead: 'No Race has produced a compass reading yet.',
      coverage: nothingMeasured('no Race has produced a compass reading yet'),
      towards_solid: null,
    }
  }

  const coverage = headingCoverage(era)
  const towardsSolid = towardsSolidShare(era.headings_on_two_or_more_races, era.heading_bin_count)

  // An Era with Races in it but no bin clearing the three-row gate: its coverage is real and nought
  // of the compass carries a figure, which is a different sentence from no Race at all.
  if (era.swing === null) {
    return {
      channel: 'HDG',
      figures: [],
      instead: 'No heading carries a figure yet.',
      coverage,
      towards_solid: null,
    }
  }

  return {
    channel: 'HDG',
    figures: [{ reading: `${era.swing.swing_deg.toFixed(1)}° swing` }],
    instead: null,
    coverage,
    towards_solid: towardsSolid,
  }
}

/** The Apparent Wind Asymmetry over one Era, or over the pooled season. */
export function windAngleHeadline(era: EraAwaAsymmetry): SeasonChannelHeadline {
  const { upwind, downwind } = era
  const coverage = asymmetryCoverage(era)

  if (upwind === null && downwind === null) {
    return {
      channel: 'AWA',
      figures: [],
      instead: 'No Tack Pair has been found yet.',
      coverage,
      towards_solid: null,
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
    towards_solid: Math.min(
      1,
      Math.min(upwind?.pair_count ?? 0, downwind?.pair_count ?? 0) / ASYMMETRY_SOLID_PAIRS
    ),
  }
}

/** Boat speed over one `STW` Era, or null where no Race produced a speed comparison. */
export function boatSpeedHeadline(era: EraDivergence | null): SeasonChannelHeadline {
  if (era === null) {
    return {
      channel: 'STW',
      figures: [],
      instead: 'No Race has produced a speed comparison yet.',
      coverage: nothingMeasured('no Race has produced a speed comparison yet'),
      towards_solid: null,
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
      towards_solid: towardsSolid,
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
    towards_solid: towardsSolid,
  }
}

/**
 * The channel whose coverage is worst: the row's "coverage is … at its thinnest".
 *
 * A tie goes to the earliest, which is the `HDG → AWA → STW` order the screen reads in and the
 * order deviation propagates in. Nothing is lost by it: the word is the same either way.
 */
export function thinnestChannel(headlines: readonly SeasonChannelHeadline[]): SeasonChannelHeadline {
  return headlines.reduce((found, headline) =>
    WORST_FIRST.indexOf(headline.coverage.verdict) < WORST_FIRST.indexOf(found.coverage.verdict)
      ? headline
      : found
  )
}

/* ------------------------------------------------------------------------------------ race */

/**
 * One Race's share of each channel: the figure, what it rests on, and a bar.
 *
 * ADR 0034's per-Race tile — numbers over thin coverage bars, the bars being this race's own share
 * of the rose, its Tack Pairs, and its line's `R²` — with the headlines ADR 0035 shaped per channel,
 * as the season row prints them. A Race has no coverage verdict: it is one Race, which is thin
 * evidence for any instrument whatever its share.
 */
export function raceHeadlines(check: RaceInstrumentCheck): ChannelColumn[] {
  return [raceCompass(check), raceWindAngle(check), raceBoatSpeed(check)]
}

function raceCompass({ heading, heading_swing_deg }: RaceInstrumentCheck): ChannelColumn {
  if (!heading.ok) {
    return {
      channel: 'HDG',
      figures: [],
      instead: `No compass reading — only ${rows(heading.row_count)} this check could read.`,
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

function raceWindAngle({ asymmetry }: RaceInstrumentCheck): ChannelColumn {
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

function raceBoatSpeed({ speed }: RaceInstrumentCheck): ChannelColumn {
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

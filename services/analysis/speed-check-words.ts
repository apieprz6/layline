/**
 * What the `STW` chart's Scatter and coverage note say, in words.
 *
 * In `services/` rather than beside the chart because the MCP `instrument_tuning` tool states the
 * same readings, and a tool may not hold a copy of a judgement a chart makes (ADR 0042). The
 * figures are `paddlewheel.ts`'s. The Scatter's readout keeps its signed figures, which are
 * readings of the drawn line (ADR 0041); none of them is a value to set the paddlewheel to.
 */

import type { OfferedFitMethod } from '@/services/analysis/instrument-tuning'
import { NO_FIT_WORDS, races, rows, signedKnots } from '@/services/analysis/instrument-tuning-text'
import {
  lineGapAt,
  type BlankStwCoverage,
  type FittedLine,
  type NoFitReason,
  type SpeedBandGap,
} from '@/services/analysis/paddlewheel'

/** What each offered fit method assumes, said under the Scatter beside the line it drew. */
export const METHOD_WORDS: Record<OfferedFitMethod, string> = {
  orthogonal: 'The fit treats GPS and paddlewheel as equally imperfect.',
  'sog-on-stw': 'The fit treats the paddlewheel as exact, which tilts the line flatter than it should be.',
}

/**
 * Knots by which a band's own rows may sit off the straight line before the readout says so: the
 * point at which the line is visibly failing to follow the U a calibration error does not make.
 */
export const LINE_DISAGREES_KNOTS = 0.1

/** The Scatter's note on rows the paddlewheel said nothing on. A blank is never a reading of zero. */
export function blankStwSentence(coverage: BlankStwCoverage): string {
  const { blank_stw, countable, excluded_blank_stw: excluded } = coverage

  if (blank_stw === 0) {
    const elsewhere = excluded.frozen + excluded.low_speed + excluded.maneuver_window
    return elsewhere > 0
      ? `No row the chart reads lacks an STW: all ${elsewhere} blank-STW rows in these Races were Frozen, Low-Speed or inside a Maneuver Window, and so were never Countable.`
      : 'No row the chart reads lacks an STW anywhere in these Races.'
  }

  return `The paddlewheel said nothing on ${blank_stw} of ${countable} Countable rows here, which are counted and not plotted — a blank is not a reading of zero.`
}

/** A population with no line of its own, and what its rows still read. */
export function noLineSentence(name: string, reason: NoFitReason, gap: number | null): string {
  return `${name} has no line — ${NO_FIT_WORDS[reason]}.${gap === null ? '' : ` Its rows still read ${signedKnots(gap)} from 1:1 on average.`}`
}

/** The Scatter's summary of a fitted population: how far GPS reads from the paddlewheel, over how much. */
export function lineGapSentence(name: string, gap: number | null, line: FittedLine): string {
  const reads =
    gap === null
      ? 'no measurable gap from'
      : `${Math.abs(gap).toFixed(2)} kt ${gap >= 0 ? 'above' : 'below'}`
  return `${name}: GPS speed reads ${reads} the paddlewheel over ${rows(line.points)}.`
}

/** What a tapped knot of the Scatter rests on. */
export function bandRowsSentence(band: SpeedBandGap, oneRace: boolean): string {
  return `Over ${rows(band.rows)}${oneRace ? '' : ` from ${races(band.races)}, each weighted equally`}.`
}

/**
 * The fitted line's reading at the middle of a knot, against the band's own rows.
 *
 * Where the rows sit more than `LINE_DISAGREES_KNOTS` off it, the readout says the line cannot
 * follow them — the U-shape a straight line, and so a calibration, cannot take out.
 */
export function lineAtBand(
  line: FittedLine,
  band: SpeedBandGap
): { line_gap_knots: number; sentence: string } | null {
  const says = lineGapAt(line, band.band + 0.5)
  if (says === null) return null

  return {
    line_gap_knots: says,
    sentence: `The straight line says ${signedKnots(says)} here${
      Math.abs(says - band.mean_gap_knots) > LINE_DISAGREES_KNOTS
        ? ` — the rows disagree with it by more than ${LINE_DISAGREES_KNOTS} kt, which is the U a straight line cannot follow.`
        : '.'
    }`,
  }
}

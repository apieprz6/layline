/**
 * A row as an Instrument Tuning check reads it: the Countable verdict with the channels beside it.
 *
 * The **Countable** engine answers whether a row may be read at all (ADR 0025) and says nothing
 * about what it holds; the channels are text in the Transcription, exactly as the file wrote them
 * (ADR 0008). A check needs both at once — a figure and permission to use it — so the join lives
 * here rather than in each check, where two copies of an off-by-one could disagree.
 *
 * Nothing here interprets a channel. Reading `CTW` as a heading or `AWA (calc)` as a wind angle is
 * the checks' own work, and so is the caveat each one has to carry.
 *
 * **Readable** names what is in hand to read, never permission to count it: `countable` rides along
 * untouched, and a check that ignored it would be reading rows ADR 0025 excludes. Not a *reading*
 * either — CONTEXT.md reserves that word for one channel, and this is a whole **Recording Row**.
 */

import { sameRowOrder } from '@/services/analysis/maneuvers'
import type { AnalysisRow, ReadableRow, TranscriptionRow } from '@/types'

/**
 * The `SOG` an Instrument Tuning check reads a row above, in knots.
 *
 * Composes with Row Quality's `LOW_SPEED_SOG_KNOTS` (`services/recordings/row-quality.ts`) and does
 * not replace it. That gate asks whether the boat was sailing at all; this one asks whether a
 * heading or a wind angle from this row is trustworthy enough to feed an instrument estimate — at
 * low speed, leeway, steering noise and a slow-responding fluxgate all inflate the error these
 * checks are trying to isolate, well before the boat stops sailing in Row Quality's sense.
 *
 * Both are applied, in that order, rather than leaning on `3.5 > 2`: Row Quality's threshold is a
 * constant its own doc comment says will move, and a check that silently assumed this one was the
 * stricter of the two would stop filtering the day it wasn't.
 */
export const SOG_MIN_KNOTS = 3.5

/**
 * A channel's text as a number, or null where there was nothing usable to read.
 *
 * Blank is checked before the conversion, not after: `Number('')` is `0`, which would read a
 * channel that said nothing as a boat stopped dead or a compass pointing north. The parser leaves
 * an empty numeric cell absent rather than `''`, so this is the belt rather than the braces — but
 * it is one line, and the figure it protects is one nobody would question.
 */
export function channelValue(text: string | null): number | null {
  if (text === null || text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** Whether the boat was moving fast enough for this row to feed an instrument estimate. */
export function aboveSpeedGate(row: Pick<ReadableRow, 'sog'>): boolean {
  const sog = channelValue(row.sog)
  return sog !== null && sog >= SOG_MIN_KNOTS
}

/**
 * Each row's channels joined to its Countable verdict.
 *
 * Both arguments must describe the same rows in the same order, which in practice means both over
 * the whole Transcription, before any Race Window is applied — `analysisRowsWithin` narrows the
 * result of this just as happily as it narrows an `AnalysisRow[]`. A misaligned join would hand one
 * row's heading to its neighbour's verdict, so it throws rather than lines them up by index.
 */
export function readableRows(
  rows: readonly TranscriptionRow[],
  analysis: readonly AnalysisRow[]
): ReadableRow[] {
  if (!sameRowOrder(rows, analysis)) {
    throw new Error('the Transcription and its Countable verdicts are not the same rows')
  }

  return analysis.map((row, index) => ({ ...rows[index], ...row }))
}

/**
 * What the compass chart says about an Era's `HDG` **Measured Offset**, in words.
 *
 * In `services/` rather than beside the chart because the MCP `instrument_tuning` tool states the
 * same readings, and a tool may not hold a copy of a rule a chart applies (ADR 0042). The figures
 * are `compass-deviation.ts`'s; this decides only which of them a heading's readout lists and how
 * each is said.
 */

import { BIN_SIZE_DEG, MIN_ROWS_PER_BIN } from '@/services/analysis/compass-deviation'
import { races, rows, signedDegrees } from '@/services/analysis/instrument-tuning-text'
import type { EraHeadingOffset, HeadingBin, RaceHeadingOffset } from '@/types'

/** Headings the curve has no reading at, which the coverage word's own share does not say. */
export function headingsUnread(era: EraHeadingOffset): number {
  return era.heading_bin_count - era.headings_covered
}

/** Why a Race produced no compass curve, as a clause: the chart's, the Race tile's and the tool's. */
export function compassAbsence(excluded: { row_count: number }): string {
  return `only ${rows(excluded.row_count)} this check could read`
}

/** An Era with no heading over the gate, and so no curve to read. */
export function noCurveSentence(era: EraHeadingOffset): string {
  return `No heading in this Era rests on ${MIN_ROWS_PER_BIN} rows of any Race, so there is no curve to read. ${races(era.race_count)} measured; ${era.excluded.length} produced nothing.`
}

/** One heading bin's span, `from` inclusive and `to` exclusive, in degrees. */
export function binSpan(bin: Pick<HeadingBin, 'bin_start_deg'>): { from: number; to: number } {
  return { from: bin.bin_start_deg, to: bin.bin_start_deg + BIN_SIZE_DEG }
}

/**
 * Every Race that put a row in this heading bin, including the ones whose bin fell under the gate.
 *
 * Listed as not counted rather than omitted, so "nobody sailed here" and "nobody sailed here long
 * enough" are different sentences (ADR 0034).
 */
export function racesAtHeading(
  era: EraHeadingOffset,
  bin: number
): { race: RaceHeadingOffset; reading: HeadingBin }[] {
  return era.races.flatMap((race) =>
    race.bins[bin].row_count > 0 ? [{ race, reading: race.bins[bin] }] : []
  )
}

/** One Race's reading at one heading: its figure over its rows, or why it was not counted. */
export function raceHeadingReading(reading: HeadingBin): string {
  return reading.mean_error_deg === null
    ? `${rows(reading.row_count)} — under ${MIN_ROWS_PER_BIN}, not counted`
    : `${signedDegrees(reading.mean_error_deg)} · ${rows(reading.row_count)}`
}

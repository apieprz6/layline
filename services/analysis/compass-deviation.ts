/**
 * The **Measured Offset** for `HDG`, via `COG`: what the compass still reads wrong, by heading.
 *
 * `COG` is the GPS's course over ground and owes the compass nothing, so the difference between the
 * two, averaged over a Race and binned by heading, is what remains after whatever `HDG` **Programmed
 * Offset** is in force — a residual, which is what a Measured Offset is. A port of the prior art's
 * `compass_calibration.py`, over **Countable** rows and partitioned by **Calibration Era**.
 *
 * **The caveat travels with every figure**, and is not a footnote this module leaves to its caller:
 * the export carries no `HDG` column at all, so the compass is read through `CTW`, and
 * `CTW = HDG + leeway`. See `HEADING_OFFSET_CAVEAT`.
 *
 * Two representations, both of them properly called the Measured Offset, and neither a value to
 * type into an instrument: the per-heading curve, which is diagnostic of the deviation table the
 * compass builds for itself during an autocompensation, and a scalar mean of that curve, which is
 * an average of a periodic function and so matches no heading the compass actually shows (ADR
 * 0035). Diagnostic only, as every Instrument Tuning check is.
 */

import { normalizeAngle } from '@/services/analysis/angles'
import { byEra, dayOf } from '@/services/analysis/calibration-eras'
import { aboveSpeedGate, channelValue } from '@/services/analysis/readable-rows'
import { meanOf, meanOfSome, sampleStdDev } from '@/services/analysis/statistics'
import type {
  CalibrationEra,
  EraHeadingBin,
  EraHeadingOffset,
  HeadingBin,
  RaceHeadingOffset,
  RaceHeadingOffsetResult,
} from '@/types'

/**
 * The width of a heading bin, in degrees.
 *
 * Not a round number of convenience. The nke fluxgate compass records the measurement points of
 * its own deviation curve "every 10° with an accuracy of 0.25°" (user guide p. 6, §2.2.1), so a 10°
 * bin reproduces at analysis time the exact angular resolution the hardware itself corrects at.
 */
export const BIN_SIZE_DEG = 10

/** 360° of compass in `BIN_SIZE_DEG` bins — the rose a coverage figure is a share of. */
export const HEADING_BIN_COUNT = 360 / BIN_SIZE_DEG

/** Rows a bin needs before its mean is a reading rather than noise. */
export const MIN_ROWS_PER_BIN = 3

/**
 * Rows a Race needs before it is measured at all.
 *
 * A bare literal in the prior art (`compass_calibration.py:263`), named here because a Race that
 * falls under it is reported as excluded with its count, never as a zero.
 */
export const MIN_VALID_ROWS = 5

/**
 * What must be said wherever this figure is.
 *
 * The qtVlm VDR export has no `HDG` column, so the fluxgate's own reading is not recoverable from a
 * Recording: `CTW` is the closest thing it carries, and the qtVlm manual (p. 212–213) is explicit
 * that `CTW` is calculated from `HDG` and leeway. Leeway on this boat is ≈0 only because leeway is
 * computed from heel and there is no heel sensor to feed it — a fact about this instrument suite,
 * not about the channel, and one that stops holding the day a heel sensor is fitted.
 */
export const HEADING_OFFSET_CAVEAT =
  'Measured through `CTW`, because the recording carries no `HDG` column at all, and ' +
  '`CTW = HDG + leeway`. Leeway is ≈0 on this boat only because it is computed from heel and ' +
  'there is no heel sensor, so this reads as the compass alone only while that stays true.'

/** The fields this check reads. An `ReadableRow` satisfies it. */
export interface HeadingReadableRow {
  row_index: number
  /** Not **Frozen**, not **Low-Speed**, not in a **Maneuver Window** (ADR 0025). */
  countable: boolean
  /** Text, exactly as the file wrote it. Degrees, 0..360. */
  ctw: string | null
  /** Text. Degrees, 0..360. Position-derived, and so independent of the compass. */
  cog: string | null
  sog: string | null
}

/** One Race, as this check reads it. */
export interface HeadingReadableRace {
  race_id: string
  /** The **Race Window**'s start: what orders Races and what assigns each to a **Calibration Era**. */
  window_start: string
  /** The rows inside the Race Window, in row order, Countable or not. */
  rows: readonly HeadingReadableRow[]
}

/** Every bin's own start, which is the one list a Race's curve and an Era's are both laid over. */
const BIN_STARTS_DEG: number[] = Array.from(
  { length: HEADING_BIN_COUNT },
  (_, index) => index * BIN_SIZE_DEG
)

/** An Era bin that has a figure, which is what a swing and a mean are taken over. */
type MeasuredEraBin = EraHeadingBin & { mean_error_deg: number }

/** A row this check can read, with the error it carries. */
interface HeadingError {
  row_index: number
  heading_deg: number
  error_deg: number
}

/**
 * The rows the check may read, with each one's error.
 *
 * Three gates. **Countable** is the archive-wide rule (ADR 0025); `SOG_MIN_KNOTS` is this analysis's
 * own stricter speed gate; and `CTW` and `COG` must both be present, which nothing else covers —
 * Row Quality's Dropout detector reads `COG`, but a null `COG` on a live feed is a case of its own.
 *
 * **Not Water-Referenced is deliberately not a gate here**, where the sibling Asymmetry check makes
 * it one. The research spec translated the prior art's `STATUS` column into it for both checks, and
 * ADR 0025 has since settled the rule: it says what the *wind* columns mean, and this check reads no
 * wind column — only `CTW`, whose own presence is tested above, against a GPS course. The Asymmetry
 * check excludes it because its one input is computed from `STW`, so a blank `STW` makes that figure
 * fabricated; nothing of the sort is true of a heading. Measured on the archive, the two readings
 * are the same rows anyway: none of the 2,514 rows this check reads is Not Water-Referenced, pinned
 * in `__tests__/archive-instrument-tuning.test.ts`.
 */
function headingErrors(rows: readonly HeadingReadableRow[]): HeadingError[] {
  const errors: HeadingError[] = []

  for (const row of rows) {
    if (!row.countable || !aboveSpeedGate(row)) continue

    const heading = channelValue(row.ctw)
    const course = channelValue(row.cog)
    if (heading === null || course === null) continue

    errors.push({
      row_index: row.row_index,
      heading_deg: heading,
      error_deg: normalizeAngle(heading - course),
    })
  }

  return errors
}

/**
 * The 36 bins, each with every row that fell in it counted.
 *
 * Half-open, `[start, start + 10)`, which leaves a heading of exactly 360.0 in no bin at all —
 * faithfully, because the prior art does the same and wrapping it to 0 here would move which rows
 * count toward a coverage figure relative to the tool the archive's owner already reads.
 *
 * Every bin is returned, including the empty ones and the ones under `MIN_ROWS_PER_BIN`: a chart
 * has to be able to draw a heading nobody sailed differently from one sailed too little to average
 * (ADR 0034), and it cannot do that from a list that simply omits both.
 */
function headingBins(errors: readonly HeadingError[]): HeadingBin[] {
  return BIN_STARTS_DEG.map((bin_start_deg) => {
    const inBin = errors.filter(
      (error) =>
        error.heading_deg >= bin_start_deg && error.heading_deg < bin_start_deg + BIN_SIZE_DEG
    )

    return {
      bin_start_deg,
      bin_center_deg: bin_start_deg + BIN_SIZE_DEG / 2,
      row_count: inBin.length,
      mean_error_deg:
        inBin.length >= MIN_ROWS_PER_BIN ? meanOf(inBin.map((error) => error.error_deg)) : null,
    }
  })
}

/**
 * One Race's `HDG` Measured Offset, or why it has none.
 *
 * This is also the per-Race summary tile and the per-Race point of every Era aggregate — the same
 * number, computed once. A Race under `MIN_VALID_ROWS` returns its row count and no figure, so the
 * screen can say which Race produced nothing and why rather than draw it at zero.
 */
export function raceHeadingOffset(race: HeadingReadableRace): RaceHeadingOffsetResult {
  const errors = headingErrors(race.rows)
  const { race_id, window_start } = race

  if (errors.length < MIN_VALID_ROWS) {
    return { ok: false, race_id, window_start, reason: 'too-few-rows', row_count: errors.length }
  }

  const degrees = errors.map((error) => error.error_deg)
  const bins = headingBins(errors)
  const covered = bins.filter((bin) => bin.mean_error_deg !== null)

  return {
    ok: true,
    race_id,
    window_start,
    offset: {
      race_id,
      window_start,
      // Over rows, so a heading the Race spent longer on weighs more in it. The Era aggregate
      // states its own weighting separately, and both are the same figure read two ways.
      mean_offset_deg: meanOfSome(degrees),
      std_dev_deg: sampleStdDev(degrees),
      // Folded rather than spread: `Math.max(...rows)` is one argument per row, and a long enough
      // race would overflow the call stack instead of returning a figure.
      max_abs_error_deg: degrees.reduce((worst, error) => Math.max(worst, Math.abs(error)), 0),
      row_count: errors.length,
      headings_covered: covered.length,
      heading_coverage: covered.length / HEADING_BIN_COUNT,
      bins,
      caveat: HEADING_OFFSET_CAVEAT,
    },
  }
}

/** A bin's mean across the Races that had one, with each Race's own mean kept beside it. */
function eraHeadingBin(bin_start_deg: number, races: readonly RaceHeadingOffset[]): EraHeadingBin {
  const race_means = races.flatMap((race) => {
    const mean = race.bins[bin_start_deg / BIN_SIZE_DEG].mean_error_deg
    return mean === null ? [] : [{ race_id: race.race_id, mean_error_deg: mean }]
  })

  return {
    bin_start_deg,
    bin_center_deg: bin_start_deg + BIN_SIZE_DEG / 2,
    mean_error_deg: meanOf(race_means.map((race) => race.mean_error_deg)),
    race_count: race_means.length,
    race_means,
  }
}

/**
 * One Era's curve: each Race's own bin means averaged, never the Races' rows pooled.
 *
 * Every qualifying Race counts once per bin, which is the prior art's own cross-recording behaviour
 * and the reason a 13-hour distance race cannot swamp a season of 90-minute beer-cans the way
 * pooling rows would. The cost is less data behind an individual bin; `MIN_ROWS_PER_BIN` has
 * already protected each Race's contribution to it from being noise, which is the level to average
 * at.
 *
 * Races that produced nothing are carried through as `excluded`, with their reason, rather than
 * dropped: "the curve has no reading at this heading" and "there was no Race here" are different
 * states, and a chart that received only the second could draw a gap it should have labelled.
 */
export function eraHeadingOffset(
  era: CalibrationEra,
  results: readonly RaceHeadingOffsetResult[]
): EraHeadingOffset {
  const inOrder = [...results].sort((a, b) => a.window_start.localeCompare(b.window_start))
  const races = inOrder.flatMap((result) => (result.ok ? [result.offset] : []))
  const excluded = inOrder.flatMap((result) => (result.ok ? [] : [result]))

  const bins = BIN_STARTS_DEG.map((bin_start_deg) => eraHeadingBin(bin_start_deg, races))
  const measured = bins.filter((bin): bin is MeasuredEraBin => bin.mean_error_deg !== null)

  const highest = measured.reduce<MeasuredEraBin | null>(
    (found, bin) => (found === null || bin.mean_error_deg > found.mean_error_deg ? bin : found),
    null
  )
  const lowest = measured.reduce<MeasuredEraBin | null>(
    (found, bin) => (found === null || bin.mean_error_deg < found.mean_error_deg ? bin : found),
    null
  )

  return {
    era,
    bins,
    // The headline (ADR 0035). A single bin's figure is not an aggregate of the other bins, so
    // unlike the means below it carries no weighting to disclose.
    swing:
      highest === null || lowest === null
        ? null
        : { highest, lowest, swing_deg: highest.mean_error_deg - lowest.mean_error_deg },
    // Two correct means of one figure, named by their weighting rather than one of them printed as
    // "the" mean (ADR 0032): every heading equal, or every Race equal.
    mean_of_bins_deg: meanOf(measured.map((bin) => bin.mean_error_deg)),
    mean_of_races_deg: meanOf(races.map((race) => race.mean_offset_deg)),
    race_count: races.length,
    headings_covered: measured.length,
    // ADR 0034's coverage axis: a bin resting on one Race is that Race's heading mix, not the Era's.
    headings_on_two_or_more_races: bins.filter((bin) => bin.race_count >= 2).length,
    heading_bin_count: HEADING_BIN_COUNT,
    races,
    excluded,
    caveat: HEADING_OFFSET_CAVEAT,
  }
}

/**
 * Every Era that holds a Race, with that Era's curve.
 *
 * An Era nobody sailed in is not returned at all — a stretch of the calendar with no Race in it is
 * not a figure that could not be computed, and does not belong in the same list as one. An Era
 * whose every Race was excluded *is* returned, with no curve and its exclusions intact, for the
 * same reason `eraHeadingOffset` keeps them.
 */
export function headingOffsetByEra(
  eras: readonly CalibrationEra[],
  results: readonly RaceHeadingOffsetResult[]
): EraHeadingOffset[] {
  return byEra(eras, results, (result) => dayOf(result.window_start)).map(({ era, items }) =>
    eraHeadingOffset(era, items)
  )
}

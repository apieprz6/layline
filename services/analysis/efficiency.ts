/**
 * **Polar Efficiency** and **VMG Efficiency**: one row, and a race or a season of them.
 *
 * ADR 0026's `computeRowEfficiency` seam, filled in. The numerator is `SOG` and not `STW` (ADR
 * 0027): the Polar is a through-water target, so the paddlewheel is the dimensionally correct
 * choice, but its calibration varies between sessions — measured on this boat, `STW` runs a couple
 * of percent under `SOG` around 4–5 knots and roughly ten by 9–10 — while Lake Michigan's current
 * at this venue is negligible, so `SOG`'s one theoretical weakness barely applies and `STW`'s
 * practical one does.
 *
 * ## Why a race figure is a ratio of sums and never a mean of percentages
 *
 * The obvious aggregate — average every row's percent of target — is wrong twice over here, and
 * ADR 0036 rules it out.
 *
 * A **Filler-Anchored** row's target can read far too low, because the cell it came from is a
 * certificate ramping up from zero rather than a measurement. That drives an individual percentage
 * arbitrarily high, and a mean of percentages lets a handful of such rows dominate a figure nobody
 * can see the rows behind. Summing distances instead puts each row in proportion to how far the
 * boat actually went in it.
 *
 * And the rows are not evenly spaced. qtVlm logs on events, not on a clock: one archive recording's
 * median in-window cadence is 75 seconds, and the largest gap in the archive is hours wide. A flat
 * per-row mean silently weights a 10-second row the same as a 10-minute one, so each row is
 * weighted by its own measured interval — the same rule `services/recordings/provenance.ts`
 * follows, and never an assumed cadence.
 *
 * The sums travel beside the ratio, because sums survive re-aggregation and averages do not: a
 * season figure adds these races' sums, it does not average their ratios.
 */

import { zone } from '@/services/analysis/maneuvers'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { vmgKnots } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { EfficiencyAggregate, RowEfficiency } from '@/types'

/**
 * What scoring reads of a row: the three channels, and ADR 0025's verdict.
 *
 * Written as its own interface for the reason `QualityAssessableRow` is — so this module cannot
 * quietly grow a dependency on a channel it has no rule about. Every value is text, exactly as the
 * file wrote it, and is read as a number only here.
 *
 * A `ReadableRow` satisfies this, which is how a caller gets one: `readableRows` already joins a
 * Transcription to its Countable verdicts and already refuses to line two misaligned row lists up
 * by index, so there is no second join here to disagree with it.
 */
export interface ScorableRow {
  row_index: number
  row_time: string
  /** Knots over the ground. The efficiency numerator (ADR 0027). */
  sog: string | null
  /** Knots of true wind speed, which is one of the Polar's two axes. */
  tws: string | null
  /** Signed, −180..180, positive = starboard (ADR 0008). */
  twa: string | null
  /** Not **Frozen**, not **Low-Speed**, not inside a **Maneuver Window** (ADR 0025). */
  countable: boolean
}

/**
 * How long each row lasted, in seconds, measured and never assumed. Null where it cannot be.
 *
 * A row is a sample at an instant, and what it describes is the boat from that instant until the
 * next sample contradicts it — so a row's interval is the gap to the row after it, which is the
 * step `describeRecording` already measures. Two rows get **null**, and both are right to:
 *
 *   - **The last row in hand.** There is no following sample, so no span was measured. Standing in
 *     the median cadence would be inventing one, and a single row out of thousands is a cheaper
 *     loss than a figure built on an assumed clock.
 *   - **A row the naive wall clock stepped backwards across.** The hour a fall-back repeats is
 *     recorded twice and never converted away to hide it, so one step a season is −3,600 seconds.
 *     That is not a duration; a negative weight would subtract a real row's distance from the race.
 *
 * Null rather than zero for both, because a **zero** is a different fact: two rows written at the
 * same timestamp did measure an interval, and it was nothing. It weighs nothing in the sums and is
 * still a row the figure accounted for, which is a distinction `aggregateEfficiency` has to report.
 *
 * Measured over *every* row given, which must be every row in the window and not only the Countable
 * ones: an excluded row's own interval then falls out of the sums entirely, rather than being
 * credited to whichever neighbour happens to be Countable.
 */
export function rowIntervalSeconds(
  rows: readonly Pick<ScorableRow, 'row_time'>[]
): (number | null)[] {
  const seconds = rows.map((row) => wallClockSeconds(row.row_time))

  return rows.map((_, index) => {
    if (index + 1 >= rows.length) return null

    const step = seconds[index + 1] - seconds[index]
    return step >= 0 ? step : null
  })
}

/** Distance covered at a speed over an interval. Knots are nautical miles per hour. */
function distanceNm(knots: number, seconds: number): number {
  return (knots * seconds) / 3600
}

/**
 * One row scored against a Polar.
 *
 * Says nothing about whether the row is **Countable** — that is the caller's gate and this is the
 * measurement. A null figure means the row or the Polar could not answer; it never means the
 * answer was unflattering, and a **Filler-Anchored** target is not one of those cases.
 */
export function computeRowEfficiency(row: ScorableRow, targets: PolarTargets): RowEfficiency {
  const sog = channelValue(row.sog)
  const tws = channelValue(row.tws)
  const twa = channelValue(row.twa)

  const target_speed = twa !== null && tws !== null ? targets.targetSpeed(twa, tws) : null
  const vmg_zone = twa === null ? null : zone(twa)
  const target_vmg = vmg_zone !== null && tws !== null ? targets.targetVmg(vmg_zone, tws) : null
  const vmg = sog !== null && twa !== null ? vmgKnots(sog, twa) : null

  return {
    row_index: row.row_index,
    target_speed,
    polar_efficiency:
      sog !== null && target_speed !== null && target_speed.knots > 0
        ? sog / target_speed.knots
        : null,
    vmg_zone,
    vmg,
    target_vmg,
    vmg_efficiency:
      vmg !== null && target_vmg !== null && target_vmg.estimated_knots > 0
        ? vmg / target_vmg.estimated_knots
        : null,
  }
}

/**
 * A row whose interval has already been measured and whose figures have already been scored.
 *
 * The shape `sumEfficiency` adds up, and what lets the same arithmetic serve two callers that
 * cannot both measure their own intervals:
 *
 *   - `aggregateEfficiency` below, which has a race's whole window in hand and measures them;
 *   - an **Analysis Filter**'s matched rows in the browser, which do **not** have the window in
 *     hand. A filter removes rows from the middle of a recording, so the gap to the next *matched*
 *     row is not a span anything happened over, and the rows of two races are not one sequence at
 *     all. Those rows carry an interval measured on the server over their own race's window
 *     (`MatchableRow`), and this adds those up without re-deriving anything.
 *
 * A `MatchableRow` satisfies it structurally, which is how the second caller gets one.
 */
export interface SummableRow {
  /** Not **Frozen**, not **Low-Speed**, not inside a **Maneuver Window** (ADR 0025). */
  countable: boolean
  /** Seconds this row lasted, measured. Null where none could be — see `rowIntervalSeconds`. */
  interval_seconds: number | null
  /** Knots over the ground, as a number. The efficiency numerator (ADR 0027). */
  sog: number | null
  /** This row scored against the **Polar** its own Race was sailed under. */
  efficiency: RowEfficiency
}

/**
 * The ratio of sums itself: every Countable row's distance over its target-implied distance.
 *
 * The one place the sums are accumulated, for the reason every shared rule in this directory is
 * shared — two copies would be two chances for a race figure and a season figure to disagree about
 * what **Polar Efficiency** is.
 *
 * Every Countable row lands in exactly one of three tallies — `rows`, `rows_without_interval`,
 * `rows_without_target` — so a screen can state the coverage behind the figure (ADR 0025) rather
 * than leaving a row that dropped out unaccounted for anywhere.
 *
 * Additive across races by construction: each row carries its own interval and its own target,
 * the latter from the Polar its Race was actually sailed under (ADR 0012), so adding two races'
 * rows and adding two races' sums give the same number.
 */
export function sumEfficiency(rows: readonly SummableRow[]): EfficiencyAggregate {
  const totals = {
    rows: 0,
    filler_anchored_rows: 0,
    rows_without_interval: 0,
    rows_without_target: 0,
    elapsed_seconds: 0,
    actual_distance_nm: 0,
    target_distance_nm: 0,
    actual_vmg_distance_nm: 0,
    target_vmg_distance_nm: 0,
  }

  for (const row of rows) {
    if (!row.countable) continue

    const seconds = row.interval_seconds
    if (seconds === null) {
      totals.rows_without_interval += 1
      continue
    }

    const scored = row.efficiency

    if (scored.target_speed === null || row.sog === null) {
      totals.rows_without_target += 1
      continue
    }

    totals.rows += 1
    totals.elapsed_seconds += seconds
    totals.actual_distance_nm += distanceNm(row.sog, seconds)
    totals.target_distance_nm += distanceNm(scored.target_speed.knots, seconds)
    if (scored.target_speed.filler_anchored) totals.filler_anchored_rows += 1

    // The VMG sums take their own subset of the rows. A row with a Target Speed and no Target VMG
    // is rare — the TWS axis answers both — but counting it in one sum and not the other would
    // silently divide distances the boat covered by targets for a different set of rows.
    if (scored.vmg !== null && scored.target_vmg !== null) {
      totals.actual_vmg_distance_nm += distanceNm(scored.vmg, seconds)
      totals.target_vmg_distance_nm += distanceNm(scored.target_vmg.estimated_knots, seconds)
    }
  }

  return {
    ...totals,
    polar_efficiency:
      totals.target_distance_nm > 0 ? totals.actual_distance_nm / totals.target_distance_nm : null,
    vmg_efficiency:
      totals.target_vmg_distance_nm > 0
        ? totals.actual_vmg_distance_nm / totals.target_vmg_distance_nm
        : null,
  }
}

/**
 * A race's or a season's figure: total distance over total target-implied distance.
 *
 * Hand this **every** row in the window, Countable or not, with its verdict on it — the intervals
 * are measured over all of them and summed over the Countable ones, which is what keeps an excluded
 * row's time out of the figure instead of in a neighbour's weight.
 *
 * For a season, sum these aggregates' own sums rather than calling this across races: the rows of
 * two races are not one sequence, and differencing across the seam would weight the last row of one
 * race by the gap to the first row of the next.
 */
export function aggregateEfficiency(
  rows: readonly ScorableRow[],
  targets: PolarTargets
): EfficiencyAggregate {
  const intervals = rowIntervalSeconds(rows)

  return sumEfficiency(
    rows.map((row, index) => ({
      countable: row.countable,
      interval_seconds: intervals[index],
      sog: channelValue(row.sog),
      // Scored for every row given, Countable or not. One wasted lookup per excluded row buys a
      // caller that cannot accidentally score a different set of rows than it summed.
      efficiency: computeRowEfficiency(row, targets),
    }))
  )
}


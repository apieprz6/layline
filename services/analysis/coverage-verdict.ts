/**
 * The **coverage verdict**: how much of a season a figure rests on.
 *
 * ADR 0032 judged each Instrument Tuning figure against the σ between Race means. ADR 0034 retired
 * that, because the archive showed what the σ was actually measuring: a Race that sailed north
 * reads high on the compass and one that sailed WSW reads low, so the scatter between Race means is
 * a fact about which courses were sailed and not about how well each figure was measured. A band
 * off that quantity read `WORTH WATCHING` about something that is not noise.
 *
 * What replaces it says **how much evidence there is, and nothing about the instrument**. The
 * figure and the chart behind it say whether the instrument is off; this says whether to lean on
 * them. No verdict is a compliment — `SOLID` means a season covered the measurement, not that the
 * compass is right.
 *
 * Each channel's coverage is a different quantity, because each measurement is thin in a different
 * way: the compass can only be read where the boat has sailed, an Asymmetry can only be
 * interpreted where both points of sail were paired, and a speed line is only a season's line
 * where the Races have their own.
 *
 * **The cut-points are provisional** and ADR 0034 says so explicitly: the decision there is the
 * axis. They are named constants and asserted at the boundary in the suite rather than against the
 * archive's current figures, so widening the season moves the verdict without failing a test that
 * was about something else.
 */

import type { EraDivergence } from '@/services/analysis/paddlewheel'
import type { AsymmetryFigure, CoverageStatement, EraHeadingOffset } from '@/types'

/**
 * The share of a population a figure needs before it is `THIN` rather than `ANECDOTAL`.
 *
 * One third, which is the prototype's own cut (ADR 0034). Under it, the figure is a handful of a
 * season read as though it were the season.
 */
export const THIN_SHARE = 1 / 3

/** The share a figure needs to read `SOLID`. Two-thirds, the prototype's other cut. */
export const SOLID_SHARE = 2 / 3

/**
 * **Tack Pairs** at one point of sail before the Asymmetry there is `THIN` rather than `ANECDOTAL`.
 *
 * Five, which is the one count ADR 0034 names and the one the prototype flagged "too few to lean
 * on" beneath. The archive's downwind side has two.
 */
export const ASYMMETRY_THIN_PAIRS = 5

/**
 * Pairs before it reads `SOLID`.
 *
 * Twice `ASYMMETRY_THIN_PAIRS`, so the three-way scale over a count has the same shape as the one
 * over a share — where `SOLID_SHARE` is twice `THIN_SHARE`. ADR 0034 names no second cut for this
 * channel, so this one is chosen here and is as provisional as the rest; ten pairs is also roughly
 * where the upwind side of this archive sits, which is the only measured anchor available.
 */
export const ASYMMETRY_SOLID_PAIRS = 2 * ASYMMETRY_THIN_PAIRS

/**
 * The verdict a share earns.
 *
 * An empty population is `ANECDOTAL` by decision rather than by `NaN` falling through two failed
 * comparisons — which is where `0 / 0` would land it, correctly and for the wrong reason. Callers
 * that can distinguish "nothing to divide" from "a share of nothing" say so in their own words
 * before getting here; this is the floor under both.
 */
function fromShare(found: number, population: number, reason: string): CoverageStatement {
  if (population <= 0) return { verdict: 'ANECDOTAL', reason }

  const share = found / population

  return {
    verdict: share >= SOLID_SHARE ? 'SOLID' : share >= THIN_SHARE ? 'THIN' : 'ANECDOTAL',
    reason,
  }
}

/**
 * `HDG`: the share of the 36 headings resting on **two or more** Races in this Era.
 *
 * Two, not one. A bin resting on a single Race is that Race's heading mix rather than the Era's,
 * and the archive's most extreme bin rests on two — which is exactly the figure a sailor would
 * otherwise read as the compass's worst heading.
 */
export function headingCoverage(era: EraHeadingOffset): CoverageStatement {
  const { headings_on_two_or_more_races: shared, heading_bin_count: bins } = era

  return fromShare(
    shared,
    bins,
    `${shared} of ${bins} headings rest on two or more Races`
  )
}

/** A pair count as the reason reads it, so "0" never appears where "none" is meant. */
function pairsPhrase(count: number, side: string): string {
  return count === 0 ? `no Tack Pair ${side}` : `${count} Tack Pair${count === 1 ? '' : 's'} ${side}`
}

/**
 * `AWA`: the pair count on the **weaker** point of sail.
 *
 * Not the total and not the better side. The check that distinguishes a vane set off-centre — which
 * leans the same way upwind and downwind — from a compass deviation or a true-wind-model error is
 * the comparison *between* the two points of sail, so an Asymmetry measured on eighteen upwind
 * pairs and two downwind ones cannot be interpreted at all. A point of sail that paired no tacks
 * counts as none, because that is what it is; the figure for it is absent, and absent is not a
 * reason to read the other side as though it stood alone.
 *
 * Takes the two figures rather than the whole Era, because the Tack Dial draws a Race as readily as
 * an Era and the verdict beneath it has to be about whatever is on screen. Handed the Era while the
 * dial showed one Race, it would have stated the season's pair counts under a single afternoon's.
 */
export function asymmetryCoverage(figures: {
  upwind: Pick<AsymmetryFigure, 'pair_count'> | null
  downwind: Pick<AsymmetryFigure, 'pair_count'> | null
}): CoverageStatement {
  const upwind = figures.upwind?.pair_count ?? 0
  const downwind = figures.downwind?.pair_count ?? 0

  const verdict =
    Math.min(upwind, downwind) >= ASYMMETRY_SOLID_PAIRS
      ? 'SOLID'
      : Math.min(upwind, downwind) >= ASYMMETRY_THIN_PAIRS
        ? 'THIN'
        : 'ANECDOTAL'

  if (upwind === 0 && downwind === 0) {
    return { verdict, reason: 'no Tack Pair at either point of sail' }
  }

  const [weak, strong] =
    downwind <= upwind
      ? [pairsPhrase(downwind, 'downwind'), `${upwind} upwind`]
      : [pairsPhrase(upwind, 'upwind'), `${downwind} downwind`]

  return { verdict, reason: `${weak}, against ${strong}` }
}

/**
 * `STW`: the share of this Era's Races carrying a line of their own.
 *
 * A Race whose rows went into the season's line but which cleared neither of ADR 0027's gates on
 * its own contributes rows and no evidence that the season's line is a shape the boat repeats. An
 * Era nobody sailed in says so rather than dividing by zero: `0/0` is not a coverage of nought.
 */
export function speedCoverage(era: EraDivergence): CoverageStatement {
  const races = era.races.length
  if (races === 0) return { verdict: 'ANECDOTAL', reason: 'no Race in this Era' }

  return fromShare(
    era.races_with_a_line,
    races,
    `${era.races_with_a_line} of ${races} Races carry a line of their own`
  )
}

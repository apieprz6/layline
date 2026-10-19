/**
 * What the **Tack Dial** says about an **Apparent Wind Asymmetry**, in words.
 *
 * In `services/` rather than beside the dial because the MCP `instrument_tuning` tool states the
 * same sentences, and a tool may not hold a copy of a judgement a chart makes (ADR 0042). The
 * figures are `awa-asymmetry.ts`'s; this is only how a sailor reads them. It states which tack
 * reads wider and by how much, and never what to set the vane to.
 */

import { ASYMMETRY_THIN_PAIRS } from '@/services/analysis/coverage-verdict'
import type { AsymmetryFigure, Tack, TackPair } from '@/types'

/** "Port reads 11.5° wider", or that the two tacks held the same angle — a reading, not a gap. */
export function widerSentence(figure: AsymmetryFigure): string {
  return figure.wider_tack === null
    ? 'Both tacks held the same angle'
    : `${figure.wider_tack === 'port' ? 'Port' : 'Starboard'} reads ${figure.wider_by_deg.toFixed(1)}° wider`
}

/**
 * Whether one point of sail rests on too few **Tack Pairs** to lean on.
 *
 * ADR 0034's Tack Dial readout rule, which ADR 0035 reuses verbatim for the card: under
 * `ASYMMETRY_THIN_PAIRS`, the side is flagged in words rather than hidden.
 */
export function tooFewToLeanOn(figure: Pick<AsymmetryFigure, 'pair_count'>): boolean {
  return figure.pair_count < ASYMMETRY_THIN_PAIRS
}

/**
 * Whether the two points of sail lean the same way, and what that does and does not imply.
 *
 * Three answers, not two. A side that read *exactly* symmetric leans neither way, so comparing it
 * with `Math.sign` would call a 0.0° upwind figure "the opposite way" from any downwind one at all —
 * reporting a disagreement between a measurement and a measurement of nothing.
 */
export function leaning(upwind: AsymmetryFigure | null, downwind: AsymmetryFigure | null): string {
  if (upwind === null || downwind === null) {
    return `No ${upwind === null ? 'upwind' : 'downwind'} pairs here, so the check that separates a vane set off-centre from everything else cannot be made.`
  }

  if (upwind.wider_tack === null || downwind.wider_tack === null) {
    const flat = upwind.wider_tack === null ? 'Upwind' : 'Downwind'
    return `${flat} the two tacks held the same angle, so there is nothing to compare the other point of sail’s lean against.`
  }

  return upwind.wider_tack === downwind.wider_tack
    ? 'Upwind and downwind lean the same way — what a vane set off-centre would do. The compass, or qtVlm’s true-wind model, could still produce it.'
    : 'Upwind and downwind lean opposite ways. A vane set off-centre leans the same way on both points of sail, so this is not, on its own, a vane offset.'
}

/** One **Tack Pair**'s two held angles as magnitudes, and which tack held the wider one. */
export interface PairHeld {
  starboard_deg: number
  port_deg: number
  wider_tack: Tack
  wider_by_deg: number
}

/**
 * A pair read the way the dial draws it: each tack's angle as a magnitude, the side being the
 * picture rather than the sign.
 */
export function pairHeld(pair: TackPair): PairHeld {
  const starboard = Math.abs(pair.starboard.held_angle_deg)
  const port = Math.abs(pair.port.held_angle_deg)

  return {
    starboard_deg: starboard,
    port_deg: port,
    wider_tack: port > starboard ? 'port' : 'starboard',
    wider_by_deg: Math.abs(port - starboard),
  }
}

/** The clock time a pair happened at, `HH:MM`, in the Recording's own frame. */
export function pairClock(pair: Pick<TackPair, 'at'>): string {
  return pair.at.slice(11, 16)
}

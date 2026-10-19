/**
 * The `STW` card's answer — "does the paddlewheel need recalibrating?" — in words (ADR 0041).
 *
 * The numbers are `paddlewheel-verdict.ts`'s; everything here is how a sailor reads them. Two rules
 * hold throughout:
 *
 * - **Slow and fast, never a sign.** `+0.37 kt` asks the reader to remember which instrument was
 *   subtracted from which; "0.37 kt slow" does not. Slow means GPS was faster than the paddlewheel
 *   said — the log under-reads.
 * - **Whether, never how much to change.** A gap is given in knots at stated speeds. No percentage,
 *   since "reads 5% slow" is "set the multiplier to 1.05" with the arithmetic left to the reader
 *   (ADR 0027, ADR 0041).
 *
 * In `services/` rather than beside the card because the MCP `instrument_tuning` tool states the
 * same verdict, and a tool may not hold a copy of a sentence the card composes (ADR 0042).
 */

import {
  CLOSE_ENOUGH_KNOTS,
  MIN_RACES_PER_BAND,
  MIN_ROWS_PER_RACE,
  type PaddlewheelVerdict,
  type SpeedBandRead,
  type SpeedBandVerdict,
} from '@/services/analysis/paddlewheel-verdict'

/**
 * The `STW` caveat — the one of the three the checks themselves do not carry.
 *
 * The other two travel with their figures because each is about how the figure was *derived*: a
 * compass read through `CTW`, an apparent wind recomputed by qtVlm. This one is about the venue:
 * the verdict can see a current that swings with heading, but a steady set along the course would
 * look like the paddlewheel to every check it makes, and only knowing the water rules that out.
 */
export const PADDLEWHEEL_CAVEAT =
  'Current moves SOG and leaves STW alone, so it reads here as a paddlewheel error. The verdict ' +
  'checks whether the gap swings with heading, which current does; a steady current along the ' +
  'course would still go unseen. The display applies the Instrument Calibration before the ' +
  'recording is written, so every STW here already carries it; no uncorrected reading is ' +
  'reconstructed.'

/** "0.37 kt slow", "0.10 kt fast", or "spot on" — never a signed figure. */
export function slowFast(gap: number): string {
  if (Math.abs(gap) < 0.005) return 'spot on'
  return `${Math.abs(gap).toFixed(2)} kt ${gap > 0 ? 'slow' : 'fast'}`
}

export const BAND_WORDS: Record<SpeedBandVerdict, string> = {
  thin: 'too few Races',
  'spot-on': 'spot on',
  'reads-slow': 'reads slow',
  'reads-fast': 'reads fast',
  'races-disagree': 'Races disagree',
}

/** One knot of `STW`, as "2–3 kt". */
export function bandRange(band: SpeedBandRead): string {
  return `${band.band}–${band.band + 1} kt`
}

/** The runs of adjacent bands holding one of `verdicts`, as "2–4 kt", "8–9 kt". */
export function spans(bands: readonly SpeedBandRead[], verdicts: readonly SpeedBandVerdict[]): string {
  const runs: [number, number][] = []
  for (const band of bands) {
    if (!verdicts.includes(band.verdict)) continue
    const last = runs[runs.length - 1]
    if (last !== undefined && last[1] === band.band) last[1] = band.band + 1
    else runs.push([band.band, band.band + 1])
  }
  return runs.map(([from, to]) => `${from}–${to} kt`).join(', ')
}

/** "reads slow at 2–4 kt and reads fast at 8–9 kt", over the bands where the Races agree. */
function whereOff(bands: readonly SpeedBandRead[]): string {
  return [
    bands.some((band) => band.verdict === 'reads-slow') && `reads slow at ${spans(bands, ['reads-slow'])}`,
    bands.some((band) => band.verdict === 'reads-fast') && `reads fast at ${spans(bands, ['reads-fast'])}`,
  ]
    .filter(Boolean)
    .join(' and ')
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

/** The verdict as a headline and the one sentence that earns it. */
export function verdictWords(verdict: PaddlewheelVerdict): { headline: string; detail: string } {
  const { bands, recommendation, spot_on_share: share, heading, drift } = verdict
  const off = whereOff(bands)
  const spot = spans(bands, ['spot-on'])
  const disagree = spans(bands, ['races-disagree'])

  switch (recommendation) {
    case 'recalibrate':
      return {
        headline: 'Worth recalibrating',
        detail: `The paddlewheel ${off}, the Races agree, and one calibration can take it out.`,
      }
    case 'clean-first':
      return {
        headline: 'Clean the paddlewheel first',
        detail: `The gap moved ${Math.abs(drift.change_knots ?? 0).toFixed(2)} kt between the first Races and the last, which is what weed on the wheel does. Clean it and sail again before recalibrating.`,
      }
    case 'leave-it':
      if (off !== '') {
        return {
          headline: 'No recalibration needed',
          detail: `Spot on at ${spot}, where ${percent(share ?? 0)} of your sailing is. It ${off} — but recalibrating moves every speed together, so fixing that would make the rest read wrong.`,
        }
      }
      return {
        headline: 'No recalibration needed',
        detail:
          `Within ${CLOSE_ENOUGH_KNOTS} kt of GPS at ${spot}.` +
          (disagree === ''
            ? ''
            : ` At ${disagree} the Races disagree with each other — current or noise, not calibration.`),
      }
    case 'cant-tell':
      if (bands.every((band) => band.verdict === 'thin')) {
        return {
          headline: 'Not enough Races yet',
          detail: `A speed needs ${MIN_RACES_PER_BAND} Races with ${MIN_ROWS_PER_RACE} rows each there before it gets a verdict.`,
        }
      }
      if (off !== '' && heading.swing_knots !== null) {
        return {
          headline: 'Can’t tell yet',
          detail: `It ${off}, but the gap swings ${heading.swing_knots.toFixed(2)} kt with heading. Current does that and a paddlewheel can’t, so recalibrating would bake the current in.`,
        }
      }
      return {
        headline: 'Can’t tell yet',
        detail: 'The Races disagree with each other more than the paddlewheel is off — that is current or noise. More Races will settle it.',
      }
  }
}

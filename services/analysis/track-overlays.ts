/**
 * The six quantities the **Race Track Heatmap** can colour a race by, and the one rule set that
 * bands all of them.
 *
 * ADR 0033 drew the track as one picture of one quantity — percent of **Target Speed** — and sent
 * the client a colour per segment so that nothing on the far side could re-decide what a row
 * meant. Six overlays over seventeen hundred rows cannot each be precomputed into that payload,
 * and a switch that costs a round trip is not a switch, so the rule is amended rather than evaded
 * (ADR 0037): the server computes each row's **values and verdicts**, and both sides band them
 * *through this module*. The client picks which band to paint; it cannot invent one the rules
 * refuse, because the rules are here and nowhere else.
 *
 * ## Why six scales and not one ramp
 *
 * A scale is a claim about the shape of its quantity, and these quantities are four different
 * shapes:
 *
 * - **A ratio is a polarity question.** Percent of Target Speed and percent of Target VMG both
 *   diverge about 100%, which is ADR 0033's ramp, unchanged.
 * - **A speed is a magnitude.** `SOG` gets a sequential one-hue ramp: there is no midpoint to
 *   diverge about, and a diverging ramp would invent one.
 * - **Wind speed already has a palette, and this is the one place it is the right one.** ADR 0033
 *   refused the wind-band tokens for percent-of-target because they mean an absolute wind speed on
 *   a screen that also shows a ratio. On a `TWS` overlay they mean exactly what they say, so
 *   `WIND_THRESHOLDS` is read rather than restated.
 * - **A signed angle diverges by side.** `TWA` is which tack and how far off the wind, so the two
 *   arms are the tack pair and depth is the angle — never a single ramp over `|TWA|`, which would
 *   draw both tacks identically and lose the thing a sailor is looking for.
 * - **A course is cyclic, and Layline has no cyclic palette.** `COG` is therefore drawn as four
 *   compass quadrants and the legend says so. A hue wheel would look right and be a lie after
 *   dark, where every hue collapses to one.
 *
 * ## Which rows each overlay may colour
 *
 * **Frozen** is the exclusion every overlay keeps: those values are a verbatim copy of the row
 * above rather than a reading (ADR 0009), and colouring one would paint a number the boat never
 * produced. Nothing else is shared, because the overlays are not all claims of the same kind:
 *
 * - The two ratios are **performance metrics**, so ADR 0025's whole rule applies — a Low-Speed or
 *   mid-manoeuvre row carries no percent, the same as everywhere else in Layline.
 * - The four channel overlays are **readings**. A parked boat's speed over the ground is simply
 *   what the GPS measured, and refusing to draw it would be hiding a recorded value to protect a
 *   rule about averages that this overlay is not computing. So they colour any row whose feed was
 *   alive and whose own channel was not blank.
 *
 * That asymmetry is the point rather than an oversight, and it is why `TrackNotScored` keeps
 * `low_speed` and `maneuver_window` apart from `no_reading`.
 */

import { WIND_THRESHOLDS } from '@/lib/utils/wind'
import type {
  TrackBandToken,
  TrackNotScored,
  TrackOverlay,
  TrackPaint,
  TrackRowFacts,
} from '@/types'

/** One step of a scale: the band it paints, and the value at which the next one takes over. */
export interface TrackBandStep {
  band: TrackBandToken
  /** Values strictly below this belong to this step. `Infinity` on the last. */
  below: number
  /** The axis tick under the swatch, where the scale shows one. */
  tick: string
  /** What this step means, in words, for the swatch's title and for a screen reader. */
  label: string
}

/** How a scale behaves, which decides what its legend has to say after dark. */
export type TrackScaleKind = 'diverging' | 'sequential' | 'tack' | 'categorical'

export interface TrackScale {
  overlay: TrackOverlay
  /** The chip the sailor taps. Short enough for a row of six at 390px. */
  chip: string
  /** What the overlay is, written out, for the legend's heading. */
  title: string
  /** The unit the readout prints, or null for a ratio shown as a percent. */
  unit: string | null
  kind: TrackScaleKind
  bands: readonly TrackBandStep[]
  /** The sentence under the ramp by day. */
  day: string
  /**
   * The sentence after dark, when `.theme-nightvision` has collapsed every hue to one red depth
   * ramp. Each scale loses something different, and each has to say which thing it lost — a legend
   * keeping its daylight words is the defect ADR 0033 named, not the collapsed hue.
   */
  night: string
  /** A caveat that travels with every figure on this overlay, wherever it is shown. */
  caveat?: string
}

/** The value an overlay reads off a row, or null where that row cannot answer it. */
export function overlayValue(overlay: TrackOverlay, row: TrackRowFacts): number | null {
  switch (overlay) {
    case 'target_speed':
      return row.polar_efficiency
    case 'target_vmg':
      return row.vmg_efficiency
    case 'sog':
      return row.sog
    case 'tws':
      return row.tws
    case 'twa':
      return row.twa
    case 'sail':
      // Categorical: there is no number to band. `overlayPaint` reads the verdict itself.
      return null
  }
}

/**
 * Whether an overlay is a *ratio* — a percent of something the Polar says.
 *
 * Only these two can be **Filler-Anchored**, because that flag is a property of the comparison
 * (ADR 0036), and only these two carry a percentage for the legend to talk about.
 */
export function isRatioOverlay(overlay: TrackOverlay): boolean {
  return overlay === 'target_speed' || overlay === 'target_vmg'
}

/**
 * Which rows an overlay may colour at all (ADR 0025, ADR 0037).
 *
 * `countable` is the performance-metric gate: not **Frozen**, not **Low-Speed**, not inside a
 * **Maneuver Window**. The two ratios need it, and so does sail agreement — a manoeuvre's `TWA`
 * sweeps through head to wind, so the chart's recommendation mid-tack is an answer to a question
 * nobody asked, and **Cell Agreement** is counted over Countable rows for the same reason
 * (ADR 0030). The four channel overlays need only a live feed, because a parked boat's speed over
 * the ground is simply what the GPS recorded.
 */
export function overlayGate(overlay: TrackOverlay): 'countable' | 'feed-alive' {
  return isRatioOverlay(overlay) || overlay === 'sail' ? 'countable' : 'feed-alive'
}

/**
 * The seven-band diverging ramp, centred on 100% (ADR 0033).
 *
 * Shared by both ratio overlays rather than copied, because percent of Target Speed and percent of
 * Target VMG are the same shape of question and must not read on two different scales on one
 * screen.
 */
const RATIO_BANDS: readonly TrackBandStep[] = [
  { band: 'track-below-3', below: 0.85, tick: '<85', label: 'below 85% of target' },
  { band: 'track-below-2', below: 0.95, tick: '85', label: '85–95% of target' },
  { band: 'track-below-1', below: 0.98, tick: '95', label: '95–98% of target' },
  { band: 'track-at', below: 1.02, tick: '98', label: 'on target, 98–102%' },
  { band: 'track-above-1', below: 1.05, tick: '102', label: '102–105% of target' },
  { band: 'track-above-2', below: 1.15, tick: '105', label: '105–115% of target' },
  { band: 'track-above-3', below: Infinity, tick: '115+', label: 'above 115% of target' },
]

/** The sentence a diverging ramp owes after dark, where both arms land on the same red. */
const RATIO_NIGHT =
  'After dark: depth is distance from target, either way — which side comes from the figures, not ' +
  'the colour.'

/**
 * Boat speed, in knots, on a single-hue ramp.
 *
 * The edges are this boat's own range rather than a generic one: a 4.5-knot beat in light air and
 * a 7.5-knot reach are the two ends of what Handsome Pete does, and a ramp stretched to 20 knots
 * would draw every race the same colour.
 */
const SOG_BANDS: readonly TrackBandStep[] = [
  { band: 'track-speed-1', below: 3, tick: '<3', label: 'under 3 knots' },
  { band: 'track-speed-2', below: 4.5, tick: '3', label: '3–4.5 knots' },
  { band: 'track-speed-3', below: 6, tick: '4.5', label: '4.5–6 knots' },
  { band: 'track-speed-4', below: 7.5, tick: '6', label: '6–7.5 knots' },
  { band: 'track-speed-5', below: Infinity, tick: '7.5+', label: 'over 7.5 knots' },
]

/**
 * True wind speed, on the wind-condition bands — read off `WIND_THRESHOLDS` rather than restated.
 *
 * The thresholds are inclusive upper bounds there (light is 0–8), so each `below` is one past its
 * own band's top. Two copies of 8 and 15 would be two chances for the dashboard's wind card and
 * this map to disagree about what medium air is.
 */
const TWS_BANDS: readonly TrackBandStep[] = [
  { band: 'wind-light', below: WIND_THRESHOLDS.LIGHT_MAX + 1, tick: '0', label: 'light air, 0–8 kt' },
  {
    band: 'wind-medium',
    below: WIND_THRESHOLDS.MEDIUM_MAX + 1,
    tick: '9',
    label: 'medium air, 9–15 kt',
  },
  {
    band: 'wind-heavy',
    below: WIND_THRESHOLDS.HEAVY_MAX + 1,
    tick: '16',
    label: 'heavy air, 16–22 kt',
  },
  { band: 'wind-storm', below: Infinity, tick: '23+', label: 'storm, 23 kt and up' },
]

/**
 * True wind angle: the tack by hue, and how far off the wind by depth.
 *
 * Signed as the recording wrote it (ADR 0008) — negative to port — so the bands run from deep
 * downwind on port, through close-hauled on both tacks, to deep downwind on starboard. The
 * boundaries are 60° and 120°, which is close-hauled / reaching / running in the glossary's own
 * terms and not `ZONE_BOUNDARY_DEG`: that constant splits upwind from downwind for a *metric*, and
 * this is a picture of what the boat was doing.
 */
const TWA_BANDS: readonly TrackBandStep[] = [
  { band: 'track-port-3', below: -120, tick: '-180', label: 'running, port tack' },
  { band: 'track-port-2', below: -60, tick: '-120', label: 'reaching, port tack' },
  { band: 'track-port-1', below: 0, tick: '-60', label: 'close-hauled, port tack' },
  { band: 'track-stbd-1', below: 60, tick: '0', label: 'close-hauled, starboard tack' },
  { band: 'track-stbd-2', below: 120, tick: '60', label: 'reaching, starboard tack' },
  { band: 'track-stbd-3', below: Infinity, tick: '120', label: 'running, starboard tack' },
]

/**
 * Sail chart agreement: did what was flying match what the chart called for?
 *
 * Two values, so two bands — this is the one categorical overlay, and its "scale" is a pair rather
 * than a ramp. Green for agreement and red for a difference, which is the one place on this screen
 * those two conventional hues mean what everyone expects them to.
 *
 * A difference is **not a fault**, and the legend says so: a boat carrying the A2 through a lull
 * the chart would have reefed for is a decision somebody made on the water, often a good one. What
 * the overlay answers is *where the two records differ*, which is a question about the chart as much
 * as about the sailing.
 *
 * The bands are read off the verdict rather than off a number, so `below` is unused here — a
 * categorical quantity has no edges. `overlayPaint` reads `sail_agreement` directly for this one.
 */
const SAIL_BANDS: readonly TrackBandStep[] = [
  { band: 'track-agree', below: Infinity, tick: 'agreed', label: 'what was up matches the chart' },
  { band: 'track-differ', below: Infinity, tick: 'differed', label: 'the two records differ' },
]

export const TRACK_SCALES: Record<TrackOverlay, TrackScale> = {
  target_speed: {
    overlay: 'target_speed',
    chip: '% of target',
    title: 'Percent of Target Speed',
    unit: null,
    kind: 'diverging',
    bands: RATIO_BANDS,
    day: 'slower than target · 100% · faster',
    night: RATIO_NIGHT,
  },
  target_vmg: {
    overlay: 'target_vmg',
    chip: '% of VMG',
    title: 'Percent of Target VMG',
    unit: null,
    kind: 'diverging',
    bands: RATIO_BANDS,
    day: 'worse VMG · 100% · better',
    night: RATIO_NIGHT,
    // ADR 0036's standing caveat, not conditional on anything: a rectangular grid cannot hold an
    // optimum that moves with wind speed, so this is an estimate of the certificate's answer and
    // never a reproduction of it. Layline states no point beat or gybe angle, ever.
    caveat: 'Target VMG is estimated from the grid, not the certificate’s published optimum.',
  },
  sog: {
    overlay: 'sog',
    chip: 'Boat speed',
    title: 'Speed over the ground (SOG)',
    unit: 'kt',
    kind: 'sequential',
    bands: SOG_BANDS,
    day: 'slower · faster, by the GPS’s own figure',
    night: 'After dark: deeper is faster. One hue in, one out.',
  },
  tws: {
    overlay: 'tws',
    chip: 'Wind speed',
    title: 'True wind speed (TWS)',
    unit: 'kt',
    kind: 'sequential',
    bands: TWS_BANDS,
    day: 'light · medium · heavy · storm',
    night: 'After dark: depth is wind speed, in the same four bands.',
    // ADR 0008: every wind figure in a recording is Computed by qtVlm from a solved current and a
    // wind-instrument altitude, none of which appear in the export. Not a masthead reading.
    caveat: 'Wind figures are computed by qtVlm, not read off the masthead.',
  },
  twa: {
    overlay: 'twa',
    chip: 'Wind angle',
    title: 'True wind angle (TWA)',
    unit: '°',
    kind: 'tack',
    bands: TWA_BANDS,
    day: 'port · close-hauled · starboard; depth is how far off the wind',
    night:
      'After dark the two tacks are the same colour: depth is how far off the wind, and the tack ' +
      'comes from the figures.',
    caveat: 'Wind figures are computed by qtVlm, not read off the masthead.',
  },
  sail: {
    overlay: 'sail',
    chip: 'Sail vs chart',
    title: 'Sails flown vs the Crossover Chart',
    unit: null,
    kind: 'categorical',
    bands: SAIL_BANDS,
    day: 'green agrees with the chart · red differs — a difference, not a fault',
    night: 'After dark: the brighter stretches are where the two records differ.',
  },
}

/** Every overlay, in the order the chips are drawn: the two measurements first, then the record. */
export const TRACK_OVERLAYS: readonly TrackOverlay[] = [
  'target_speed',
  'target_vmg',
  'sail',
  'sog',
  'tws',
  'twa',
]

/** A band as the colour to draw it in. A token, never a hex, so the theme stays in charge. */
export function overlayColour(band: TrackBandToken): string {
  return `var(--${band})`
}

/** Which step of a scale a value lands in. The upper edge of each step belongs to the next. */
export function overlayBand(overlay: TrackOverlay, value: number): TrackBandToken {
  const { bands } = TRACK_SCALES[overlay]
  return (bands.find((step) => value < step.below) ?? bands[bands.length - 1]).band
}

/**
 * How one row is drawn on one overlay: its band, or the reason it has none.
 *
 * `hasPolar` is a fact about the **Race** and not about the row — a race that records no **Polar
 * Version** has nothing for a ratio to be a ratio of, and nine of this archive's races are like
 * that. It is passed in rather than inferred from a null percentage, because "nobody wrote down
 * which Polar this was sailed under" and "the Polar cannot answer at this angle" are different
 * sentences and the legend says them differently.
 */
export function overlayPaint(
  overlay: TrackOverlay,
  row: TrackRowFacts,
  hasPolar: boolean
): TrackPaint {
  const unscored = (not_scored: TrackNotScored): TrackPaint => ({
    band: null,
    not_scored,
    flagged: false,
  })

  // The one exclusion every overlay keeps: a Frozen row's values are the row above's, verbatim.
  if (row.excluded === 'frozen') return unscored('frozen')

  if (overlayGate(overlay) === 'countable') {
    // ADR 0025's rule in full, for the overlays that are claims about how the boat was sailed.
    if (row.excluded !== null) return unscored(row.excluded)
  }

  if (isRatioOverlay(overlay) && !hasPolar) return unscored('no_polar_version')

  if (overlay === 'sail') {
    // Categorical, and decided on the server against the Race's own chart Version (ADR 0023): the
    // verdict is read, never recomputed here, and its four "no verdict" members are reasons in
    // their own right.
    if (row.sail_agreement === 'agrees') {
      return { band: 'track-agree', not_scored: null, flagged: false }
    }
    if (row.sail_agreement === 'differs') {
      return { band: 'track-differ', not_scored: null, flagged: false }
    }
    return unscored(row.sail_agreement)
  }

  const value = overlayValue(overlay, row)

  // `Number.isFinite` rather than a null check alone: a value that arrived as `NaN` would fail
  // every band's upper bound and fall out of the scale as its *last* step, which is the worst
  // available answer to "this cannot be computed".
  if (value === null || !Number.isFinite(value)) {
    return unscored(isRatioOverlay(overlay) ? 'no_target' : 'no_reading')
  }

  return {
    band: overlayBand(overlay, value),
    not_scored: null,
    // Only a ratio can be Filler-Anchored: it is a property of the comparison, not of the reading.
    flagged: isRatioOverlay(overlay) && row.filler_anchored,
  }
}

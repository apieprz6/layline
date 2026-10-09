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
export type TrackScaleKind = 'diverging' | 'sequential' | 'tack' | 'quadrant'

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
    case 'cog':
      return row.cog
  }
}

/** Whether an overlay is a performance metric, which is what decides its row gate (ADR 0025). */
export function isRatioOverlay(overlay: TrackOverlay): boolean {
  return overlay === 'target_speed' || overlay === 'target_vmg'
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
  'After dark this scale is depth, not side: the deeper the band, the further from target — in ' +
  'either direction. Which side a stretch was on comes from the figures under the map, not from ' +
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
 * Course over the ground, as four compass quadrants.
 *
 * Deliberately coarse. A heading is cyclic, and a cyclic quantity needs a palette whose ends meet
 * — which the design system does not have, and which could not survive `.theme-nightvision`
 * anyway, since four quadrants are the most one red depth ramp can keep apart. So the overlay
 * states quadrants and the legend says that is what it is, rather than drawing 360 degrees of hue
 * and letting the sailor believe the colour is a bearing.
 *
 * North straddles 0°, so it is checked by its two halves and the walk starts at 45°.
 */
const COG_BANDS: readonly TrackBandStep[] = [
  { band: 'track-cog-n', below: 45, tick: '0', label: 'northerly, 315–45°' },
  { band: 'track-cog-e', below: 135, tick: '45', label: 'easterly, 45–135°' },
  { band: 'track-cog-s', below: 225, tick: '135', label: 'southerly, 135–225°' },
  { band: 'track-cog-w', below: 315, tick: '225', label: 'westerly, 225–315°' },
  { band: 'track-cog-n', below: Infinity, tick: '315', label: 'northerly, 315–45°' },
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
    day: 'worse VMG than target · 100% · better',
    night: RATIO_NIGHT,
    // ADR 0036's standing caveat, not conditional on anything: a rectangular grid cannot hold an
    // optimum that moves with wind speed, so this is an estimate of the certificate's answer and
    // never a reproduction of it. Layline states no point beat or gybe angle, ever.
    caveat:
      'Target VMG is estimated from the Polar’s grid, not the certificate’s own published optimum.',
  },
  sog: {
    overlay: 'sog',
    chip: 'Boat speed',
    title: 'Speed over the ground (SOG)',
    unit: 'kt',
    kind: 'sequential',
    bands: SOG_BANDS,
    day: 'slower · faster. The GPS’s own figure, not the paddlewheel’s.',
    night: 'One hue in, one out: after dark the deeper the band, the faster the boat.',
  },
  tws: {
    overlay: 'tws',
    chip: 'Wind speed',
    title: 'True wind speed (TWS)',
    unit: 'kt',
    kind: 'sequential',
    bands: TWS_BANDS,
    day: 'light · medium · heavy · storm, in Layline’s own wind bands.',
    night: 'Depth is wind speed after dark, in the same four bands.',
    // ADR 0008: every wind figure in a recording is Computed by qtVlm from a solved current and a
    // wind-instrument altitude, none of which appear in the export. Not a masthead reading.
    caveat:
      'Every wind figure here was computed by qtVlm from the boat’s instruments, not read off the masthead.',
  },
  twa: {
    overlay: 'twa',
    chip: 'Wind angle',
    title: 'True wind angle (TWA)',
    unit: '°',
    kind: 'tack',
    bands: TWA_BANDS,
    day: 'port tack · close-hauled · starboard tack. Depth is how far off the wind.',
    night:
      'After dark the two tacks are the same colour: depth is how far off the wind, and which ' +
      'tack a stretch was on comes from the figures under the map.',
    caveat:
      'Every wind figure here was computed by qtVlm from the boat’s instruments, not read off the masthead.',
  },
  cog: {
    overlay: 'cog',
    chip: 'Course',
    title: 'Course over the ground (COG)',
    unit: '°',
    kind: 'quadrant',
    bands: COG_BANDS,
    day: 'Four quadrants, not a bearing: north, east, south, west.',
    night: 'The same four quadrants, by depth rather than by hue.',
  },
}

/** Every overlay, in the order the chips are drawn: the two measurements first, then the record. */
export const TRACK_OVERLAYS: readonly TrackOverlay[] = [
  'target_speed',
  'target_vmg',
  'sog',
  'tws',
  'twa',
  'cog',
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

  if (isRatioOverlay(overlay)) {
    // A performance metric, so ADR 0025's rule applies in full.
    if (row.excluded !== null) return unscored(row.excluded)
    if (!hasPolar) return unscored('no_polar_version')
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

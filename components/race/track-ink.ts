/**
 * The **Race Track Heatmap**'s ink, in one place.
 *
 * Shared by the map and the legend beneath it for the reason `TRACK_BANDS` is shared: the swatch a
 * sailor is shown must not be able to drift from the thing it claims to explain. A legend drawing
 * its own idea of a hairline is a legend that can quietly stop matching the track.
 *
 * Widths and radii are frame units at 1×; the map divides the zoom back out of anything that is
 * not geography, and the legend draws them as-is.
 */

/** The coloured track: one stroke per row transition. */
export const TRACK_STROKE = 3.2

/** Drawn, not scored — geometry with no claim on it, under the coloured track. */
export const HAIRLINE = { stroke: 'var(--text-muted)', width: 1, opacity: 0.5 } as const

/**
 * **Filler-Anchored**: the same band colour, stitched.
 *
 * A texture rather than a second hue, because after dark there is no second hue to mark anything
 * with — and because it costs no extra ink on a track made of a thousand segments.
 */
export const FILLER_DASH = '2.5 2'

/** A **Dropout**: the ring on the repeated fix, and the dashed bridge across the gap. */
export const DROPOUT = {
  stroke: 'var(--wind-storm)',
  ringRadius: 3.4,
  ringWidth: 1,
  ringOpacity: 0.6,
  bridgeDash: '4 4',
  bridgeWidth: 1,
  bridgeOpacity: 0.5,
} as const

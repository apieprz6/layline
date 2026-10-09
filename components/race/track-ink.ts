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

/**
 * The coloured track: one stroke per row transition.
 *
 * Fat on purpose. At 3.2 this read as a thin line whose colour a sailor had to squint at, which
 * defeats the one thing the map exists for — finding which side of target a stretch of water sat
 * on *without* reading a number. A heatmap's ink is its message, so the stroke is wide enough to
 * carry a hue at a glance, and the frame divides nothing out of it: `non-scaling-stroke` keeps it
 * this wide on screen however far the sailor zooms, because zooming in is for separating the
 * segments rather than fattening them.
 */
export const TRACK_STROKE = 5.4

/** Drawn, not scored — geometry with no claim on it, under the coloured track. */
export const HAIRLINE = { stroke: 'var(--text-muted)', width: 1.6, opacity: 0.55 } as const

/**
 * **Filler-Anchored**: the same band colour, stitched.
 *
 * A texture rather than a second hue, because after dark there is no second hue to mark anything
 * with — and because it costs no extra ink on a track made of a thousand segments. The dash is
 * proportioned to the stroke: on a 5.4-wide line a 2.5/2 pattern read as beads rather than as a
 * stitched version of the same line.
 */
export const FILLER_DASH = '4.5 2.5'

/**
 * The stretch being read out: a halo under the track, never a recolour of it.
 *
 * Recolouring the selection would take away the one thing the sailor tapped to find out — which
 * band that stretch is — so selection is drawn as extra width underneath in the accent, and the
 * band stays exactly as it was.
 */
export const SELECTION = { stroke: 'var(--text-accent)', width: 12, opacity: 0.35 } as const

/**
 * **Testimony** on the map: a sail change, a sea state.
 *
 * Deliberately *not* a hue from any overlay's scale. An annotation is neither measured nor computed
 * — it is what the sailor said — and on a screen where six scales already spend every hue the
 * design system has, the only honest way to say "this is a different kind of thing" is to stop
 * using hue for it: a disc in the page's own surface, outlined and glyphed in the text colour.
 *
 * The glyphs are the amend flow's (`components/race-flow/chart-geometry.ts`): `S` for a sail, `~`
 * for the water. Same vocabulary on both screens, because it is the same Testimony.
 */
export const TESTIMONY = {
  radius: 7,
  fill: 'var(--surface-raised)',
  stroke: 'var(--text-primary)',
  width: 1.2,
  glyph: 'var(--text-primary)',
} as const

/** One character, because a marker is a few pixels across on a 390px phone. */
export function testimonyGlyph(lane: 'sail' | 'sea'): string {
  return lane === 'sail' ? 'S' : '~'
}

/** A **Dropout**: the ring on the repeated fix, and the dashed bridge across the gap. */
export const DROPOUT = {
  stroke: 'var(--wind-storm)',
  ringRadius: 4.2,
  ringWidth: 1.2,
  ringOpacity: 0.65,
  bridgeDash: '5 4',
  bridgeWidth: 1.2,
  bridgeOpacity: 0.55,
} as const

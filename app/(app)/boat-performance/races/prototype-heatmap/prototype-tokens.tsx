/**
 * PROTOTYPE — the three ramps as tokens, and what `.theme-nightvision` does to each.
 *
 * This file exists because of a mistake worth keeping: the variants first carried their hexes as
 * literals, and the night-vision screenshots therefore showed a blue-and-amber diverging ramp on a
 * monochromatic red screen. It looked like the diverging scale survived after dark. It doesn't — it
 * had simply escaped the theme, which is the one thing `globals.css` says a chart may not do ("a hue
 * that is not red defeats the whole point of this theme, so after dark the bands separate by depth
 * alone").
 *
 * So the ramps are tokens, and each has a declared night-vision mapping. What the night shots now
 * show is the real consequence of each choice:
 *
 *   - **Diverging (A)** collapses. Both arms have to land on the same red lightness ramp, so 85% and
 *     115% become the same colour and the polarity the whole scale exists to encode is gone.
 *   - **Sequential (B)** survives untouched: one hue in, one hue out, the order preserved.
 *   - **Two poles (C)** survive too, and this is the non-obvious one — two poles need only two
 *     steps, and one hue has two steps to spare. Sign is kept by depth; magnitude was never in the
 *     colour to begin with, it was in the radius.
 *
 * Day values were validated with `scripts/validate_palette.js --ordinal` against `#F0EDE6`; night
 * values against `#0A0000`.
 */

import type { ReactElement } from 'react'

/** The daylight ramps. Each arm is a single hue; the diverging midpoint is a neutral gray. */
const DAY = {
  // Diverging: amber below, blue above. Not the conventional red/blue, because `TrackMap` already
  // rings Frozen rows in `--wind-storm` red and a red arm would collide with it on the same map.
  'proto-below-3': '#8A4D00',
  'proto-below-2': '#C47000',
  'proto-below-1': '#D68A2E',
  'proto-at': '#8F887E',
  'proto-above-1': '#5C93E0',
  'proto-above-2': '#0055BB',
  'proto-above-3': '#002277',
  // Sequential: one hue, light to dark, compressed into the darker half because the sand surface is
  // pale enough that a true 100-step reads as paper.
  'proto-seq-1': '#7FA8E4',
  'proto-seq-2': '#4A86DB',
  'proto-seq-3': '#0055BB',
  'proto-seq-4': '#003399',
  'proto-seq-5': '#002277',
  // Two poles.
  'proto-slow': '#C47000',
  'proto-fast': '#0055BB',
} as const

/**
 * The same tokens after dark. Every hue collapses to a red lightness ramp, which is the theme's
 * whole proposition and not a limitation to design around.
 */
const NIGHT = {
  // Symmetric by construction, because there is only one hue to be symmetric in. This is the
  // collision, drawn rather than argued about.
  'proto-below-3': '#8E0000',
  'proto-below-2': '#C00000',
  'proto-below-1': '#E82626',
  'proto-at': '#FFB3B3',
  'proto-above-1': '#E82626',
  'proto-above-2': '#C00000',
  'proto-above-3': '#8E0000',
  // Monotone in, monotone out.
  'proto-seq-1': '#FFB3B3',
  'proto-seq-2': '#FF6B6B',
  'proto-seq-3': '#E82626',
  'proto-seq-4': '#C00000',
  'proto-seq-5': '#8E0000',
  // Two steps is all two poles ever needed.
  'proto-slow': '#FF6B6B',
  'proto-fast': '#A50000',
} as const

export type ProtoToken = keyof typeof DAY

/** `var(--proto-…)`, so a variant never names a hex and the theme is always in charge. */
export function token(name: ProtoToken): string {
  return `var(--${name})`
}

function declare(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, hex]) => `--${name}: ${hex};`)
    .join(' ')
}

/** Injected once by the page. Scoped to the prototype; nothing here leaks into the design system. */
export function PrototypeTokens(): ReactElement {
  return (
    <style>{`:root { ${declare(DAY)} } .theme-nightvision { ${declare(NIGHT)} }`}</style>
  )
}

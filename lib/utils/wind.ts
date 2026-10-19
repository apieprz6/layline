/**
 * Wind utility functions for Layline
 * Defines wind condition classifications and color mappings
 */

import { tint } from '@/lib/utils/design'

export interface WindCondition {
  color: string
  bg: string
  border: string
  label: string
}

/**
 * Wind condition thresholds in knots
 * Exported as constants to ensure consistency across the application
 */
export const WIND_THRESHOLDS = {
  LIGHT_MAX: 8,
  MEDIUM_MAX: 15,
  HEAVY_MAX: 22,
} as const

/**
 * The colour of each wind band, as its token
 *
 * The one source of what each band looks like. Tokens, not hex: `.theme-nightvision` overrides
 * the token, so a literal here would stay daylight-coloured after dark. In SVG, pass these
 * through `style` (`style={{ stroke }}`), not a presentation attribute.
 */
export const WIND_COLORS = {
  LIGHT: 'var(--wind-light)',
  MEDIUM: 'var(--wind-medium)',
  HEAVY: 'var(--wind-heavy)',
  STORM: 'var(--wind-storm)',
} as const

/**
 * Get the wind band colour for a speed in knots
 *
 * @param kts - Wind speed in knots
 * @returns The band's `var(--wind-*)` token
 */
export function getWindColor(kts: number): string {
  return windBand(kts).color
}

/** Each band's upper bound, colour and name, lightest first; storm has no upper bound. */
const WIND_BANDS = [
  { max: WIND_THRESHOLDS.LIGHT_MAX, color: WIND_COLORS.LIGHT, label: 'Light' },
  { max: WIND_THRESHOLDS.MEDIUM_MAX, color: WIND_COLORS.MEDIUM, label: 'Medium' },
  { max: WIND_THRESHOLDS.HEAVY_MAX, color: WIND_COLORS.HEAVY, label: 'Heavy' },
  { max: Infinity, color: WIND_COLORS.STORM, label: 'Storm' },
] as const

function windBand(kts: number): (typeof WIND_BANDS)[number] {
  return WIND_BANDS.find((band) => kts <= band.max) ?? WIND_BANDS[WIND_BANDS.length - 1]
}

/**
 * Get wind condition classification based on wind speed in knots
 * Uses CSS variables from globals.css design system
 *
 * @param kts - Wind speed in knots
 * @returns WindCondition object with color (CSS variable), bg and border (tints of it), and label
 *
 * Classification ranges:
 * - Light: 0-8 kts
 * - Medium: 9-15 kts
 * - Heavy: 16-22 kts
 * - Storm: 23+ kts
 */
export function getWindCondition(kts: number): WindCondition {
  const { color, label } = windBand(kts)
  return { color, bg: tint(color, 10), border: tint(color, 40), label }
}

/**
 * Get a human-readable compass direction from degrees
 * @param deg - Direction in degrees (0-360)
 * @returns Compass direction string (N, NE, E, SE, S, SW, W, NW)
 */
export function getCompassDirection(deg: number): string {
  if (deg >= 337.5 || deg < 22.5) return 'N'
  if (deg < 67.5) return 'NE'
  if (deg < 112.5) return 'E'
  if (deg < 157.5) return 'SE'
  if (deg < 202.5) return 'S'
  if (deg < 247.5) return 'SW'
  if (deg < 292.5) return 'W'
  return 'NW'
}

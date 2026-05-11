/**
 * Wind utility functions for Layline
 * Defines wind condition classifications and color mappings
 */

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
 * Hex color values for wind conditions
 * Used when CSS variables cannot be applied (e.g., SVG fills)
 */
export const WIND_COLORS_HEX = {
  LIGHT: '#007A52',
  MEDIUM: '#0055BB',
  HEAVY: '#C47000',
  STORM: '#CC1100',
} as const

/**
 * Get wind condition classification based on wind speed in knots
 * Uses CSS variables from globals.css design system
 *
 * @param kts - Wind speed in knots
 * @returns WindCondition object with color (CSS variable), bg, border, and label
 *
 * Classification ranges:
 * - Light: 0-8 kts
 * - Medium: 9-15 kts
 * - Heavy: 16-22 kts
 * - Storm: 23+ kts
 */
export function getWindCondition(kts: number): WindCondition {
  if (kts <= WIND_THRESHOLDS.LIGHT_MAX) {
    return {
      color: 'var(--wind-light)',
      bg: 'rgba(0, 122, 82, 0.1)',
      border: 'rgba(0, 122, 82, 0.4)',
      label: 'Light',
    }
  }
  if (kts <= WIND_THRESHOLDS.MEDIUM_MAX) {
    return {
      color: 'var(--wind-medium)',
      bg: 'rgba(0, 85, 187, 0.1)',
      border: 'rgba(0, 85, 187, 0.4)',
      label: 'Medium',
    }
  }
  if (kts <= WIND_THRESHOLDS.HEAVY_MAX) {
    return {
      color: 'var(--wind-heavy)',
      bg: 'rgba(196, 112, 0, 0.1)',
      border: 'rgba(196, 112, 0, 0.4)',
      label: 'Heavy',
    }
  }
  return {
    color: 'var(--wind-storm)',
    bg: 'rgba(204, 17, 0, 0.1)',
    border: 'rgba(204, 17, 0, 0.4)',
    label: 'Storm',
  }
}

/**
 * Get wind condition hex color (for contexts where CSS variables cannot be used)
 * Use this variant for SVG fills, canvas rendering, or external libraries
 *
 * @param kts - Wind speed in knots
 * @returns Hex color string
 */
export function getWindColorHex(kts: number): string {
  if (kts <= WIND_THRESHOLDS.LIGHT_MAX) return WIND_COLORS_HEX.LIGHT
  if (kts <= WIND_THRESHOLDS.MEDIUM_MAX) return WIND_COLORS_HEX.MEDIUM
  if (kts <= WIND_THRESHOLDS.HEAVY_MAX) return WIND_COLORS_HEX.HEAVY
  return WIND_COLORS_HEX.STORM
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

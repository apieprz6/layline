/**
 * Design token utility helpers
 * Enforces usage of design system tokens from globals.css
 */

/**
 * Spacing units available in the design system
 * Maps to --space-* CSS variables
 */
export type SpacingUnit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24

/**
 * Border radius sizes available in the design system
 * Maps to --radius-* CSS variables
 */
export type RadiusSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'

/**
 * Shadow/elevation levels available in the design system
 * Maps to --shadow-* CSS variables
 */
export type ShadowLevel = 'sm' | 'md' | 'lg' | 'xl' | 'cyan' | 'cyan-strong'

/**
 * Get CSS variable reference for spacing
 * @param unit - Spacing unit (0-24)
 * @returns CSS variable string
 *
 * @example
 * spacing(4) // 'var(--space-4)' → 16px
 * spacing(2) // 'var(--space-2)' → 8px
 */
export function spacing(unit: SpacingUnit): string {
  return `var(--space-${unit})`
}

/**
 * Get CSS variable reference for border radius
 * @param size - Radius size keyword
 * @returns CSS variable string
 *
 * @example
 * radius('md') // 'var(--radius-md)' → 8px
 * radius('full') // 'var(--radius-full)' → 9999px
 */
export function radius(size: RadiusSize): string {
  return `var(--radius-${size})`
}

/**
 * Get CSS variable reference for shadow/elevation
 * @param level - Shadow level keyword
 * @returns CSS variable string
 *
 * @example
 * shadow('md') // 'var(--shadow-md)' → 0 2px 8px rgba(0, 0, 0, 0.12)
 * shadow('cyan') // 'var(--shadow-cyan)' → 0 0 12px rgba(0, 68, 204, 0.15)
 */
export function shadow(level: ShadowLevel): string {
  return `var(--shadow-${level})`
}

/**
 * Combine multiple spacing values into a shorthand string
 * Useful for padding/margin with different values per side
 *
 * @param values - 1-4 spacing units (top, right, bottom, left)
 * @returns Space-separated CSS variable string
 *
 * @example
 * spacingShorthand(4, 3) // 'var(--space-4) var(--space-3)'
 * spacingShorthand(2, 4, 2, 4) // 'var(--space-2) var(--space-4) var(--space-2) var(--space-4)'
 */
export function spacingShorthand(...values: SpacingUnit[]): string {
  if (values.length === 0 || values.length > 4) {
    throw new Error('spacingShorthand requires 1-4 spacing values')
  }
  return values.map((v) => spacing(v)).join(' ')
}

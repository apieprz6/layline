import type { CSSProperties } from 'react'

/**
 * The small uppercase label that sits above the thing it names: a section's own
 * name, or a field's.
 *
 * One constant rather than one per site, so a section heading and a form label are
 * the same size and the same colour *by construction* — the LAY-95 prototype's
 * `Label` primitive, which every screen in it used for exactly this.
 *
 * A style object and not a component: some of these are a `<div>` over a heading and
 * some are a `<label htmlFor>`, and a component taking an `as` prop to cover both
 * would be more machinery than the six properties are worth.
 */
export const EYEBROW_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '4px',
}

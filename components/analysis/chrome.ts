/**
 * The geometry the analysis screens share: a pill, and a note under something.
 *
 * Both were written three times over before this module existed, and the notes had already drifted
 * — one at `lineHeight: 1.45` and one at `1.5`, under controls a sailor sees side by side. That is
 * the same failure `services/analysis/figures.ts` prevents for numbers, so it gets the same
 * treatment: one definition, and each site overrides only what it actually means to differ on.
 *
 * Style objects and not components, for the reason `components/common/eyebrow.ts` gives: these
 * dress a `<button>` here and a `<p>` there, and a component taking an `as` prop to cover both
 * would be more machinery than the properties are worth.
 */

import type { CSSProperties } from 'react'
import { radius } from '@/lib/utils/design'

/**
 * A tappable pill: a rail chip, a bucket chip, the way back to the whole archive.
 *
 * Border is written longhand throughout. Mixing `border` with `borderStyle` makes React warn, and
 * the two disagree on re-render in whichever order they were written — which is how a dashed
 * record-bucket chip came out solid after a tap.
 */
export const PILL_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '7px 11px',
  borderRadius: radius('full'),
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--surface-border)',
  background: 'var(--surface-raised)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

/** A sentence under a control or a figure, saying what it rests on. */
export const NOTE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  lineHeight: 1.5,
  color: 'var(--text-muted)',
}

/** A count beside a label, in the mono face every other figure in Layline uses. */
export const PILL_COUNT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  opacity: 0.75,
}

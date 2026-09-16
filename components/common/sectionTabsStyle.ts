import type { CSSProperties } from 'react'
import { spacing } from '@/lib/utils/design'

/**
 * The geometry of a section's header, held apart from the component that draws it.
 *
 * Two things render this header: `SectionTabs`, which is interactive, and
 * `SectionTabsChrome`, which is the same header with nothing behind it yet on a
 * `loading.tsx`. The skeleton's whole job is that nothing moves when the real
 * section replaces it, so the two cannot each carry their own copy of these numbers
 * — a 16px that drifted to 17px in one of them is a visible jump on every
 * navigation into the section.
 */

export const SECTION_TABS_HEADER_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  borderBottom: '1px solid var(--surface-border)',
  padding: `${spacing(4)} ${spacing(4)} 0`,
}

export const SECTION_TABS_TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '16px',
  fontWeight: 'var(--weight-bold)',
  color: 'var(--text-primary)',
  marginBottom: spacing(3),
}

export const SECTION_TABS_LIST_STYLE: CSSProperties = { display: 'flex', gap: 0 }

/**
 * One tab. Everything that decides the strip's *height* lives here; the interactive
 * version adds only the cursor and the transition on top, so a `<span>` placeholder
 * and a `<button>` occupy the same box.
 */
export function sectionTabStyle(isActive: boolean): CSSProperties {
  return {
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
    padding: '7px 0',
    textAlign: 'center',
    fontFamily: 'var(--font-body)',
    fontSize: '11px',
    fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-regular)',
    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
    letterSpacing: '0.01em',
  }
}

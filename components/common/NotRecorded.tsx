import type { ReactElement } from 'react'

/**
 * A value that is **absent**, drawn so it cannot be read as one.
 *
 * Hatched, dashed and italic — obviously-not-a-value geometry rather than a zero, a
 * dash or a skeleton. Each of those three would lie in its own way: a zero reads as
 * a measurement (`wind_direction ?? 0` in `services/buoys/ndbc.ts` is exactly that
 * mistake), a dash reads as a value withheld, and a skeleton promises something
 * arriving in a moment when nothing is coming.
 *
 * ADR 0012 requires "not recorded" to render as a legitimate answer, visibly
 * distinct from any recorded value; the shape is the one the LAY-95 prototype
 * settled on. A Server Component: nothing about an absence is interactive.
 */
export default function NotRecorded(): ReactElement {
  return (
    <span
      data-testid="not-recorded"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        // The hatch is a token and not the prototype's literal `rgba(0,0,0,0.045)`,
        // which is black on the night-vision theme's near-black surface: the one
        // geometry that must never be invisible, gone in the dark, which is when a
        // sailor is most likely to be reading it.
        background:
          'repeating-linear-gradient(135deg, var(--surface-divider) 0 4px, transparent 4px 8px)',
        border: '1px dashed var(--surface-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 6px',
      }}
    >
      Not recorded
    </span>
  )
}

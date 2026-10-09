/**
 * PROTOTYPE (LAY-165) — the floating switcher. Deliberately ugly: it is not part of the design.
 *
 * `←`/`→` cycle the variant, `↑`/`↓` the view. Both are mirrored into the URL so a screenshot and a
 * link agree about what is on screen.
 */

'use client'

import { useEffect, type ReactElement } from 'react'

export const VARIANTS = ['A', 'B', 'C'] as const
export type Variant = (typeof VARIANTS)[number]

export const VIEWS = ['season', 'race', 'teaser'] as const
export type View = (typeof VIEWS)[number]

export default function Switcher({
  variant,
  view,
  names,
  onVariant,
  onView,
}: {
  variant: Variant
  view: View
  names: Record<Variant, string>
  onVariant: (next: Variant) => void
  onView: (next: View) => void
}): ReactElement | null {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      if (
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const step = (list: readonly string[], current: string, by: number): string =>
        list[(list.indexOf(current) + by + list.length) % list.length]

      if (event.key === 'ArrowLeft') onVariant(step(VARIANTS, variant, -1) as Variant)
      if (event.key === 'ArrowRight') onVariant(step(VARIANTS, variant, 1) as Variant)
      if (event.key === 'ArrowUp') onView(step(VIEWS, view, -1) as View)
      if (event.key === 'ArrowDown') onView(step(VIEWS, view, 1) as View)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant, view, onVariant, onView])

  /*
   * No `NODE_ENV` gate here, deliberately, and it is worth saying why: `next start` *is* a
   * production build, and in this environment `next dev` never hydrates (AGENTS.md), so a bar
   * hidden in production is a bar that can never be clicked in the only server that works. The
   * gate is the route instead — `/dev/polar-picture` 404s without `LAYLINE_LAY165=1`, the same way
   * `app/dev/race-track` does — which is a stronger guarantee than hiding one component: a stray
   * merge of this branch leaves the whole page unreachable rather than just the switcher invisible.
   */

  return (
    <div
      data-testid="prototype-switcher"
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        maxWidth: '96vw',
      }}
    >
      <Press label="◀" onPress={() => onVariant(VARIANTS[(VARIANTS.indexOf(variant) + 2) % 3])} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {variant} · {names[variant]}
      </span>
      <Press label="▶" onPress={() => onVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % 3])} />
      <span style={{ opacity: 0.4 }}>|</span>
      {VIEWS.map((entry) => (
        <button
          key={entry}
          type="button"
          data-testid={`view-${entry}`}
          onClick={() => onView(entry)}
          style={{
            padding: '2px 7px',
            borderRadius: 999,
            border: 'none',
            background: view === entry ? '#fff' : 'transparent',
            color: view === entry ? '#111' : '#fff',
            fontFamily: 'inherit',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {entry}
        </button>
      ))}
    </div>
  )
}

function Press({ label, onPress }: { label: string; onPress: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label === '◀' ? 'previous variant' : 'next variant'}
      style={{
        border: 'none',
        background: 'transparent',
        color: '#fff',
        cursor: 'pointer',
        fontSize: 12,
        padding: '2px 4px',
      }}
    >
      {label}
    </button>
  )
}

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, type ReactElement } from 'react'

interface PrototypeSwitcherProps {
  /** Variant keys in cycle order. */
  variants: readonly string[]
  /** Human name per key, shown beside it. */
  names: Readonly<Record<string, string>>
  current: string
  /** Which of the two views is showing — the screen, or the Overall tab it is teased from. */
  view: 'screen' | 'overall'
}

/**
 * PROTOTYPE ONLY — the floating variant bar. Never ships: the whole thing returns `null` in a
 * production build, so a stray merge cannot put it in front of a sailor.
 *
 * `←`/`→` cycle variants, `↑`/`↓` swap view. Arrow keys are ignored while a text field has
 * focus, since a prototype with a filter box in it would otherwise be unusable.
 */
export default function PrototypeSwitcher({
  variants,
  names,
  current,
  view,
}: PrototypeSwitcherProps): ReactElement | null {
  const router = useRouter()
  const params = useSearchParams()

  const goTo = useCallback(
    (variant: string, nextView: 'screen' | 'overall') => {
      const next = new URLSearchParams(params.toString())
      next.set('variant', variant)
      next.set('view', nextView)
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router]
  )

  const step = useCallback(
    (delta: number) => {
      const at = Math.max(0, variants.indexOf(current))
      const next = variants[(at + delta + variants.length) % variants.length]
      goTo(next, view)
    },
    [variants, current, view, goTo]
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        goTo(current, view === 'screen' ? 'overall' : 'screen')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, goTo, current, view])

  // Never ships. A production build has to be *asked* for the bar (`npm run prototype:lay147`),
  // so merging this branch by accident could not put it in front of a sailor — and the bar is
  // still usable from `next start`, which is the only way to review it here, since `next dev`
  // never hydrates in this environment (AGENTS.md).
  const optedIn = process.env.NEXT_PUBLIC_PROTOTYPE_LAY147 === '1'
  if (process.env.NODE_ENV === 'production' && !optedIn) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: '#111',
        color: '#fff',
        borderRadius: 9999,
        padding: '5px 6px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      <button type="button" onClick={() => step(-1)} aria-label="Previous variant" style={ARROW}>
        ‹
      </button>
      {/* Truncates rather than pushing the view toggle off the bar — the longest variant name
          does not fit beside both controls at 390px. */}
      <span
        style={{
          padding: '0 6px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        <strong>{current}</strong> · {names[current] ?? '?'}
      </span>
      <button type="button" onClick={() => step(1)} aria-label="Next variant" style={ARROW}>
        ›
      </button>
      <span style={{ opacity: 0.35 }}>|</span>
      <button
        type="button"
        onClick={() => goTo(current, view === 'screen' ? 'overall' : 'screen')}
        style={{
          ...ARROW,
          width: 'auto',
          padding: '0 9px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          whiteSpace: 'nowrap',
        }}
      >
        {view === 'screen' ? 'see teaser' : 'see screen'}
      </button>
    </div>
  )
}

const ARROW = {
  width: 26,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,0.14)',
  border: 'none',
  borderRadius: 9999,
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  flexShrink: 0,
} as const

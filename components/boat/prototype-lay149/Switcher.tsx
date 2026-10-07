'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, type ReactElement } from 'react'

/**
 * PROTOTYPE ONLY — the floating variant bar. Returns `null` in a production build unless the
 * prototype's own npm script opted in, so a stray merge cannot show it to a sailor.
 * `←`/`→` cycle variants, `↑`/`↓` swap between the screen and the per-Race tile.
 */
export default function Switcher({
  variants,
  names,
  current,
  view,
}: {
  variants: readonly string[]
  names: Readonly<Record<string, string>>
  current: string
  view: 'screen' | 'tile'
}): ReactElement | null {
  const router = useRouter()
  const params = useSearchParams()

  const goTo = useCallback(
    (variant: string, nextView: string) => {
      const next = new URLSearchParams(params.toString())
      next.set('variant', variant)
      next.set('view', nextView)
      next.delete('open')
      router.replace(`?${next.toString()}`, { scroll: false })
    },
    [params, router]
  )

  const step = useCallback(
    (delta: number) => {
      const at = Math.max(0, variants.indexOf(current))
      goTo(variants[(at + delta + variants.length) % variants.length], view)
    },
    [variants, current, view, goTo]
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const t = event.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      // An open sheet owns the arrow keys — its charts step through bins and bands with them.
      if (document.querySelector('[role="dialog"]')) return
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') goTo(current, view === 'screen' ? 'tile' : 'screen')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, goTo, current, view])

  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_PROTOTYPE_LAY149 !== '1') return null

  const btn = { background: 'transparent', border: 'none', color: '#fff', fontSize: 14, padding: '2px 8px', cursor: 'pointer' }
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
        whiteSpace: 'nowrap',
      }}
    >
      <button type="button" aria-label="Previous variant" onClick={() => step(-1)} style={btn}>
        ←
      </button>
      <span>
        {current} ({names[current]})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => step(1)} style={btn}>
        →
      </button>
      <button
        type="button"
        onClick={() => goTo(current, view === 'screen' ? 'tile' : 'screen')}
        style={{ ...btn, fontSize: 10, border: '1px solid #555', borderRadius: 9999 }}
      >
        {view === 'screen' ? 'race tile' : 'season'}
      </button>
    </div>
  )
}

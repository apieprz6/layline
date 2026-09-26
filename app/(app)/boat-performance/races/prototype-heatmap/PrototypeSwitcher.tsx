'use client'

/**
 * PROTOTYPE — the floating switcher. Throwaway.
 *
 * Every knob is a URL, so a screenshot of any state is also a link to it: the variant, the race, and
 * the theme. That matters more than usual here because the night-vision theme is load-bearing for
 * one of the variants' arguments, and "trust me, it looks like this after dark" is not a thing a
 * reviewer should have to accept.
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, type ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { RACE_FILES } from './prototype-races'

const VARIANTS = ['a', 'b', 'c'] as const

export default function PrototypeSwitcher({
  variant,
  theme,
}: {
  variant: string
  theme: string
}): ReactElement {
  const pathname = usePathname()
  const params = useSearchParams()

  const href = (next: Record<string, string>): string => {
    const out = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) out.set(key, value)
    return `${pathname}?${out.toString()}`
  }

  const index = VARIANTS.indexOf(variant as (typeof VARIANTS)[number])

  // The theme is a class on the document, not a wrapper: `.theme-nightvision` re-points the tokens
  // the whole app reads, and a wrapper would leave the chrome outside it in daylight.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-nightvision', theme === 'nightvision')
    return () => root.classList.remove('theme-nightvision')
  }, [theme])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const step = event.key === 'ArrowRight' ? 1 : -1
      const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length]
      window.location.href = href({ variant: next })
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      data-prototype-switcher
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--surface-border)',
        padding: spacing(2),
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        fontSize: 'var(--text-xs)',
      }}
    >
      <div style={{ display: 'flex', gap: spacing(2), alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 9, width: 44 }}>VARIANT</span>
        {VARIANTS.map((candidate) => (
          <Link
            key={candidate}
            href={href({ variant: candidate })}
            style={pill(candidate === variant)}
            data-testid={`variant-${candidate}`}
          >
            {candidate.toUpperCase()}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 9 }}>← →</span>
      </div>

      <div style={{ display: 'flex', gap: spacing(2), alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 9, width: 44 }}>RACE</span>
        {RACE_FILES.map((entry) => (
          <Link key={entry.key} href={href({ race: entry.key })} style={pill(false)}>
            {entry.key}
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: spacing(2), alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 9, width: 44 }}>THEME</span>
        <Link href={href({ theme: 'day' })} style={pill(theme !== 'nightvision')}>
          day
        </Link>
        <Link href={href({ theme: 'nightvision' })} style={pill(theme === 'nightvision')}>
          night vision
        </Link>
      </div>
    </div>
  )
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: `${spacing(1)} ${spacing(3)}`,
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--text-accent)' : 'var(--surface-border)'}`,
    background: active ? 'var(--text-accent)' : 'transparent',
    color: active ? 'var(--text-inverse)' : 'var(--text-primary)',
    textDecoration: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
  }
}

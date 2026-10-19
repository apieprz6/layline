'use client'

/**
 * PROTOTYPE — LAY-191. The floating variant switcher, plus a signed-in / signed-out toggle so
 * both states can be judged. Throwaway.
 *
 * Deliberately ugly and high-contrast so it never reads as part of the design being judged, and
 * gated on the Vercel environment so a stray merge cannot ship it.
 */

import { useEffect } from 'react'
import { VARIANT_KEYS, VARIANT_NAMES, type VariantKey } from './fixture'

export default function PrototypeSwitcher({
  current,
  signedIn,
  onSelect,
  onToggleAuth,
}: {
  current: VariantKey
  signedIn: boolean
  onSelect: (v: VariantKey) => void
  onToggleAuth: () => void
}) {
  const idx = VARIANT_KEYS.indexOf(current)
  const step = (by: number) =>
    onSelect(VARIANT_KEYS[(idx + by + VARIANT_KEYS.length) % VARIANT_KEYS.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const el = document.activeElement
      const tag = el?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (el as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Not NODE_ENV: `next dev` never hydrates here, so the prototype is judged under `next start`.
  // Vercel sets this on its production deployment only; previews and local builds show the bar.
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#111',
        color: '#fff',
        borderRadius: 9999,
        padding: 4,
        boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      <Pill label="Previous variant" onPress={() => step(-1)}>‹</Pill>
      <span
        style={{
          padding: '0 8px',
          whiteSpace: 'nowrap',
          maxWidth: 'calc(100vw - 170px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <strong>{current}</strong> · {VARIANT_NAMES[current]}
      </span>
      <Pill label="Next variant" onPress={() => step(1)}>›</Pill>
      <button
        type="button"
        onClick={onToggleAuth}
        style={{
          marginLeft: 4,
          height: 28,
          padding: '0 10px',
          borderRadius: 9999,
          border: 'none',
          background: signedIn ? '#2a6' : '#a52',
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {signedIn ? 'signed in' : 'signed out'}
      </button>
    </div>
  )
}

function Pill({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      style={{
        width: 28,
        height: 28,
        borderRadius: 9999,
        border: 'none',
        background: '#333',
        color: '#fff',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

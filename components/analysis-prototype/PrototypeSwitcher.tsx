'use client'

/**
 * PROTOTYPE — LAY-144. The floating variant switcher. Throwaway.
 *
 * Deliberately ugly and high-contrast so it never reads as part of the design
 * being judged, and gated on NODE_ENV so a stray merge cannot ship it.
 */

import { useEffect } from 'react'
import { VARIANT_KEYS, type VariantKey } from './model'

export default function PrototypeSwitcher({
  current,
  names,
  onSelect,
}: {
  current: VariantKey
  names: Record<VariantKey, string>
  onSelect: (v: VariantKey) => void
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

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90,
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
      <Arrow label="Previous variant" onPress={() => step(-1)}>
        ‹
      </Arrow>
      <span style={{ padding: '0 10px', whiteSpace: 'nowrap' }}>
        <strong>{current}</strong> · {names[current]}
      </span>
      <Arrow label="Next variant" onPress={() => step(1)}>
        ›
      </Arrow>
    </div>
  )
}

function Arrow({
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

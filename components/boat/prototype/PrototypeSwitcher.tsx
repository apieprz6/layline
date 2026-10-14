'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See ./README.md for the question this answers
 * (LAY-174). Hidden outside development so a stray merge can't ship it. Arrow keys
 * cycle too, unless an input/textarea/contenteditable has focus.
 */

import { useEffect, useState } from 'react'

interface VariantMeta {
  key: string
  name: string
}

interface PrototypeSwitcherProps {
  variants: readonly VariantMeta[]
  current: string
  onChange: (key: string) => void
}

export default function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const [collapsed, setCollapsed] = useState(false)
  const currentIndex = Math.max(0, variants.findIndex((v) => v.key === current))

  function cycle(direction: 1 | -1): void {
    const next = (currentIndex + direction + variants.length) % variants.length
    onChange(variants[next].key)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (typing) return

      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, currentIndex])

  if (process.env.NODE_ENV === 'production') return null

  const activeMeta = variants[currentIndex]

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Show prototype switcher"
        style={pillStyle}
      >
        ▲ {activeMeta?.key}
      </button>
    )
  }

  return (
    <div style={barStyle}>
      <button onClick={() => cycle(-1)} aria-label="Previous variant" style={arrowStyle}>
        ←
      </button>
      <span style={labelStyle}>
        {activeMeta?.key}
        {activeMeta?.name ? ` — ${activeMeta.name}` : ''}
      </span>
      <button onClick={() => cycle(1)} aria-label="Next variant" style={arrowStyle}>
        →
      </button>
      <button onClick={() => setCollapsed(true)} aria-label="Collapse switcher" style={collapseStyle}>
        ▼
      </button>
    </div>
  )
}

const barStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px 8px 14px',
  borderRadius: '999px',
  background: '#111',
  color: '#fff',
  boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  fontFamily: 'var(--font-body)',
  fontSize: '12px',
  fontWeight: 600,
}

const pillStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: '12px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  padding: '6px 12px',
  borderRadius: '999px',
  background: '#111',
  color: '#fff',
  fontFamily: 'var(--font-body)',
  fontSize: '11px',
  fontWeight: 700,
  boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
}

const arrowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  border: 'none',
  color: '#fff',
  width: '26px',
  height: '26px',
  borderRadius: '999px',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: 1,
}

const labelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
}

const collapseStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  fontSize: '10px',
  padding: '0 2px',
}

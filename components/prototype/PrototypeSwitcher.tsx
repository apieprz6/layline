'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See app/prototype/boat/README.md.
 *
 * Floating bottom bar that switches the `?variant=` search param. Arrows wrap,
 * ← and → work on the keyboard unless you are typing in a field, and the whole
 * thing disappears in a production build so a stray deploy shows no harness.
 */

import React, { useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface PrototypeVariant {
  key: string
  name: string
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[]
  current: string
  /** Search param name. Defaults to 'variant'. */
  param?: string
  /** Extra harness controls, rendered above the variant row. */
  extra?: React.ReactNode
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

export default function PrototypeSwitcher({
  variants,
  current,
  param = 'variant',
  extra,
}: PrototypeSwitcherProps): React.ReactElement | null {
  const router = useRouter()
  const searchParams = useSearchParams()
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  )

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length]
      const params = new URLSearchParams(searchParams.toString())
      params.set(param, next.key)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [index, param, router, searchParams, variants]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event.target)) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go])

  if (process.env.NODE_ENV === 'production') return null

  const arrowStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid var(--surface-border-hover)',
    background: 'var(--surface-elevated)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '15px',
    lineHeight: 1,
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        width: 'min(374px, calc(100vw - 16px))',
        background: 'var(--surface-overlay)',
        border: '1px solid var(--surface-border-hover)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        padding: '8px',
        backdropFilter: 'blur(8px)',
      }}
    >
      {extra && <div style={{ marginBottom: '8px' }}>{extra}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => go(-1)} aria-label="Previous variant" style={arrowStyle}>
          ←
        </button>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            variant {variants[index].key} · {index + 1}/{variants.length}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {variants[index].name}
          </div>
        </div>
        <button onClick={() => go(1)} aria-label="Next variant" style={arrowStyle}>
          →
        </button>
      </div>
    </div>
  )
}

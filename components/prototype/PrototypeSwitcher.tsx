'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See the README beside whichever prototype route
 * mounts this.
 *
 * Floating bar that switches the `?variant=` search param. Arrows wrap, ← and →
 * work on the keyboard unless you are typing in a field, and the whole thing
 * disappears in a production build so a stray deploy shows no harness.
 *
 * It starts bottom-centre and is **draggable by its handle**, because a harness
 * that covers the thing being judged is worse than no harness — bottom-centre is
 * exactly where a bottom sheet, a toast and a dock all live. The handle also
 * collapses it to a pill, and double-clicking the handle puts it back where it
 * started. Position is in memory only: a reload re-centres it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
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

  const panelRef = useRef<HTMLDivElement>(null)
  /** Offset from the default bottom-centre spot, in px. */
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Pointer capture, so the drag survives the cursor leaving the handle and
      // works the same under a finger.
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      }
      setDragging(true)
    },
    [offset.x, offset.y]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = drag.current
      if (!start || start.pointerId !== event.pointerId) return
      let x = start.originX + (event.clientX - start.startX)
      let y = start.originY + (event.clientY - start.startY)

      // Clamp so it cannot be thrown off screen and lost. The measured rect
      // already includes the current offset, so back it out to get the
      // untranslated box.
      const panel = panelRef.current
      if (panel) {
        const rect = panel.getBoundingClientRect()
        const baseLeft = rect.left - offset.x
        const baseTop = rect.top - offset.y
        const margin = 8
        x = Math.min(
          Math.max(x, margin - baseLeft),
          window.innerWidth - margin - rect.width - baseLeft
        )
        y = Math.min(
          Math.max(y, margin - baseTop),
          window.innerHeight - margin - rect.height - baseTop
        )
      }
      setOffset({ x, y })
    },
    [offset.x, offset.y]
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
  }, [])

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
      ref={panelRef}
      style={{
        position: 'fixed',
        bottom: '12px',
        left: '50%',
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        zIndex: 300,
        width: collapsed ? 'auto' : 'min(374px, calc(100vw - 16px))',
        background: 'var(--surface-overlay)',
        border: '1px solid var(--surface-border-hover)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        padding: '8px',
        backdropFilter: 'blur(8px)',
        // Nothing animates while dragging, or the panel lags the finger.
        opacity: dragging ? 0.85 : 1,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setOffset({ x: 0, y: 0 })}
        title="Drag to move · double-click to re-centre"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: collapsed ? 0 : '8px',
          padding: '2px 2px 6px',
          cursor: dragging ? 'grabbing' : 'grab',
          // Otherwise a touch drag scrolls the page instead of moving the panel.
          touchAction: 'none',
        }}
      >
        <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <g fill="currentColor">
            {[2, 8, 14].map((cx) =>
              [3, 7].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" />)
            )}
          </g>
        </svg>
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? `harness · ${variants[index].key}` : 'drag me'}
        </span>
        <button
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand harness' : 'Collapse harness'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <>
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
        </>
      )}
    </div>
  )
}

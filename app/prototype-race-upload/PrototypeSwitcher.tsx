'use client'

/**
 * THROWAWAY — the variant switcher.
 *
 * Reads ?variant= from the URL, cycles with the arrow keys (but never while a
 * text field has focus), and hides itself entirely in production. It also carries
 * the cost meter, because the argument LAY-94 exists to settle is how much typing
 * a race costs: enter 08-26-26-beer-can (seven sail changes) in each variant and
 * compare the two numbers.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'
import VariantD from './VariantD'
import { costMeter } from './shared'

const VARIANTS = [
  { key: 'A', label: 'Wizard, corrected', Component: VariantA },
  { key: 'B', label: 'One sheet', Component: VariantB },
  { key: 'C', label: 'Timeline first', Component: VariantC },
  { key: 'D', label: 'Log now, annotate later', Component: VariantD },
] as const

export default function PrototypeSwitcher() {
  const router = useRouter()
  const params = useSearchParams()
  const raw = (params.get('variant') ?? 'A').toUpperCase()
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === raw),
  )
  const active = VARIANTS[index] ?? VARIANTS[0]

  const go = useCallback(
    (delta: number) => {
      const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]
      costMeter.reset()
      router.replace(`/prototype-race-upload?variant=${next.key}`)
    },
    [index, router],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      if (typing) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const Active = active.Component

  return (
    <>
      {/* Remounted per variant so switching is a clean slate, not a half-migrated draft. */}
      <Active key={active.key} />
      {process.env.NODE_ENV !== 'production' && (
        <Bar index={index} label={active.label} keyName={active.key} onPrev={() => go(-1)} onNext={() => go(1)} />
      )}
    </>
  )
}

function Bar({
  index,
  label,
  keyName,
  onPrev,
  onNext,
}: {
  index: number
  label: string
  keyName: string
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        height: 44,
        maxWidth: 430,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        background: 'var(--text-primary)',
        color: 'var(--sand-50)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <Arrow dir="left" onClick={onPrev} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center', lineHeight: 1.15 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'Inter,sans-serif' }}>
          {keyName} · {label}
        </div>
        <div style={{ fontSize: 8.5, opacity: 0.6, fontFamily: 'var(--font-mono)' }}>
          {index + 1}/4 · prototype · ← →
        </div>
      </div>
      <Cost />
      <Arrow dir="right" onClick={onNext} />
    </div>
  )
}

function Arrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'left' ? 'Previous variant' : 'Next variant'}
      style={{
        width: 34,
        height: 32,
        flexShrink: 0,
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--sand-50)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {dir === 'left' ? '‹' : '›'}
    </button>
  )
}

/** The instrument. One action = one state-changing gesture a sailor makes. */
function Cost() {
  const [, force] = useState(0)
  useEffect(() => costMeter.subscribe(() => force((n) => n + 1)), [])
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <button
      onClick={() => costMeter.reset()}
      title="Actions and seconds since this attempt started — tap to reset"
      style={{
        flexShrink: 0,
        padding: '3px 7px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--sand-50)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        lineHeight: 1.25,
        cursor: 'pointer',
        textAlign: 'right',
      }}
    >
      <div>{costMeter.actions} acts</div>
      <div style={{ opacity: 0.6 }}>{costMeter.elapsedSeconds()}s</div>
    </button>
  )
}

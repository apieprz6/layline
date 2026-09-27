'use client'

/**
 * PROTOTYPE — LAY-144. The shell: holds the filter, hands it to whichever variant
 * the `?variant=` param names, and owns the one thing the variants disagree about
 * that isn't visual — whether a tap goes through the URL.
 *
 *   A: every tap writes searchParams (ADR 0026, read literally)
 *   B: the sheet stages changes, one write on "Show results"
 *   C: never writes; pure client state
 *
 * Throwaway. Delete with the route.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { spacing } from '@/lib/utils/design'
import VariantA, { VARIANT_A_NAME } from './VariantA'
import VariantB, { VARIANT_B_NAME } from './VariantB'
import VariantC, { VARIANT_C_NAME } from './VariantC'
import PrototypeSwitcher from './PrototypeSwitcher'
import {
  EMPTY_FILTER,
  toSearchParams,
  type PrototypeFilter,
  type VariantKey,
} from './model'

const NAMES: Record<VariantKey, string> = {
  A: VARIANT_A_NAME,
  B: VARIANT_B_NAME,
  C: VARIANT_C_NAME,
}

const BLURB: Record<VariantKey, string> = {
  A: 'The mockup finished: one collapsible panel, six chip rows, multi-select, a count on every chip, and "Not recorded" as a hatched chip in the row. Writes the URL on every tap.',
  B: 'Nothing visible until asked for: a dock button opens a sheet of six dimensions, each drilling into its buckets. "Not recorded" sits below a "Nothing written down" divider. One URL write per visit.',
  C: 'No panel: a scrolling rail of dimension chips that never hides, over a permanent coverage ledger. "Not recorded" is a switch, not a bucket. Never touches the URL.',
}

export default function FilterPrototype({
  variant,
  initialFilter,
}: {
  variant: VariantKey
  initialFilter: PrototypeFilter
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Variant C's state lives here and never reaches the URL.
  const [local, setLocal] = useState<PrototypeFilter>(initialFilter)

  const urlDriven = variant === 'A' || variant === 'B'
  const filter = urlDriven ? initialFilter : local

  const push = (next: PrototypeFilter, nextVariant: VariantKey = variant) => {
    const qs = toSearchParams(next, { variant: nextVariant })
    startTransition(() => router.replace(`?${qs}`, { scroll: false }))
  }

  const onChange = (next: PrototypeFilter) => {
    if (urlDriven) push(next)
    else setLocal(next)
  }

  const onClear = () => {
    if (urlDriven) push(EMPTY_FILTER)
    else setLocal(EMPTY_FILTER)
  }

  const onSelectVariant = (v: VariantKey) => {
    // Carry the current filter across, so flipping variants compares the same view.
    setLocal(filter)
    push(filter, v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(4), paddingBottom: 80 }}>
      <header>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          Polar performance
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          Target polar with race data overlaid · whole archive by default
        </div>
      </header>

      {/* Not part of the design being judged — the brief for the person flipping through. */}
      <aside
        style={{
          background: 'var(--surface-elevated)',
          border: '1px dashed var(--surface-border)',
          borderRadius: 'var(--radius-sm)',
          padding: `${spacing(2)} ${spacing(3)}`,
          fontSize: 10.5,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>
          Variant {variant} — {NAMES[variant]}
        </strong>
        <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>{BLURB[variant]}</div>
        <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          Counts are the real archive: 13 races, 3,251 rows with both TWS and TWA. Bucket boundaries
          are guesses. ← / → to switch variants.
        </div>
      </aside>

      {variant === 'A' && (
        <VariantA filter={filter} onChange={onChange} onClear={onClear} pending={pending} />
      )}
      {variant === 'B' && (
        <VariantB filter={filter} onChange={onChange} onClear={onClear} pending={pending} />
      )}
      {variant === 'C' && <VariantC filter={filter} onChange={onChange} onClear={onClear} />}

      <PrototypeSwitcher current={variant} names={NAMES} onSelect={onSelectVariant} />
    </div>
  )
}

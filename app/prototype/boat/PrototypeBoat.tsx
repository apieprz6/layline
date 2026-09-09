'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Hosts the three variants inside the real app chrome, because variants judged
 * in a vacuum all look fine. Both knobs live in the URL so a screen can be
 * shared exactly as it was seen: `?variant=B&viewer=guest`.
 */

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PrototypeSwitcher, { type PrototypeVariant } from '@/components/prototype/PrototypeSwitcher'
import VariantA from './VariantA'
import VariantB from './VariantB'
import VariantC from './VariantC'
import { VIEWERS, VIEWER_LABEL, type Viewer } from './viewer'

const VARIANTS: PrototypeVariant[] = [
  { key: 'A', name: 'Index — minimal, seam left visible' },
  { key: 'B', name: 'Evidence-first — track, traces, aggregates' },
  { key: 'C', name: 'Ledger — one record, pencils in place' },
]

function isViewer(value: string | null): value is Viewer {
  return value === 'guest' || value === 'member' || value === 'admin'
}

export default function PrototypeBoat(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawVariant = (searchParams.get('variant') ?? 'A').toUpperCase()
  const variant = VARIANTS.some((v) => v.key === rawVariant) ? rawVariant : 'A'

  const rawViewer = searchParams.get('viewer')
  const viewer: Viewer = isViewer(rawViewer) ? rawViewer : 'admin'

  const setViewer = (next: Viewer): void => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('viewer', next)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      {variant === 'A' && <VariantA viewer={viewer} />}
      {variant === 'B' && <VariantB viewer={viewer} />}
      {variant === 'C' && <VariantC viewer={viewer} />}

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        extra={
          <div style={{ display: 'flex', gap: '4px' }}>
            {VIEWERS.map((v) => (
              <button
                key={v}
                onClick={() => setViewer(v)}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: v === viewer ? 700 : 500,
                  border:
                    v === viewer
                      ? '1px solid var(--blue-500)'
                      : '1px solid var(--surface-border)',
                  background: v === viewer ? 'var(--blue-muted)' : 'transparent',
                  color: v === viewer ? 'var(--text-accent)' : 'var(--text-muted)',
                }}
              >
                {VIEWER_LABEL[v]}
              </button>
            ))}
          </div>
        }
      />
    </>
  )
}

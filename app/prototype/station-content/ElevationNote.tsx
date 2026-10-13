'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * The one elevation caveat, replacing the three copies ADR 0008 flagged
 * (`ndbc.ts:29`, `TabbedInfoPanel.tsx:260`, the station header's location
 * line). Everything it says comes from metadata: the height from
 * `windMeasurementHeight`, the claim from `adjustmentNote`. It names speed
 * and gust both, since both come off the same anemometer.
 *
 * A station measured near the surface renders nothing — no chip, no "this is
 * surface data" line. Absence is the signal, same rule as a missing card.
 *
 * Tap toggles, so it works without hover. Escape and an outside tap close it.
 */

import { useEffect, useRef, useState } from 'react'
import type { ProtoMetadata } from './fixtures'

/** The 10 m reference height anemometers are normalised to. Above it, we say so. */
const ELEVATED_FT = 33

interface ElevationNoteProps {
  metadata: ProtoMetadata
  align?: 'left' | 'right'
  /** `chip` shows "85 ft ⓘ"; `icon` shows just ⓘ. */
  look?: 'chip' | 'icon'
}

export default function ElevationNote({ metadata, align = 'left', look = 'chip' }: ElevationNoteProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const h = metadata.windMeasurementHeight
  if (h <= ELEVATED_FT) return null

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Measured at ${h} ft — about this`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: look === 'chip' ? '1px 6px' : '0 2px',
          border: look === 'chip' ? '1px solid var(--surface-border)' : 'none',
          borderRadius: '999px',
          background: open ? 'rgba(0,68,204,0.08)' : 'transparent',
          fontFamily: 'var(--font-mono)',
          fontSize: '9.5px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          lineHeight: 1.4,
        }}
      >
        {look === 'chip' && <span>{h} ft</span>}
        <span aria-hidden style={{ fontSize: '10.5px' }}>ⓘ</span>
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align]: 0,
            zIndex: 30,
            width: '220px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: '#0A0A0A',
            color: 'white',
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: 0,
            textTransform: 'none',
            lineHeight: 1.4,
            textAlign: 'left',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          }}
        >
          Speed and gust measured {h} ft above the water. {metadata.adjustmentNote}
        </span>
      )}
    </span>
  )
}

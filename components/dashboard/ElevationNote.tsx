'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { BuoyMetadata } from '@/types'

/**
 * The 10 m anemometer standard, in feet. A station measuring above it reads high against the
 * surface wind a boat sails in, and the page says so; at or below it the page says nothing.
 */
export const ELEVATED_ANEMOMETER_FT = 33

interface ElevationNoteProps {
  metadata: BuoyMetadata
}

/**
 * The station page's one elevation caveat: a "85 ft ⓘ" chip beside the station id, because it
 * qualifies every wind number on the page. The text comes from the station's metadata, the height
 * from `windMeasurementHeight` and the claim from `adjustmentNote`, and names gust as well as speed
 * where the station measures it, since both come off the same anemometer. The readings themselves
 * are shown as reported (ADR 0008).
 *
 * Tap toggles, so it works without hover. Escape and a tap outside close it.
 */
export default function ElevationNote({ metadata }: ElevationNoteProps): ReactElement | null {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const height = metadata.windMeasurementHeight
  if (height <= ELEVATED_ANEMOMETER_FT) return null

  const measured = metadata.capability.gust ? 'Speed and gust' : 'Speed'

  return (
    <span ref={ref} className="elevation-note">
      <button
        type="button"
        className={`elevation-note__chip${open ? ' elevation-note__chip--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Measured at ${height} ft — about this`}
      >
        <span>{height} ft</span>
        <span aria-hidden className="elevation-note__icon">
          ⓘ
        </span>
      </button>
      {open && (
        <span role="tooltip" className="elevation-note__tooltip">
          {measured} measured {height} ft above the water. {metadata.adjustmentNote}
        </span>
      )}
    </span>
  )
}

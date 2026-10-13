'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See ./README.md.
 *
 * Top-right toggles for the two fixture questions every variant has to
 * answer — which station (what it can measure), and whether the latest
 * readings are missing — plus a readout of the state that drives them.
 * Hidden in production builds, like the variant switcher; use the URL there.
 */

import type { ProtoMetadata } from './fixtures'
import { MISSING_MINUTES } from './fixtures'

interface FixtureBarProps {
  buoyId: string
  missing: boolean
  metadata: ProtoMetadata
  windIsSynthetic: boolean
  onChange: (key: 'buoy' | 'missing', value: string | null) => void
}

export default function FixtureBar({ buoyId, missing, metadata, windIsSynthetic, onChange }: FixtureBarProps) {
  if (process.env.NODE_ENV === 'production') return null
  const { capability } = metadata

  return (
    <div style={bar}>
      {['CHII2', '45198'].map((id) => (
        <button key={id} onClick={() => onChange('buoy', id)} style={btn(buoyId === id)}>
          {id}
        </button>
      ))}
      <button onClick={() => onChange('missing', missing ? null : '1')} style={btn(missing)}>
        last {MISSING_MINUTES / 60}h missing
      </button>
      <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>
        gust {capability.gust ? '✓' : '✗'} · waves {capability.waves ? '✓' : '✗'} · {metadata.windMeasurementHeight} ft
        {windIsSynthetic ? ' · synthetic wind' : ''}
      </span>
    </div>
  )
}

const bar: React.CSSProperties = {
  position: 'fixed',
  top: '52px',
  right: '8px',
  zIndex: 1000,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '6px',
  maxWidth: 'calc(100vw - 16px)',
  padding: '6px 8px',
  borderRadius: '10px',
  background: 'rgba(17,17,17,0.9)',
  color: '#fff',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
}

function btn(active: boolean): React.CSSProperties {
  return {
    background: active ? '#fff' : 'rgba(255,255,255,0.12)',
    color: active ? '#111' : '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '3px 7px',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  }
}

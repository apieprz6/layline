'use client'

interface RaceHeaderProps {
  currentWind: {
    speed: number
    direction: number
  } | null
  onOpenMenu?: () => void
}

export default function RaceHeader({ currentWind, onOpenMenu }: RaceHeaderProps) {
  return (
    <div
      style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--surface-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--surface-raised)',
      }}
    >
      {/* Left: Hamburger + Logo + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            aria-label="Menu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              marginLeft: '-4px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.svg" width={24} height={24} alt="L" />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          layline
        </div>
      </div>

      {/* Right: Wind info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', fontWeight: 500 }}>
            WIND NOW
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', fontWeight: 500 }}>
            {currentWind ? `${currentWind.speed.toFixed(1)} kts` : '—'}
          </div>
        </div>
        {currentWind && (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--blue-muted)',
              border: '1px solid var(--blue-muted-40)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <g transform={`rotate(${currentWind.direction} 8 8)`}>
                <rect x="7.25" y="9" width="1.5" height="5" rx="0.5" fill="var(--blue-500)" opacity="0.2" />
                <polygon points="8,3 10,10 8,9 6,10" fill="var(--blue-500)" />
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

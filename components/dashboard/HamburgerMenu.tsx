'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface HamburgerMenuProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: '/wind-data',
    label: 'Wind Data',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
      </svg>
    ),
  },
]

export default function HamburgerMenu({ isOpen, onClose }: HamburgerMenuProps) {
  const pathname = usePathname()

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])
  if (!isOpen) {
    return (
      <nav role="navigation" style={{ display: 'none' }}>
        {/* Menu content will go here */}
      </nav>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        data-testid="menu-overlay"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 40,
        }}
      />

      {/* Drawer */}
      <nav
        role="navigation"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'var(--drawer-width)',
          background: 'var(--surface-raised)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>layline</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Wed Night · Navy Pier</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              color: 'var(--text-muted)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navigation items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  background: isActive ? 'var(--blue-muted)' : 'transparent',
                  border: isActive ? '1px solid var(--surface-border-hover)' : '1px solid transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {item.icon}
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginTop: '16px',
          }}
        >
          v1.0 · May 2026
        </div>
      </nav>
    </>
  )
}

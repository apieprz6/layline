'use client'

/**
 * PROTOTYPE SHARED BITS — throwaway. See ./README.md.
 *
 * Only what all three variants must agree on: ADR 0016's five drawer entries in
 * their fixed order with the two dividers, the padlock, the dim behind a sheet,
 * and the Google button (whose look is Google's to dictate, not ours to vary).
 *
 * Deliberately NOT shared: the drawer chrome and the sheet shell. Those are the
 * thing being judged, so each variant draws its own.
 */

import React from 'react'

export interface NavEntry {
  href: string
  label: string
  /** ADR 0015: shown to a Guest as a Locked Entry. */
  locked?: boolean
  /** Render a divider above this entry (ADR 0016's two dividers). */
  dividerAbove?: boolean
  icon: React.ReactElement
}

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
} as const

export const NAV_ENTRIES: NavEntry[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="20" height="20" {...stroke}>
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
      <svg width="20" height="20" {...stroke}>
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
      </svg>
    ),
  },
  {
    href: '/boat',
    label: 'Boat management',
    locked: true,
    dividerAbove: true,
    icon: (
      <svg width="20" height="20" {...stroke}>
        <path d="M12 3v11M12 14 5 14l7-11ZM4 17h16l-2.5 4h-11L4 17Z" />
      </svg>
    ),
  },
  {
    href: '/boat/performance',
    label: 'Boat performance',
    locked: true,
    icon: (
      <svg width="20" height="20" {...stroke}>
        <path d="M3 20V4M3 20h18M7 16l4-5 3 3 5-7" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    dividerAbove: true,
    icon: (
      <svg width="20" height="20" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function LockIcon({ size = 12 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/** Stands in for a face nobody gave us. Never a letter taken from an email. */
export function PersonMark({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

export function SignOutIcon({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17l5-5-5-5M20 12H9M12 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" />
    </svg>
  )
}

export function ChevronIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function GoogleMark({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6c1.9-5.7 7.2-10.1 13.6-10.1z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.15-3.1-.4-4.6H24v9h12.6c-.55 2.9-2.2 5.4-4.65 7.05l7.6 5.9c4.45-4.1 6.95-10.15 6.95-17.35z" />
      <path fill="#FBBC05" d="M10.4 28.4a14.6 14.6 0 0 1 0-8.8l-7.8-6a23.5 23.5 0 0 0 0 20.8l7.8-6z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2.05 15.55-5.6l-7.6-5.9c-2.1 1.45-4.85 2.3-7.95 2.3-6.4 0-11.7-4.4-13.6-10.1l-7.8 6C6.5 42.2 14.6 47.5 24 47.5z" />
    </svg>
  )
}

/**
 * The sheet's one button. ADR 0020: this is the whole door.
 * Google dictates its look, so it does not vary between variants.
 */
export function GoogleButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--surface-border-hover)',
        background: 'var(--surface-raised)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-base)',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <GoogleMark />
      Continue with Google
    </button>
  )
}

/** The dim behind any sheet. */
export function Dim({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 190,
      }}
    />
  )
}

export const truncate: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** Uppercase micro-label in the drawer's own idiom. */
export function DrawerLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '9px',
        fontWeight: 600,
        letterSpacing: 'var(--tracking-wider)',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </div>
  )
}

export const VERSION_LINE = 'v1.0 · May 2026'

export function VersionLine(): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '9px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
      }}
    >
      {VERSION_LINE}
    </div>
  )
}

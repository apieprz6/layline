'use client'

import { Fragment, useEffect, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AccountBlock from './AccountBlock'
import type { Account } from '@/types'

interface HamburgerMenuProps {
  isOpen: boolean
  onClose: () => void
  /** The signed-in sailor, resolved on the server; `null` is a **Guest**. */
  account: Account | null
  /**
   * `destination` is the route sign-in should land on when it finishes. A
   * **Locked Entry** passes its own; the account block passes nothing, meaning
   * the screen the sailor is already on.
   */
  onSignIn: (destination?: string) => void
  onSignOut: () => void
}

interface NavEntry {
  href: string
  label: string
  icon: ReactElement
  /**
   * A **Locked Entry** for a **Guest**: the row is present and inert, and the
   * only thing on it that does anything is its Sign in (ADR 0015).
   */
  locksForGuest?: true
}

/**
 * The final drawer shape (ADR 0016): five flat entries in one fixed order, the
 * two boat sections grouped between dividers.
 *
 * Membership and order are the same for a Guest and a signed-in sailor. What
 * changes is that the boat pair stops being inert, and the account block swaps —
 * which is why the locked pair can sit in the middle, and why Settings keeps the
 * last slot rather than being stranded above the two sections a boat's owner
 * opens most.
 *
 * `/station/[buoyId]` is deliberately absent: it is a detail route reached by
 * tapping a `StationRow`, not a section.
 */
const navGroups: NavEntry[][] = [
  [
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
  ],
  [
    {
      href: '/boat-management',
      label: 'Boat management',
      locksForGuest: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z" />
          <path d="M21 14 10 2 3 14h18Z" />
          <path d="M10 2v16" />
        </svg>
      ),
    },
    {
      href: '/boat-performance',
      label: 'Boat performance',
      locksForGuest: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
  ],
  [
    {
      href: '/settings',
      label: 'Settings',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ],
]

/**
 * A **Locked Entry**'s row: the section is named, and the only thing on it that
 * does anything is its Sign in.
 *
 * Not a link, because there is nowhere to send a **Guest** — there is no
 * signed-out version of either boat screen, so the row is inert and muted, and
 * the invitation is the affordance (ADR 0015). Not a separate invitation block
 * either: the offer belongs to the thing being offered (ADR 0016).
 *
 * The padlock sits directly after the label, as the prototype has it, so the two
 * read as one phrase — "Boat management, locked" — with the offer out at the far
 * edge where a control belongs.
 */
function LockedEntry({
  entry,
  onSignIn,
}: {
  entry: NavEntry
  onSignIn: (destination?: string) => void
}): ReactElement {
  return (
    <div
      data-testid="locked-entry"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 12px',
        margin: '2px 0',
        borderRadius: '6px',
        border: '1px solid transparent',
        // Muted against the open rows' `--text-secondary`: the row is here to be
        // read, not followed.
        color: 'var(--text-muted)',
      }}
    >
      {entry.icon}
      {/* No wrap: "Boat performance" is the longest label in the drawer, and a
          second line would move every row below it. */}
      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {entry.label}
      </span>
      <svg
        data-testid="padlock"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <button
        onClick={() => onSignIn(entry.href)}
        // The padlock is drawn, so the button is what has to say what it unlocks:
        // a drawer of identical "Sign in" buttons names nothing.
        aria-label={`Sign in to open ${entry.label}`}
        style={{
          marginLeft: 'auto',
          background: 'none',
          border: 'none',
          padding: '2px 0',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          // The prototype's size, and the one that keeps the longest label on a
          // single line inside the fixed 268px.
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-accent)',
        }}
      >
        Sign in
      </button>
    </div>
  )
}

export default function HamburgerMenu({
  isOpen,
  onClose,
  account,
  onSignIn,
  onSignOut,
}: HamburgerMenuProps) {
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
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
          zIndex: 90,
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
          borderRight: '1px solid var(--surface-border)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease-out',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 16px 16px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>layline</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Race Circle · Lake Michigan</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-muted)',
              display: 'flex',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Navigation items */}
        <div style={{ padding: '10px 8px', flex: 1 }}>
          {navGroups.map((group, groupIndex) => (
            <Fragment key={group[0].href}>
              {/* The dividers are what make the middle pair read as one locked
                  section rather than two locked items scattered through a list. */}
              {groupIndex > 0 && (
                <div
                  role="separator"
                  style={{
                    height: '1px',
                    background: 'var(--surface-border)',
                    margin: '8px 12px',
                  }}
                />
              )}
              {group.map((item) => {
                const isActive = pathname === item.href
                const isLocked = item.locksForGuest === true && account === null

                if (isLocked) {
                  return <LockedEntry key={item.href} entry={item} onSignIn={onSignIn} />
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 12px',
                      margin: '2px 0',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      background: isActive ? 'var(--blue-muted)' : 'transparent',
                      border: isActive ? '1px solid var(--surface-border-hover)' : '1px solid transparent',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all 150ms',
                    }}
                  >
                    {item.icon}
                    {/* No wrap: "Boat performance" is the longest label in the
                        drawer, and a second line would move every row below it. */}
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: '14px', fontWeight: isActive ? 600 : 500, whiteSpace: 'nowrap' }}>{item.label}</span>
                  </Link>
                )
              })}
            </Fragment>
          ))}
        </div>

        {/* Footer — the account block is what this region is for, with the
            version demoted to a hairline beneath it (ADR 0021, prototype A) */}
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--surface-border)' }}>
          <AccountBlock account={account} onSignIn={onSignIn} onSignOut={onSignOut} />
          <div style={{ marginTop: '10px', fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>v1.0 · May 2026</div>
        </div>
      </nav>
    </>
  )
}

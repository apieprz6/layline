'use client'

/**
 * VARIANT C — "One loud door, and the account is a destination" (throwaway, see ./README.md)
 *
 * Position: the drawer should offer signing in exactly once, loudly. So the
 * locked rows go mute — padlock only, no inline "Sign in" — and the footer
 * region carries a single filled button. That is C's answer to the redundancy,
 * and it is the opposite of B's: what gives is the *rows'* offer, not the
 * block's, on the argument that a padlock already reads as "there is a door" and
 * a sailor should not have to pick which of three identical links to press.
 *
 * Signed in, the block is not a status line but a *row you can tap*: initials,
 * name, Role, chevron, going to Settings — which is where Sign out lives, so the
 * drawer holds no Sign out at all. (Use the harness to get back to Guest.)
 *
 * Sheet: not a sheet. One button does not need an edge-to-edge surface, so it is
 * a floating card sitting low on the screen, thumb-reachable, with the app
 * visible around all four of its sides.
 */

import React from 'react'
import {
  NAV_ENTRIES,
  LockIcon,
  PersonMark,
  ChevronIcon,
  GoogleButton,
  Dim,
  truncate,
  DrawerLabel,
  VersionLine,
} from './shared'
import { initialsOf, type PrototypeAccount } from './fixture'
import type { VariantProps } from './VariantA'

export const VARIANT_C_NAME = 'One loud door'

function RoleChip({ role }: { role: 'admin' | 'viewer' }): React.ReactElement {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        color: role === 'admin' ? 'var(--text-accent)' : 'var(--text-muted)',
        border: `1px solid ${role === 'admin' ? 'var(--blue-muted-40)' : 'var(--surface-border)'}`,
        background: role === 'admin' ? 'var(--blue-muted)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        padding: '1px 4px',
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  )
}

function AccountRow({ account }: { account: PrototypeAccount }): React.ReactElement {
  const initials = initialsOf(account.displayName)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px',
        marginLeft: '-8px',
        marginRight: '-8px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: '34px',
          height: '34px',
          flexShrink: 0,
          borderRadius: 'var(--radius-full)',
          border: '1.5px solid var(--blue-500)',
          color: 'var(--blue-500)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '12px',
        }}
      >
        {initials ?? <PersonMark size={18} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span
            style={{
              fontFamily: account.displayName ? 'var(--font-body)' : 'var(--font-mono)',
              fontSize: account.displayName ? '13px' : '11px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              ...truncate,
            }}
          >
            {account.displayName ?? account.email}
          </span>
          <RoleChip role={account.role} />
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            ...truncate,
          }}
        >
          {/* Same slot either way: what the row does, not who you are twice. */}
          Account &amp; sign out
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <ChevronIcon />
      </span>
    </div>
  )
}

function GuestDoor({ onOpenSheet }: { onOpenSheet: () => void }): React.ReactElement {
  return (
    <div>
      <DrawerLabel>Browsing as guest</DrawerLabel>
      <button
        onClick={onOpenSheet}
        style={{
          width: '100%',
          marginTop: '8px',
          padding: '11px 12px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--blue-500)',
          color: 'var(--text-inverse)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        Sign in
      </button>
    </div>
  )
}

export default function VariantC({
  account,
  drawerOpen,
  onCloseDrawer,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
}: VariantProps): React.ReactElement {
  return (
    <>
      <div
        onClick={onCloseDrawer}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease-out',
          zIndex: 90,
        }}
      />

      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'var(--drawer-width)',
          background: 'var(--surface-raised)',
          borderRight: '1px solid var(--surface-border)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease-out',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: drawerOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        <div
          style={{
            padding: '18px 16px 16px',
            borderBottom: '1px solid var(--surface-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '16px',
                color: 'var(--text-primary)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              layline
            </div>
            <div
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
              }}
            >
              Race Circle · Lake Michigan
            </div>
          </div>
          <button
            onClick={onCloseDrawer}
            aria-label="Close menu"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '10px 8px', flex: 1 }}>
          {NAV_ENTRIES.map((entry) => {
            const locked = Boolean(entry.locked) && !account
            const isActive = entry.href === '/'
            return (
              <React.Fragment key={entry.href}>
                {entry.dividerAbove && (
                  <div style={{ height: '1px', background: 'var(--surface-divider)', margin: '8px 4px' }} />
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    margin: '2px 0',
                    borderRadius: '6px',
                    background: isActive ? 'var(--blue-muted)' : 'transparent',
                    border: isActive ? '1px solid var(--surface-border-hover)' : '1px solid transparent',
                    color: isActive ? 'var(--text-accent)' : locked ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >
                  {entry.icon}
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      fontWeight: isActive ? 600 : 500,
                      ...truncate,
                    }}
                  >
                    {entry.label}
                  </span>
                  {/* Mute: the padlock is the whole statement. */}
                  {locked && (
                    <span style={{ marginLeft: 'auto', display: 'flex' }}>
                      <LockIcon size={13} />
                    </span>
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>

        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--surface-border)' }}>
          {account ? <AccountRow account={account} /> : <GuestDoor onOpenSheet={onOpenSheet} />}
          <div style={{ marginTop: '12px' }}>
            <VersionLine />
          </div>
        </div>
      </nav>

      {/* Sheet C — a floating card, low on the screen, not an edge-to-edge sheet */}
      {sheetOpen && (
        <>
          <Dim onClick={onCloseSheet} />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 'calc(96px + env(safe-area-inset-bottom))',
              width: 'min(342px, calc(100vw - 32px))',
              zIndex: 200,
              background: 'var(--surface-raised)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 'var(--text-lg)',
                  color: 'var(--text-primary)',
                  letterSpacing: 'var(--tracking-tight)',
                }}
              >
                Sign in to Layline
              </div>
              <button
                onClick={onCloseSheet}
                aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                margin: '8px 0 16px',
              }}
            >
              Use the Google address the boat&apos;s owner set your account up with.
            </div>
            <GoogleButton onClick={onCloseSheet} />
          </div>
        </>
      )}
    </>
  )
}

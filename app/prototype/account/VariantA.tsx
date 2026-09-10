'use client'

/**
 * VARIANT A — "The footer earns a second line" (throwaway, see ./README.md)
 *
 * Position: the account block is what the footer is *for*. It takes the top of
 * the bordered footer region and pushes `v1.0 · May 2026` down to a hairline
 * under it. Nothing else in the drawer moves, and the locked rows keep the
 * inline "Sign in" ADR 0016 put on them — so this variant shows the double
 * affordance at full strength instead of resolving it. If two "Sign in"s in one
 * 268px column read badly, this is where you see it.
 *
 * Sheet: the honest minimum. An edge-anchored bottom sheet sized to its
 * contents (~34% of a 390×844 viewport, not 82%), because one button is one
 * button.
 */

import React from 'react'
import {
  NAV_ENTRIES,
  LockIcon,
  PersonMark,
  GoogleButton,
  Dim,
  truncate,
  VersionLine,
} from './shared'
import { initialsOf, type PrototypeAccount } from './fixture'

export const VARIANT_A_NAME = 'Footer, second line'

export interface VariantProps {
  account: PrototypeAccount | null
  drawerOpen: boolean
  onCloseDrawer: () => void
  sheetOpen: boolean
  onOpenSheet: () => void
  onCloseSheet: () => void
  onSignOut: () => void
}

function Avatar({ account }: { account: PrototypeAccount }): React.ReactElement {
  const initials = initialsOf(account.displayName)
  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        flexShrink: 0,
        borderRadius: 'var(--radius-full)',
        background: 'var(--blue-muted)',
        border: '1px solid var(--blue-muted-40)',
        color: 'var(--text-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: '12px',
        letterSpacing: '0.02em',
      }}
    >
      {initials ?? <PersonMark size={17} />}
    </div>
  )
}

function GuestAvatar(): React.ReactElement {
  return (
    <div
      style={{
        width: '32px',
        height: '32px',
        flexShrink: 0,
        borderRadius: 'var(--radius-full)',
        border: '1px dashed var(--surface-border-hover)',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PersonMark size={17} />
    </div>
  )
}

function textLink(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    padding: '4px 0 4px 8px',
    marginLeft: 'auto',
    flexShrink: 0,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color,
  }
}

function AccountBlock({
  account,
  onOpenSheet,
  onSignOut,
}: {
  account: PrototypeAccount | null
  onOpenSheet: () => void
  onSignOut: () => void
}): React.ReactElement {
  if (!account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <GuestAvatar />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              ...truncate,
            }}
          >
            Browsing as guest
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', ...truncate }}>
            Weather is open to everyone
          </div>
        </div>
        <button onClick={onOpenSheet} style={textLink('var(--text-accent)')}>
          Sign in
        </button>
      </div>
    )
  }

  const name = account.displayName
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Avatar account={account} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            ...truncate,
          }}
        >
          {name ?? account.email}
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: name ? 'var(--font-mono)' : 'var(--font-body)',
            ...truncate,
          }}
        >
          {/* No name means the email has already taken the line above it, so the
              second line says where the account came from rather than repeating. */}
          {name ?? 'Google account'}
        </div>
      </div>
      <button onClick={onSignOut} style={textLink('var(--text-muted)')}>
        Sign out
      </button>
    </div>
  )
}

function NavRow({
  entry,
  isActive,
  locked,
  onOpenSheet,
}: {
  entry: (typeof NAV_ENTRIES)[number]
  isActive: boolean
  locked: boolean
  onOpenSheet: () => void
}): React.ReactElement {
  return (
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
        color: isActive ? 'var(--accent, var(--text-accent))' : locked ? 'var(--text-muted)' : 'var(--text-secondary)',
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
      {locked && (
        <>
          <LockIcon />
          <button onClick={onOpenSheet} style={textLink('var(--text-accent)')}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500 }}>Sign in</span>
          </button>
        </>
      )}
    </div>
  )
}

export default function VariantA({
  account,
  drawerOpen,
  onCloseDrawer,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onSignOut,
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
        {/* Header — production, untouched */}
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

        {/* Five entries, ADR 0016 order, two dividers */}
        <div style={{ padding: '10px 8px', flex: 1 }}>
          {NAV_ENTRIES.map((entry) => (
            <React.Fragment key={entry.href}>
              {entry.dividerAbove && (
                <div style={{ height: '1px', background: 'var(--surface-divider)', margin: '8px 4px' }} />
              )}
              <NavRow
                entry={entry}
                isActive={entry.href === '/'}
                locked={Boolean(entry.locked) && !account}
                onOpenSheet={onOpenSheet}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Footer — the account block, then the version hairline */}
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid var(--surface-border)' }}>
          <AccountBlock account={account} onOpenSheet={onOpenSheet} onSignOut={onSignOut} />
          <div style={{ marginTop: '10px' }}>
            <VersionLine />
          </div>
        </div>
      </nav>

      {/* Sheet A — edge-anchored, sized to its contents */}
      {sheetOpen && (
        <>
          <Dim onClick={onCloseSheet} />
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 200,
              background: 'var(--surface-raised)',
              borderTop: '1px solid var(--surface-border)',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
              padding: '10px 20px calc(24px + env(safe-area-inset-bottom))',
              maxWidth: '430px',
              margin: '0 auto',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '4px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--surface-border)',
                margin: '0 auto 18px',
              }}
            />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'var(--text-xl)',
                color: 'var(--text-primary)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              Sign in
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
                margin: '6px 0 18px',
                lineHeight: 1.5,
              }}
            >
              Layline accounts are made by the boat&apos;s owner.
            </div>
            <GoogleButton onClick={onCloseSheet} />
          </div>
        </>
      )}
    </>
  )
}

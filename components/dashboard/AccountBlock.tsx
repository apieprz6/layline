'use client'

import type { CSSProperties, ReactElement } from 'react'
import { initialsOf } from '@/lib/account/initials'
import type { Account } from '@/types'

interface AccountBlockProps {
  /** `null` is a **Guest**. Resolved on the server and handed down (ADR 0018). */
  account: Account | null
  /** Opens the **Auth Sheet**, which the app layout mounts (ADR 0016). */
  onSignIn: () => void
  onSignOut: () => void
}

const truncate: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** Stands in for a face nobody gave us. Never a letter taken from an email. */
function PersonMark(): ReactElement {
  return (
    <svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

const avatarBase: CSSProperties = {
  width: '32px',
  height: '32px',
  flexShrink: 0,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function textLink(color: string): CSSProperties {
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

/**
 * The drawer's account block: who the sailor is right now, and the one thing
 * they can do about it.
 *
 * Takes the top of the drawer's bordered footer, with `v1.0 · May 2026` demoted
 * to a hairline beneath it — the LAY-119 prototype's Variant A, which the owner
 * picked whole (ADR 0021). The **Role** is deliberately absent: it governs
 * writes only, so it answers no question a reader of the drawer has.
 *
 * Purely presentational and prop-driven, so it needs no Supabase mock in a test.
 * Both operations run through the browser client one level up, in `AppLayout`,
 * because that is what makes cross-tab sessions work (ADR 0018).
 */
export default function AccountBlock({
  account,
  onSignIn,
  onSignOut,
}: AccountBlockProps): ReactElement {
  if (!account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          data-testid="account-avatar"
          style={{
            ...avatarBase,
            border: '1px dashed var(--surface-border-hover)',
            color: 'var(--text-muted)',
          }}
        >
          <PersonMark />
        </div>
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', ...truncate }}>
            Weather is open to everyone
          </div>
        </div>
        {/* Called with no argument on purpose: the handler above takes an optional
            destination, and `onClick={onSignIn}` would hand it a MouseEvent. */}
        <button onClick={() => onSignIn()} style={textLink('var(--text-accent)')}>
          Sign in
        </button>
      </div>
    )
  }

  const name = account.displayName
  const initials = initialsOf(name)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div
        data-testid="account-avatar"
        style={{
          ...avatarBase,
          background: 'var(--blue-muted)',
          border: '1px solid var(--blue-muted-40)',
          color: 'var(--text-accent)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--text-sm)',
          letterSpacing: '0.02em',
        }}
      >
        {initials ?? <PersonMark />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            // The one size here with no token behind it: the scale steps 12 → 14,
            // and the prototype's name line sits between them.
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
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontFamily: name ? 'var(--font-mono)' : 'var(--font-body)',
            ...truncate,
          }}
        >
          {/* No name means the address has already taken the line above it, so
              the second line says where the account came from rather than
              repeating itself. */}
          {name ? account.email : 'Google account'}
        </div>
      </div>
      <button onClick={onSignOut} style={textLink('var(--text-muted)')}>
        Sign out
      </button>
    </div>
  )
}

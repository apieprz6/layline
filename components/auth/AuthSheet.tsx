'use client'

import { useEffect, type ReactElement } from 'react'

interface AuthSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Runs the handshake. It navigates away, so nothing here waits on it. */
  onContinueWithGoogle: () => void
}

function GoogleMark(): ReactElement {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6c1.9-5.7 7.2-10.1 13.6-10.1z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.15-3.1-.4-4.6H24v9h12.6c-.55 2.9-2.2 5.4-4.65 7.05l7.6 5.9c4.45-4.1 6.95-10.15 6.95-17.35z"
      />
      <path fill="#FBBC05" d="M10.4 28.4a14.6 14.6 0 0 1 0-8.8l-7.8-6a23.5 23.5 0 0 0 0 20.8l7.8-6z" />
      <path
        fill="#34A853"
        d="M24 47.5c6.2 0 11.5-2.05 15.55-5.6l-7.6-5.9c-2.1 1.45-4.85 2.3-7.95 2.3-6.4 0-11.7-4.4-13.6-10.1l-7.8 6C6.5 42.2 14.6 47.5 24 47.5z"
      />
    </svg>
  )
}

/**
 * The **Auth Sheet**: one **Continue with Google** button, and nothing else.
 *
 * A bottom sheet **sized to its contents** — a grab handle, the heading, one
 * line of copy, the button and safe-area padding, rather than
 * `Login-mockup.html`'s 82% (ADR 0021). The markup is the prototype's unchanged;
 * a browser measures it at **180px** where that ADR estimated ~250px, which is
 * recorded there and asserted in `e2e/auth-sheet.spec.ts`. It is mounted in the
 * app layout, so it opens over whatever screen the sailor is on and a
 * **Locked Entry** anywhere can reach it without navigating first (ADR 0016).
 *
 * It holds **no state**: no modes, no fields, no validation and no error region.
 * Google is the only door (ADR 0020), and the one way in can fail — a stranger
 * with no **Account** — is shown on `/auth/callback`, where the refusal actually
 * arrives, not carried back here.
 *
 * **Known gap:** it says `aria-modal` but moves no focus and traps none, so a
 * keyboard or screen-reader sailor can still reach the drawer behind it. Escape
 * and the dim both close it. Nothing in LAY-126 asked for focus management and
 * nothing here has been read on a screen; it wants a browser test alongside the
 * geometry one.
 */
export default function AuthSheet({
  isOpen,
  onClose,
  onContinueWithGoogle,
}: AuthSheetProps): ReactElement | null {
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      <div
        data-testid="auth-sheet-dim"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 190 }}
      />

      <div
        data-testid="auth-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
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
        <button
          onClick={onContinueWithGoogle}
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
      </div>
    </>
  )
}

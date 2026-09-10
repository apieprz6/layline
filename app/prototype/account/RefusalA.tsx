'use client'

/**
 * THE REFUSED STRANGER — drawn on Variant A only (throwaway, see ./README.md).
 *
 * ADR 0020 left "a stranger is refused" as the sheet's only failure mode: with
 * one button, there is nothing else that can go wrong. LAY-120 has now seen it
 * live, refusing an unknown Google account with sign-up off:
 *
 *   ?error=access_denied&error_code=signup_disabled
 *   &error_description=Signups+not+allowed+for+this+instance
 *
 * Three things that hands us, and this file draws all three:
 *
 * 1. It arrives at `/auth/callback`, NOT in the sheet. So where the refusal is
 *    shown is a design choice, not a given — three landings below, switched with
 *    `?refused=`.
 * 2. Supabase's string is developer language about an instance, addressed to a
 *    sailor who was invited by name. One sailor-facing copy block, `RefusalCopy`,
 *    is reused across all three landings so the *landing* is the only variable.
 *    Supabase's own string appears nowhere in the UI — only in the harness strip,
 *    which is labelled as harness and is not part of any drawing.
 * 3. `access_denied` is also what Google returns when someone taps Cancel, so
 *    there are two non-success paths. `refused=cancel` draws the second one, and
 *    it draws nothing, on purpose.
 */

import React from 'react'
import { GoogleButton } from './shared'

export type RefusalKey = 'none' | 'callback' | 'sheet' | 'toast' | 'cancel'

export const REFUSAL_STATES: { key: RefusalKey; label: string }[] = [
  { key: 'none', label: 'ok' },
  { key: 'callback', label: 'on /callback' },
  { key: 'sheet', label: 'in sheet' },
  { key: 'toast', label: 'as toast' },
  { key: 'cancel', label: 'cancelled' },
]

/** What Supabase actually put on the URL. Recorded, never shown to a sailor. */
export const OBSERVED_ERROR =
  'error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance'

const HEADING = 'You are not on the crew list yet'

/**
 * The sailor's own sentence. Deliberately does not name the address: the error
 * carries no email, so claiming to know which account was refused would be
 * inventing it. "the Google address you just used" is true without it.
 */
const BODY =
  'Layline accounts are made by the boat’s owner. Ask them to add the Google address you just used, then sign in again.'

function KeyMark({ size = 20 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3M18 5l2.5 2.5M15.5 7.5 18 10" />
    </svg>
  )
}

/**
 * Calm, not alarmed. Nothing the sailor did was wrong and nothing is broken, so
 * this is not `--state-danger` on a red card — it is the drawer's own idiom with
 * a single warning-coloured mark.
 */
function RefusalCopy({ align = 'left' }: { align?: 'left' | 'center' }): React.ReactElement {
  const centred = align === 'center'
  return (
    <div style={{ textAlign: centred ? 'center' : 'left' }}>
      <div
        style={{
          color: 'var(--state-warning)',
          display: 'flex',
          justifyContent: centred ? 'center' : 'flex-start',
          marginBottom: '10px',
        }}
      >
        <KeyMark size={centred ? 26 : 20} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: centred ? 'var(--text-xl)' : 'var(--text-lg)',
          color: 'var(--text-primary)',
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1.25,
        }}
      >
        {HEADING}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
          marginTop: '8px',
        }}
      >
        {BODY}
      </div>
    </div>
  )
}

/**
 * LANDING 1 — the callback route renders it.
 * Where the refusal actually arrives, so nothing is passed through state and a
 * reload shows the same thing. The cost: the sailor is on a bare route, off the
 * screen they started from, and has to be given the way back explicitly.
 */
export function RefusalCallbackScreen({ onBack }: { onBack: () => void }): React.ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--surface-base, var(--bg))',
      }}
    >
      <div style={{ width: '100%', maxWidth: '330px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '16px',
            color: 'var(--text-primary)',
            letterSpacing: 'var(--tracking-tight)',
            textAlign: 'center',
            marginBottom: '28px',
          }}
        >
          layline
        </div>
        <RefusalCopy align="center" />
        <button
          onClick={onBack}
          style={{
            width: '100%',
            marginTop: '22px',
            padding: '13px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--blue-500)',
            color: 'var(--text-inverse)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Back to the weather
        </button>
      </div>
    </div>
  )
}

/**
 * LANDING 2 — the copy replaces the sheet's body, on the screen they left.
 * Costs a round trip: the callback has to send them back and reopen the sheet
 * carrying the reason. Reads best, because the refusal answers the button that
 * caused it. Note the button becomes a *retry with a different account*, which
 * is the only useful action left.
 */
export function RefusalSheetBody({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <>
      <RefusalCopy />
      <div style={{ marginTop: '20px' }}>
        <GoogleButton onClick={onRetry} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '10px',
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginTop: '10px',
        }}
      >
        Signed in to the wrong Google account? Try again.
      </div>
    </>
  )
}

/**
 * LANDING 3 — a toast on the screen they left, sheet closed.
 * Cheapest, and the only one that does not take the screen. Also the only one a
 * sailor can miss entirely, or dismiss before reading — for the sheet's *only*
 * failure mode, that is the whole objection.
 */
export function RefusalToast({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: 'calc(96px + env(safe-area-inset-bottom))',
        zIndex: 210,
        maxWidth: '366px',
        margin: '0 auto',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        padding: '14px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div style={{ color: 'var(--state-warning)', flexShrink: 0, marginTop: '1px' }}>
        <KeyMark size={18} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {HEADING}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginTop: '3px',
          }}
        >
          {BODY}
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          color: 'var(--text-muted)',
          flexShrink: 0,
          display: 'flex',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/**
 * Harness only — NOT part of any drawing. It shows what the URL carried and what
 * the sailor is shown instead, because the whole point of keying on `error_code`
 * is invisible in a screenshot.
 *
 * It lives *inside* the switcher panel rather than fixed to the screen, so it
 * moves out of the way with everything else and never covers what is being
 * judged.
 */
export function RefusalHarnessStrip({ refusal }: { refusal: RefusalKey }): React.ReactElement | null {
  if (refusal === 'none') return null
  const cancelled = refusal === 'cancel'
  return (
    <div
      style={{
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--surface-border-hover)',
        background: 'var(--surface-elevated)',
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        lineHeight: 1.6,
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
        what the url carried · never shown to the sailor
      </div>
      <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
        /auth/callback?
        {cancelled ? 'error=access_denied&error_description=User+cancelled' : OBSERVED_ERROR}
      </div>
      <div>
        error_code = {cancelled ? '(absent)' : 'signup_disabled'} &rarr;{' '}
        {cancelled ? 'show nothing, straight back to where they were' : 'show the refusal'}
      </div>
    </div>
  )
}

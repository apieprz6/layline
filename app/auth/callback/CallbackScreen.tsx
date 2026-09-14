import type { CSSProperties, ReactElement, ReactNode } from 'react'
import Link from 'next/link'

interface CallbackScreenProps {
  heading: string
  /** The sailor's own sentence about their situation. */
  children: ReactNode
  /** A `--state-warning` glyph above the heading. The holding state has none. */
  mark?: ReactNode
  /** Whatever this arm can offer. The holding state offers nothing yet. */
  action?: ReactNode
  testId?: string
}

/**
 * The shell every arm of `/auth/callback` that *renders* shares: full screen,
 * centred, no drawer and no dashboard behind it, because the route sits outside
 * the `(app)` group that mounts them (ADR 0021).
 *
 * The drawing is the prototype's winning refusal landing
 * (`app/prototype/account/RefusalA.tsx` on `prototype/lay-119-account-block`,
 * `?refused=callback`): the wordmark, one warning-coloured mark, the copy centred
 * in a 330px column, and a filled action beneath it. **Calm, not alarmed** — no
 * red card and no `--state-danger` — because nothing the sailor did was wrong and
 * nothing is broken.
 *
 * No `'use client'`: the server arms and the browser arm all render it.
 */
export default function CallbackScreen({
  heading,
  children,
  mark,
  action,
  testId,
}: CallbackScreenProps): ReactElement {
  return (
    <main
      data-testid={testId}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
        background: 'var(--surface-base)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '330px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--text-primary)',
            marginBottom: '28px',
          }}
        >
          layline
        </div>

        {mark && (
          <div
            data-testid="callback-mark"
            style={{
              color: 'var(--state-warning)',
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '10px',
            }}
          >
            {mark}
          </div>
        )}

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--text-xl)',
            letterSpacing: 'var(--tracking-tight)',
            lineHeight: 1.25,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {heading}
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '8px 0 0',
          }}
        >
          {children}
        </p>

        {action && (
          <div
            style={{
              marginTop: '22px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '12px',
            }}
          >
            {action}
          </div>
        )}
      </div>
    </main>
  )
}

/**
 * The filled action, exported because the browser arm's retry is a `<button>`
 * rather than a link and the two must not drift apart.
 */
export const filledActionStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '13px 16px',
  borderRadius: 'var(--btn-primary-radius)',
  border: 'none',
  background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 600,
  textAlign: 'center',
  textDecoration: 'none',
  cursor: 'pointer',
}

/**
 * The only exit this route has — every arm that renders is a place with no
 * navigation around it.
 *
 * `quiet` is for the arm that has something better to offer first, so that the
 * screen never carries two filled buttons competing for the same thumb.
 */
export function BackToTheWeather({
  prominence = 'filled',
}: {
  prominence?: 'filled' | 'quiet'
}): ReactElement {
  if (prominence === 'quiet') {
    return (
      <Link
        href="/"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
        }}
      >
        Back to the weather
      </Link>
    )
  }

  return (
    <Link href="/" style={filledActionStyle}>
      Back to the weather
    </Link>
  )
}

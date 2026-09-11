import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'

interface CallbackScreenProps {
  heading: string
  children: ReactNode
  testId?: string
  /** The only exit this route has; the holding state has nowhere to go yet. */
  showBack?: boolean
}

/**
 * The shell every arm of `/auth/callback` that *renders* shares: full screen, no
 * drawer and no dashboard behind it (ADR 0021).
 *
 * A shell, not a design. The **Refused Stranger** screen — the wordmark, the
 * `--state-warning` mark, the copy and the filled action — is LAY-127's, and it
 * fills this in. What is here keeps a stranger off a blank page with a query
 * string in the meantime.
 *
 * No `'use client'`: both the server arm and the browser arm render it.
 */
export default function CallbackScreen({
  heading,
  children,
  testId,
  showBack = true,
}: CallbackScreenProps): ReactElement {
  return (
    <main
      data-testid={testId}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '10px',
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
        maxWidth: '430px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'var(--text-md)',
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        layline
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--text-xl)',
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        {heading}
      </h1>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
        {children}
      </p>

      {showBack && (
        <Link
          href="/"
          style={{
            marginTop: '8px',
            alignSelf: 'flex-start',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          Back to the weather
        </Link>
      )}
    </main>
  )
}

import type { ReactElement } from 'react'

interface EmptyStateProps {
  /** Decorative only, and hidden from assistive tech — the copy carries the meaning. */
  mark: string
  title: string
  detail: string
}

/**
 * A screen, or a tab, that has nothing in it **on purpose**.
 *
 * The shape Wind Data's Model Forecast tab already shipped, extracted so that the
 * two boat performance tabs read as the same thing rather than merely looking
 * like it (ADR 0016 names that tab as the precedent).
 *
 * It is emphatically not a loading state: there is no spinner, no skeleton and
 * nothing that resolves later in the same render. The title says what is absent
 * and the detail says why, so a sailor is never left waiting on a screen that has
 * already finished.
 */
export default function EmptyState({ mark, title, detail }: EmptyStateProps): ReactElement {
  return (
    <div
      data-testid="empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        textAlign: 'center',
        padding: '40px 20px',
      }}
    >
      <div aria-hidden style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>
        {mark}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-primary)',
          marginBottom: '8px',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '300px' }}>
        {detail}
      </div>
    </div>
  )
}

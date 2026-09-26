import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import { COVERAGE } from './fixture'

/**
 * PROTOTYPE ONLY — the two pieces every variant shares, and nothing more.
 *
 * A shared header and a stubbed filter bar are the `<Header>` the prototype skill allows; a
 * shared *layout* would defeat the exercise, so each variant owns its body outright.
 */
export function ScreenHeader({ subtitle }: { subtitle: string }): ReactElement {
  return (
    <header
      style={{
        padding: `${spacing(4)} ${spacing(4)} ${spacing(3)}`,
        borderBottom: '1px solid var(--surface-divider)',
        background: 'var(--surface-raised)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-accent)' }}>‹ Boat performance</span>
      <div style={{ ...EYEBROW_STYLE, marginTop: spacing(2) }}>Overall</div>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}
      >
        Instrument tuning
      </h1>
      <p style={{ margin: `6px 0 0`, fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
        {subtitle}
      </p>
    </header>
  )
}

/**
 * The six-dimension Analysis Filter, stubbed. LAY-144 owns what this actually looks like; every
 * variant needs to reserve the space and state the default, which ADR 0026 fixes as the whole
 * archive rather than a recent window.
 */
export function FilterStub(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: 'var(--surface-raised)',
        border: '1px dashed var(--surface-border)',
        borderRadius: 8,
        padding: '9px 11px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
          Filters · whole archive
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1 }}>
          {COVERAGE.races} races · Sea State unknown on {COVERAGE.unknownSeaStateRaces} · LAY-144
          designs this
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⌄</span>
    </div>
  )
}

/**
 * The line that has to appear somewhere on every variant, because decision 7 is the one thing a
 * sailor could most easily misread this screen as doing.
 */
export function DiagnosticOnlyNote({ body }: { body: string }): ReactElement {
  return (
    <div
      style={{
        borderLeft: '2px solid var(--surface-border)',
        paddingLeft: 10,
        fontSize: 10.5,
        lineHeight: 1.55,
        color: 'var(--text-muted)',
      }}
    >
      {body}
    </div>
  )
}

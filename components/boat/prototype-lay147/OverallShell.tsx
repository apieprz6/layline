import type { ReactElement, ReactNode } from 'react'
import { spacing } from '@/lib/utils/design'

/**
 * PROTOTYPE ONLY — the Overall tab as the mockup draws it, so a variant's teaser can be judged
 * beside the row it has to be told apart from.
 *
 * The shipped Overall tab is still `EmptyState` ("Season figures coming soon"), so there is no
 * real page to host these in. Rather than judge a teaser in a vacuum, this reproduces the
 * mockup's three existing pieces — the Polar hero card, the Sail selection chart row, and the
 * **Instrument calibration** row that opens effort 1's artifact viewer — at the mockup's own
 * density. Only those three are copied; everything else on this route is new.
 *
 * `rowTeaser` slots into the compact row list; `cardTeaser` sits above it, for a variant that
 * argues the new entry is not a row at all.
 */
export default function OverallShell({
  rowTeaser,
  cardTeaser,
  note,
}: {
  rowTeaser?: ReactNode
  cardTeaser?: ReactNode
  /** What this variant is claiming about the teaser, in one line. */
  note: string
}): ReactElement {
  return (
    <div style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--text-primary)',
          }}
        >
          Boat performance
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Races and how the boat stacks up over time.
        </div>
      </div>

      {/* Tabs, drawn not wired — the teaser is what is being judged, not the tab bar. */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--surface-divider)',
          marginBottom: 2,
        }}
      >
        {[
          { label: 'Races', count: '13', active: false },
          { label: 'Overall', count: '—', active: true },
        ].map((tab) => (
          <div
            key={tab.label}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '9px 4px 8px',
              marginBottom: -1,
              borderBottom: `2px solid ${tab.active ? 'var(--blue-500)' : 'transparent'}`,
              fontSize: 12,
              fontWeight: 600,
              color: tab.active ? 'var(--text-accent)' : 'var(--text-muted)',
            }}
          >
            {tab.label}{' '}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, opacity: 0.7 }}>
              {tab.count}
            </span>
          </div>
        ))}
      </div>

      {/* The mockup's hero card, verbatim in spirit: recent-N teaser, tap-through to the detail. */}
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--surface-border)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-md)',
          padding: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              fontWeight: 500,
            }}
          >
            Polar performance · last 5 races
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-accent)',
            }}
          >
            96% ›
          </span>
        </div>
        <svg width="100%" height="46" viewBox="0 0 300 46" role="presentation">
          <polyline
            points="6,34 78,29 150,31 222,20 294,12"
            fill="none"
            stroke="var(--blue-500)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          Trending up — tap to see race data on the polar
        </div>
      </div>

      {cardTeaser}

      <div>
        <Row label="Sail selection chart" pill={{ text: '1 needs review', tone: 'warning' }} />
        {/* The untouched row: opens effort 1's Boat Setup artifact viewer, not a season of data. */}
        <Row label="Instrument calibration" pill={{ text: '1 to check', tone: 'warning' }} />
        {rowTeaser}
      </div>

      <div
        style={{
          fontSize: 10.5,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
          borderTop: '1px dashed var(--surface-border)',
          paddingTop: spacing(2),
        }}
      >
        <strong style={{ color: 'var(--text-secondary)' }}>This variant’s claim:</strong> {note}
      </div>
    </div>
  )
}

/** The mockup's compact row: a label, an optional pill, a chevron, a divider. */
export function Row({
  label,
  sub,
  pill,
  emphasis = false,
}: {
  label: string
  sub?: string
  pill?: { text: string; tone: 'warning' | 'neutral' | 'info' }
  /** A variant may want the new row to stand out from the two above it. */
  emphasis?: boolean
}): ReactElement {
  const tone =
    pill?.tone === 'warning'
      ? { bg: 'rgba(196,112,0,0.12)', fg: 'var(--state-warning)' }
      : pill?.tone === 'info'
        ? { bg: 'var(--blue-muted)', fg: 'var(--text-accent)' }
        : { bg: 'rgba(0,0,0,0.05)', fg: 'var(--text-muted)' }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '11px 2px',
        borderBottom: '1px solid var(--surface-divider)',
        background: emphasis ? 'var(--blue-muted)' : undefined,
        borderRadius: emphasis ? 6 : undefined,
        paddingLeft: emphasis ? 8 : 2,
        paddingRight: emphasis ? 8 : 2,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
            {label}
          </span>
          {pill && (
            <span
              style={{
                background: tone.bg,
                color: tone.fg,
                borderRadius: 9999,
                padding: '1px 7px',
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {pill.text}
            </span>
          )}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>›</span>
    </div>
  )
}

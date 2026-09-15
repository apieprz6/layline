/**
 * A list of findings, told apart by how firmly each one stands in the way.
 *
 * Shared by the upload wizard's Review step and by a race's own page, deliberately: the wizard has
 * to state what the page will state, or Review becomes a cleaner-looking preview of the race than
 * the race turns out to be. Both call `windowFindings`, and both render it through this.
 *
 * Three tones for three severities and no fourth (ADR 0009). A refusal is the only one that reads as
 * a wall; a confirmation asks; a note simply says a true thing and stays out of the way. Nothing
 * here counts or ranks findings — an empty list renders nothing at all, which is the honest answer
 * for a clean recording and the reason a sailor still reads the list on the one that is not.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import type { RaceFinding, RaceFindingSeverity } from '@/types'

/**
 * Foreground, background and border per severity.
 *
 * The foregrounds are `globals.css` tokens. The washes behind them are literal rgba of those same
 * token colours, because a token is one colour and a wash is a colour at 6% — there is nothing in
 * `globals.css` to name them, and inventing two tokens for one screen would be worse than saying so
 * here. The note's wash is the only one that is a token, since a surface already exists for it.
 */
const TONES: Record<RaceFindingSeverity, { fg: string; bg: string; border: string; label: string }> =
  {
    refusal: {
      fg: 'var(--wind-storm)',
      bg: 'rgba(204,17,0,0.06)',
      border: 'rgba(204,17,0,0.35)',
      label: 'Cannot be saved',
    },
    confirmation: {
      fg: 'var(--wind-heavy)',
      bg: 'rgba(196,112,0,0.07)',
      border: 'rgba(196,112,0,0.35)',
      label: 'Worth checking',
    },
    note: {
      fg: 'var(--text-secondary)',
      bg: 'var(--surface-elevated)',
      border: 'var(--surface-border)',
      label: 'Note',
    },
  }

interface RaceFindingsProps {
  findings: readonly RaceFinding[]
  /** Rendered above the list where there is something to head. */
  heading?: string
}

export default function RaceFindings({
  findings,
  heading,
}: RaceFindingsProps): ReactElement | null {
  if (findings.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
      {heading !== undefined && (
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {heading}
        </h3>
      )}

      {findings.map((finding, index) => {
        const tone = TONES[finding.severity]
        return (
          <div
            key={`${finding.severity}-${index}`}
            // A refusal is announced; a note is read when the sailor gets to it, and announcing
            // eight of them would bury the one that matters.
            role={finding.severity === 'refusal' ? 'alert' : undefined}
            style={{
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              borderRadius: 'var(--radius-sm)',
              padding: spacing(3),
              display: 'flex',
              flexDirection: 'column',
              gap: spacing(1),
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
                color: tone.fg,
              }}
            >
              {tone.label}
            </span>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-sm)',
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
              }}
            >
              {finding.message}
            </p>
          </div>
        )
      })}
    </div>
  )
}

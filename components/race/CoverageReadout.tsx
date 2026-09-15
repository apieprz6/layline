/**
 * What a window covers, stated in time.
 *
 * **Never a row count.** "6,337 rows" cannot be held against anything: it is meaningless without the
 * cadence, and it counts a dead feed's verbatim copies as evidence — by that measure one race in the
 * owner's archive is 49.8% fabricated and looks complete (ADR 0009, ADR 0014). "1h 23m, 4m of it a
 * copy of the row before" is something a sailor can check against their memory of the afternoon.
 *
 * The four figures partition the window, so all four are shown rather than a single percentage that
 * would hide which end the missing time was at. A lead gap and a tail gap mean different things: one
 * is a logger started late, the other a logger stopped before the finish, and the second is legal and
 * ordinary on a distance race.
 *
 * Zero-length figures are dropped rather than shown as `0s`. A clean race then reads as its window
 * and its live time, which is what it is.
 */

import type { ReactElement } from 'react'
import { spacing } from '@/lib/utils/design'
import { describeDuration, statesAGap } from '@/services/recordings/coverage'
import type { RaceCoverage } from '@/types'

interface CoverageReadoutProps {
  coverage: RaceCoverage
}

export default function CoverageReadout({ coverage }: CoverageReadoutProps): ReactElement {
  const figures: { label: string; value: string; note?: string }[] = [
    { label: 'Window', value: describeDuration(coverage.window_seconds) },
    { label: 'Recorded', value: describeDuration(coverage.live_seconds) },
  ]

  if (coverage.frozen_seconds > 0) {
    figures.push({
      label: 'Feed dropped',
      value: describeDuration(coverage.frozen_seconds),
      note: 'a copy of the row before',
    })
  }

  // Both edge figures are stated whenever they are non-zero, because the four have to partition the
  // window. What is withheld below the cadence is the *reading* of them: a gap shorter than one
  // sampling interval is where the handle landed between two rows, not a logger that stopped.
  if (coverage.lead_gap_seconds > 0) {
    figures.push({
      label: 'Before the first row',
      value: describeDuration(coverage.lead_gap_seconds),
      note: statesAGap(coverage.lead_gap_seconds, coverage) ? 'never recorded' : undefined,
    })
  }

  if (coverage.tail_gap_seconds > 0) {
    figures.push({
      label: 'After the last row',
      value: describeDuration(coverage.tail_gap_seconds),
      note: statesAGap(coverage.tail_gap_seconds, coverage)
        ? 'the log stopped before the finish'
        : undefined,
    })
  }

  return (
    <dl
      data-testid="coverage-readout"
      style={{
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(1),
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        padding: spacing(3),
      }}
    >
      {figures.map((figure) => (
        <div
          key={figure.label}
          style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2) }}
        >
          <dt style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>
            {figure.label}
          </dt>
          <dd
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-primary)',
            }}
          >
            {figure.value}
          </dd>
          {figure.note !== undefined && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexBasis: '42%' }}>
              {figure.note}
            </span>
          )}
        </div>
      ))}

      {coverage.backwards_steps > 0 && (
        <p
          style={{
            margin: 0,
            marginTop: spacing(1),
            fontSize: 'var(--text-xs)',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
          }}
        >
          The clock steps backwards {coverage.backwards_steps}{' '}
          {coverage.backwards_steps === 1 ? 'time' : 'times'} inside this window, so these figures do
          not add up to its length.
        </p>
      )}
    </dl>
  )
}

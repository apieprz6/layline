'use client'

import type { ReactElement } from 'react'
import { radius, spacing } from '@/lib/utils/design'
import { gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { countOf } from '@/services/analysis/figures'
import type { CoverageLedger, RecordedRowsState } from '@/types'

interface CoverageLedgerPanelProps {
  ledger: CoverageLedger
  /** Read from the buckets currently selected, never held beside them (ADR 0029). */
  recordedRows: RecordedRowsState
  onRecordedRowsChange: (include: boolean) => void
}

/**
 * The **Coverage Ledger**, under the rail, permanently.
 *
 * It states what is matched — rows, and how many **Races** they come from — and then how much of
 * that rests on rows nobody annotated. It is **not** a warning that appears when something looks
 * wrong: half this archive carries no **Sea State** and no **Sail Configuration**, and a figure
 * that only surfaced on narrowing would teach a sailor nothing about the archive they are
 * reasoning about (ADR 0029). Which is also why it has no empty state — an archive with nothing
 * missing says so in a sentence rather than by the panel disappearing.
 *
 * It carries the one switch that admits or excludes unrecorded rows across every dimension at
 * once. The switch is **derived**: its checked state is read from the buckets currently selected,
 * so it and a per-dimension **Not recorded** chip are two controls over one piece of state and
 * cannot disagree. A mixed reading is shown as mixed rather than rounded to on or off, because
 * rounding it would make the ledger lie about one of the dimensions.
 */
export default function CoverageLedgerPanel({
  ledger,
  recordedRows,
  onRecordedRowsChange,
}: CoverageLedgerPanelProps): ReactElement {
  const excluded = ledger.matched_rows - ledger.countable_rows

  return (
    <div
      data-testid="coverage-ledger"
      style={{
        border: '1px solid var(--surface-border)',
        borderLeft: '3px solid var(--state-warning)',
        borderRadius: radius('sm'),
        background: 'var(--surface-elevated)',
        padding: `${spacing(2)} ${spacing(3)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(1),
        fontSize: 'var(--text-xs)',
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
      }}
    >
      <div
        data-testid="coverage-ledger-headline"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}
      >
        {ledgerHeadline(ledger)}
        {ledger.matched_rows < ledger.total_rows && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {' '}
            of {countOf(ledger.total_rows)}
          </span>
        )}
      </div>

      {/* A line ADR 0029 does not itself ask for, added because ADR 0025 does: a screen states
          the coverage behind its figure, and the figure above is over Countable rows while the
          headline is over matched ones. Stated beside the matched count rather than instead of it,
          because matching and counting are independent questions (ADR 0026) — a row excluded by
          ADR 0025 still matched the filter, and a ledger that quietly reported only the countable
          rows would make the Not recorded share below it a share of a different number. */}
      <div style={{ color: 'var(--text-muted)' }}>
        {countOf(ledger.countable_rows)} of those may be read by a figure
        {excluded > 0 && `; ${countOf(excluded)} are frozen, low-speed or mid-maneuver`}.
      </div>

      {ledger.gaps.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>
          {ledger.matched_rows === 0
            ? 'Nothing matches this narrowing.'
            : 'Every row shown carries every annotation.'}
        </div>
      ) : (
        ledger.gaps.map((gap) => (
          <div key={gap.dimension} style={{ color: 'var(--text-muted)' }}>
            {gapSentence(gap)}
          </div>
        ))
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing(2),
          marginTop: spacing(1),
          cursor: 'pointer',
          color: 'var(--text-secondary)',
        }}
      >
        <input
          type="checkbox"
          data-testid="include-unrecorded"
          checked={recordedRows !== 'excluded'}
          // A mixed reading is a real third state and the native control has one. Set rather than
          // rendered, because `indeterminate` is a DOM property with no React attribute.
          ref={(node) => {
            if (node !== null) node.indeterminate = recordedRows === 'mixed'
          }}
          onChange={(event) => onRecordedRowsChange(event.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--blue-500)' }}
        />
        Include rows with nothing recorded
      </label>
    </div>
  )
}

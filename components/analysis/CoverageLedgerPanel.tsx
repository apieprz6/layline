'use client'

import type { ReactElement } from 'react'
import { radius, spacing } from '@/lib/utils/design'
import {
  countableSentence,
  gapSentence,
  ledgerHeadline,
} from '@/services/analysis/coverage-ledger'
import { describeDuration } from '@/services/recordings/coverage'
import type { CoverageLedger, RecordedRowsState } from '@/types'

interface CoverageLedgerPanelProps {
  ledger: CoverageLedger
  /** Read from the buckets currently selected, never held beside them (ADR 0029). */
  recordedRows: RecordedRowsState
  /**
   * What the switch is called, which names the dimensions it acts on.
   *
   * Passed in rather than written here because it is derived from the screen's own dimension
   * registry — `recordedRowsLabel` — so a screen offering fewer dimensions gets a label that is
   * still true about what the switch will do.
   */
  recordedRowsLabel: string
  onRecordedRowsChange: (include: boolean) => void
}

/**
 * The **Coverage Ledger**, under the rail, permanently.
 *
 * It states what is matched — how many **Races**, and how much sailing — and then how much of that
 * rests on sailing nobody annotated. It is **not** a warning that appears when something looks
 * wrong: half this archive carries no **Sea State** and no **Sail Configuration**, and a figure
 * that only surfaced on narrowing would teach a sailor nothing about the archive they are
 * reasoning about (ADR 0029). Which is also why it has no empty state — an archive with nothing
 * missing says so in a sentence rather than by the panel disappearing.
 *
 * **It counts in time and never in rows.** A row count is the database's unit, not a sailor's:
 * "812 rows" cannot be held against anything, which is the argument the Race list already makes
 * for stating a duration (ADR 0009), and because qtVlm logs on events rather than on a clock the
 * count is not even proportional to the afternoon it describes.
 *
 * It carries the one switch that admits or excludes unannotated sailing. The switch is **derived**:
 * its checked state is read from the buckets currently selected, so it and a per-dimension **Not
 * recorded** chip are two controls over one piece of state and cannot disagree. A mixed reading is
 * shown as mixed rather than rounded to on or off, because rounding it would make the ledger lie
 * about one of the dimensions.
 */
export default function CoverageLedgerPanel({
  ledger,
  recordedRows,
  recordedRowsLabel,
  onRecordedRowsChange,
}: CoverageLedgerPanelProps): ReactElement {
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
        {ledger.matched_seconds < ledger.total_seconds && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {' '}
            of {describeDuration(ledger.total_seconds)}
          </span>
        )}
      </div>

      {/* A line ADR 0029 does not itself ask for, added because ADR 0025 does: a screen states
          the coverage behind its figure, and the figure above is over Countable rows while the
          headline is over matched ones. Stated beside the matched count rather than instead of it,
          because matching and counting are independent questions (ADR 0026) — a row excluded by
          ADR 0025 still matched the filter, and a ledger that quietly reported only the countable
          rows would make the Not recorded share below it a share of a different number. */}
      <div style={{ color: 'var(--text-muted)' }}>{countableSentence(ledger)}</div>

      {ledger.gaps.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>
          {ledger.matched_rows === 0
            ? 'Nothing matches this narrowing.'
            : 'All of it carries every annotation.'}
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
        {/* Names the annotations it acts on rather than saying "nothing recorded", which left a
            sailor guessing what they were admitting or turning away. */}
        {recordedRowsLabel}
      </label>
    </div>
  )
}

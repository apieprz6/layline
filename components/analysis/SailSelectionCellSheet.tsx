'use client'

import type { CSSProperties, ReactElement } from 'react'
import { NOTE_STYLE } from '@/components/analysis/chrome'
import {
  AGREEMENT_GLYPHS,
  AGREEMENT_WORDS,
  cellPercent,
  targetTint,
  type CellView,
} from '@/components/analysis/sail-selection-chrome'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { countOf, efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import { cellBreakdown, unreachableReason, type BreakdownLine } from '@/services/analysis/sail-selection'
import { describeDuration } from '@/services/recordings/coverage'
import { UNKNOWN_SAIL_BAND } from '@/services/boat/crossoverSailBands'
import type { AnalysisDimensionSpec } from '@/types'

interface SailSelectionCellSheetProps {
  view: CellView
  dimensions: readonly AnalysisDimensionSpec[]
  domain: PolarDomain | null
  bands: ReadonlyMap<number, string>
  onClose: () => void
}

/**
 * A tapped cell, broken down three ways, in a sheet over the grid.
 *
 * **Every line carries its own percent of target over its own rows**, and that is the whole reason
 * this exists. The archive's own case: 140° at 10 kt reads one figure across a hundred rows, and
 * underneath it the sail actually carried, the water and the hour each tell a different story. A
 * sailor acts on the sub-figure, not on the cell (ADR 0030).
 *
 * It is also the only place on this screen the **sail actually carried** is listed. ADR 0029 drops
 * the "sail used" chip here, because the sail is the chart's own answer — so without these lines
 * the carried sail would be visible nowhere on the screen whose whole subject is which sail to
 * carry.
 *
 * `no target` where a group has no computable one, never the cell's figure borrowed downward.
 */
export default function SailSelectionCellSheet({
  view,
  dimensions,
  domain,
  bands,
  onClose,
}: SailSelectionCellSheetProps): ReactElement {
  const { cell, totals } = view
  const breakdown = cellBreakdown(cell, dimensions)
  const percent = cellPercent(view)
  const reason = unreachableReason(cell, domain)
  const band = cell.sail_number === null ? undefined : bands.get(cell.sail_number)

  return (
    <section data-testid="sail-selection-cell-sheet" style={SHEET_STYLE}>
      <header style={HEAD_STYLE}>
        <h2 style={TITLE_STYLE}>
          {cell.twa}° · {cell.tws} kt
        </h2>
        <button type="button" data-testid="close-cell" onClick={onClose} style={CLOSE_STYLE}>
          Close
        </button>
      </header>

      <p style={CHART_LINE_STYLE}>
        <span aria-hidden="true" style={{ ...SWATCH_STYLE, background: band ?? UNKNOWN_SAIL_BAND }}>
          {cell.sail_number}
        </span>
        Chart says{' '}
        <strong>{cell.recommendation?.definition.label ?? `sail ${cell.sail_number}`}</strong>
      </p>

      {totals.rows === 0 ? (
        <p style={{ ...NOTE_STYLE, marginTop: spacing(2) }}>
          {/* The ghost said as much in words. A cell a narrowing emptied and a cell no Race ever
              reached are different facts, and the second is not a defect (ADR 0014). */}
          {cell.unfiltered_rows > 0
            ? `No Countable sailing here under this filter — ${countOf(cell.unfiltered_rows)} rows with the filter cleared.`
            : 'No race has reached this cell.'}
          {reason !== null && ` ${reason}`}
        </p>
      ) : (
        <>
          <dl style={FACTS_STYLE}>
            <div>
              <dt style={KEY_STYLE}>Coverage</dt>
              <dd style={VALUE_STYLE}>
                {countOf(totals.rows)} rows · {totals.races}{' '}
                {totals.races === 1 ? 'race' : 'races'}
              </dd>
            </div>
            <div>
              <dt style={KEY_STYLE}>% of target</dt>
              <dd
                data-testid="cell-percent"
                style={{
                  ...VALUE_STYLE,
                  display: 'inline-block',
                  padding: percent === null ? undefined : '0 4px',
                  borderRadius: radius('sm'),
                  background: percent === null ? undefined : targetTint(percent, 42),
                }}
              >
                {efficiencyPercent(totals.efficiency.polar_efficiency) ?? 'none'}
              </dd>
            </div>
            <div>
              <dt style={KEY_STYLE}>Agreement</dt>
              <dd data-testid="cell-agreement" style={VALUE_STYLE}>
                {AGREEMENT_GLYPHS[totals.agreement]} {AGREEMENT_WORDS[totals.agreement]}
              </dd>
            </div>
          </dl>

          <p style={NOTE_STYLE}>
            {describeDuration(totals.efficiency.elapsed_seconds)} of scored sailing, as a ratio of
            summed distances rather than a mean of each row&apos;s own percentage (ADR 0036).
            {totals.efficiency.filler_anchored_rows > 0 &&
              ` ${sharePercent(
                totals.efficiency.filler_anchored_rows / totals.efficiency.rows
              )} of it is compared against a cell the Polar manufactured rather than measured.`}
          </p>

          {reason !== null && <p style={NOTE_STYLE}>{reason}</p>}

          {totals.efficiency.rows_without_target > 0 && percent !== null && (
            <p style={NOTE_STYLE}>
              {countOf(totals.efficiency.rows_without_target)} of these rows have no Target Speed
              and are not in the figure.
            </p>
          )}

          {/* The verdict as a proportion, which is what Cell Agreement is. A glyph alone cannot say
              that a mixed cell is 40 rows one way and 3 the other (ADR 0030). */}
          <p data-testid="cell-verdict-tally" style={NOTE_STYLE}>
            {countOf(totals.verdicts.agrees)} agreeing · {countOf(totals.verdicts.differs)}{' '}
            differing · {countOf(totals.verdicts['not-recorded'])} with no sail written down
            {totals.verdicts['off-chart'] > 0 &&
              ` · ${countOf(totals.verdicts['off-chart'])} off-chart, which is never disagreement`}
          </p>

          <Group title="Sail actually carried" lines={breakdown.sails} testId="breakdown-sails" />
          <Group title="Sea state" lines={breakdown.seas} testId="breakdown-seas" />
          <Group title="Time of day" lines={breakdown.times} testId="breakdown-times" />
        </>
      )}
    </section>
  )
}

/** One group of the breakdown. Empty renders nothing: a cell with no rows has no groups. */
function Group({
  title,
  lines,
  testId,
}: {
  title: string
  lines: readonly BreakdownLine[]
  testId: string
}): ReactElement | null {
  if (lines.length === 0) return null

  return (
    <>
      <h3 style={SUBHEAD_STYLE}>{title}</h3>
      <ul data-testid={testId} style={LIST_STYLE}>
        {lines.map((line) => (
          <Line key={line.id} line={line} />
        ))}
      </ul>
    </>
  )
}

/**
 * One line: what it is, how much sailing, and **its own** percent of target.
 *
 * The percent is tinted by band and also printed, because the night-vision theme flattens the four
 * state colours to four reds. `no target` in words rather than a dash, which reads as withheld.
 */
function Line({ line }: { line: BreakdownLine }): ReactElement {
  const percent = line.efficiency.polar_efficiency
  const figure = efficiencyPercent(percent)

  return (
    <li data-testid="breakdown-line" data-line={line.id} style={ROW_STYLE}>
      <span style={LABEL_WRAP_STYLE}>
        <span style={line.about_the_record ? { color: 'var(--text-muted)' } : undefined}>
          {line.label}
        </span>
        {line.verdict !== null && (
          <span style={SUBLABEL_STYLE}>{VERDICT_WORDS[line.verdict]}</span>
        )}
      </span>
      <span style={META_STYLE}>
        <span style={COUNT_STYLE}>{countOf(line.rows)} rows</span>
        <span
          style={{
            ...PERCENT_STYLE,
            background: percent === null ? undefined : targetTint(Math.round(percent * 100), 42),
          }}
        >
          {figure ?? 'no target'}
        </span>
      </span>
    </li>
  )
}

/** What a sail line's verdict is called. The chart is never "wrong", and neither is the crew. */
const VERDICT_WORDS: Record<string, string> = {
  agrees: 'what the chart calls for',
  differs: 'not what the chart calls for',
  'off-chart': 'a sail the chart has no word for',
  'not-recorded': 'never written down',
}

/**
 * A sheet over the grid, as the prototype had it.
 *
 * Fixed to the bottom and scrollable, with room under it for the app's own navigation: a sailor
 * taps a cell halfway down 26 rows, and a panel that pushed the grid would move the cell they were
 * looking at out from under their thumb.
 */
const SHEET_STYLE: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  maxHeight: '62vh',
  overflowY: 'auto',
  padding: `${spacing(4)} ${spacing(4)} 88px`,
  background: 'var(--surface-elevated)',
  borderTop: '1px solid var(--surface-border)',
  boxShadow: 'var(--shadow-lg)',
}

const HEAD_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing(2),
}

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
}

const CLOSE_STYLE: CSSProperties = {
  padding: `${spacing(1)} ${spacing(2)}`,
  borderRadius: radius('full'),
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--surface-border)',
  background: 'var(--surface-raised)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
}

const CHART_LINE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing(2),
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const SWATCH_STYLE: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--surface-border)',
  borderRadius: radius('sm'),
}

const FACTS_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: spacing(2),
  margin: `${spacing(3)} 0 ${spacing(2)}`,
}

const KEY_STYLE: CSSProperties = { ...EYEBROW_STYLE, margin: 0, marginBottom: 2 }

const VALUE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const SUBHEAD_STYLE: CSSProperties = { ...EYEBROW_STYLE, marginTop: spacing(3), marginBottom: 2 }

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing(2),
  padding: '4px 0',
  borderBottom: '1px solid var(--surface-divider)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const LABEL_WRAP_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
}

const SUBLABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
}

const META_STYLE: CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: spacing(2),
}

const COUNT_STYLE: CSSProperties = {
  flexShrink: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
}

const PERCENT_STYLE: CSSProperties = {
  flexShrink: 0,
  minWidth: 56,
  padding: '1px 6px',
  borderRadius: radius('sm'),
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
}

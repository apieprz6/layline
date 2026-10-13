'use client'

import { useMemo, useState, type ReactElement } from 'react'
import AnalysisFilterRail from '@/components/analysis/AnalysisFilterRail'
import { NOTE_STYLE, PILL_STYLE } from '@/components/analysis/chrome'
import CoverageLedgerPanel from '@/components/analysis/CoverageLedgerPanel'
import SeasonPolarPlot from '@/components/analysis/SeasonPolarPlot'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import { filterToSearchParams } from '@/services/analysis/filter-url'
import {
  EMPTY_FILTER,
  matchedRows,
  recordedRowsLabel,
  recordedRowsState,
  setRecordedRows,
} from '@/services/analysis/filter'
import {
  fillerAnchoredShare,
  getPolarPerformanceData,
  vmgFillerAnchoredShare,
} from '@/services/analysis/polar-performance'
import { TARGET_VMG_CAVEAT } from '@/services/analysis/polar-targets'
import { describeDuration } from '@/services/recordings/coverage'
import type {
  AnalysisArchiveRace,
  AnalysisDimensionSpec,
  AnalysisFilter,
  MatchableRow,
  PolarPayload,
} from '@/types'

interface PolarPerformanceContentProps {
  /** Every in-window row of the whole archive. The screen's default is all of it. */
  rows: MatchableRow[]
  races: AnalysisArchiveRace[]
  dimensions: AnalysisDimensionSpec[]
  /** Read from `searchParams` on the server, already sanitised, so a shared link renders at once. */
  initialFilter: AnalysisFilter
  /** Every Polar the rows were scored against, by Version id: what the Polar Plot draws behind them. */
  polars: Record<string, PolarPayload>
}

/**
 * **Polar performance**: the filterable detail screen.
 *
 * ## The filter is client state, mirrored into the URL
 *
 * ADR 0029's decision, and the whole reason this is a Client Component. A tap **never navigates**:
 * the rows arrived once, matching and aggregation are pure, and narrowing is a re-render. Every
 * change is then mirrored into `searchParams` with `history.replaceState`, so a narrowed view is
 * still shareable, bookmarkable and reload-safe.
 *
 * The mirror is written in the change handler and **not** in an effect. An effect would also run
 * on mount, which would rewrite a URL nobody touched — and specifically would silently drop the
 * bucket ids the server's sanitising reader rejected, turning a sailor's bad link into a good one
 * without ever saying the narrowing they asked for did not exist.
 *
 * ## The whole archive, by default
 *
 * No recent-N window. Thirteen Races is the entire evidence base, and a default that quietly
 * showed five of them would make the **Coverage Ledger**'s own totals — the one thing on the
 * screen that exists to say what the figures rest on — describe a slice. A recent window is
 * something the sailor asks for through the `when` chip. The Overall tab's teaser is the one place
 * a recent-5 figure appears, and it says so in words.
 */
export default function PolarPerformanceContent({
  rows,
  races,
  dimensions,
  initialFilter,
  polars,
}: PolarPerformanceContentProps): ReactElement {
  const [filter, setFilter] = useState<AnalysisFilter>(initialFilter)

  const data = getPolarPerformanceData(rows, filter, dimensions)
  const matched = useMemo(() => matchedRows(rows, filter, dimensions), [rows, filter, dimensions])
  const narrowed = data.ledger.matched_rows < rows.length

  function change(next: AnalysisFilter): void {
    setFilter(next)

    const query = filterToSearchParams(next, dimensions).toString()
    const { pathname } = window.location
    window.history.replaceState(null, '', query === '' ? pathname : `${pathname}?${query}`)
  }

  return (
    // One measure for the rail, the ledger, the figures and the picture, rather than three
    // full-bleed bands with a card lost under them on an ultrawide (ADR 0040).
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3), maxWidth: 1180 }}>
      <AnalysisFilterRail
        dimensions={dimensions}
        filter={filter}
        rows={rows}
        races={races}
        onChange={change}
      />

      <CoverageLedgerPanel
        ledger={data.ledger}
        recordedRows={recordedRowsState(filter, dimensions)}
        recordedRowsLabel={recordedRowsLabel(dimensions)}
        onRecordedRowsChange={(include) => change(setRecordedRows(filter, dimensions, include))}
      />

      <div style={{ display: 'flex', gap: spacing(2) }}>
        <Figure
          label="Polar efficiency"
          ratio={data.overall.polar_efficiency}
          filler={fillerAnchoredShare(data.overall)}
          testId="polar-efficiency"
        />
        <Figure
          label="VMG efficiency"
          ratio={data.overall.vmg_efficiency}
          // Its own share, over its own rows. The two figures are summed over different subsets —
          // a row can carry a **Target Speed** and no **Target VMG** — so one share serving both
          // would print a caveat about rows that are not in the number beside it.
          filler={vmgFillerAnchoredShare(data.overall)}
          testId="vmg-efficiency"
        />
      </div>

      <p style={NOTE_STYLE}>
        {/* A ratio of sums, said out loud: a sailor comparing this against an averaged percentage
            somewhere else has to be able to see why they differ (ADR 0036). Stating the evidence as
            *time* is what makes that explanation nearly self-evident — the weighting is the
            denominator — where "across 2,316 rows, each weighted by the seconds it lasted" had to
            spell out the weighting because the unit hid it. */}
        Both figures are total distance over total target distance across{' '}
        {describeDuration(data.overall.elapsed_seconds)} of scored sailing.{' '}
        {TARGET_VMG_CAVEAT}
      </p>

      {/* The picture under the figures (ADR 0040), over the same matched rows. Its focus window
          narrows what is drawn and never what is matched, so nothing above it moves. */}
      <SeasonPolarPlot rows={matched} polars={polars} />

      {narrowed && (
        <button
          type="button"
          data-testid="clear-filter"
          onClick={() => change(EMPTY_FILTER)}
          style={{ ...PILL_STYLE, alignSelf: 'flex-start', background: 'none', fontWeight: 600 }}
        >
          Back to the whole archive
        </button>
      )}
    </div>
  )
}

/**
 * One figure, with what it rests on under it.
 *
 * A **Filler-Anchored** share is printed *beside the number*, never in place of it. ADR 0036 is
 * explicit: a row the boat actually sailed is real however weak the grid cell it is compared
 * against, so the doubt belongs on the figure and never instead of it — no dash, no blank, no
 * hairline.
 *
 * Null is the one case with no number, and it says why in words rather than showing a dash: no row
 * in the match could be scored, which is a different fact from a boat that went nowhere.
 */
function Figure({
  label,
  ratio,
  filler,
  testId,
}: {
  label: string
  ratio: number | null
  /** How much of *this* figure's own rows rest on the Polar's filler. Null where none was summed. */
  filler: number | null
  testId: string
}): ReactElement {
  const percent = efficiencyPercent(ratio)

  return (
    <div
      data-testid={testId}
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: `${spacing(2)} ${spacing(3)}`,
      }}
    >
      <div style={{ ...EYEBROW_STYLE, marginBottom: 2 }}>{label}</div>

      {percent === null ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Nothing in this match could be scored against the Polar.
        </div>
      ) : (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--text-accent)',
          }}
        >
          {percent}
        </div>
      )}

      {filler !== null && filler > 0 && (
        <div
          data-testid={`${testId}-filler-anchored`}
          style={{
            marginTop: 4,
            display: 'inline-block',
            padding: '1px 6px',
            borderRadius: radius('sm'),
            border: '1px dashed var(--state-warning)',
            fontSize: 'var(--text-xs)',
            fontStyle: 'italic',
            color: 'var(--state-warning)',
          }}
        >
          Filler-anchored: {sharePercent(filler)} of this is compared against a cell the Polar
          manufactured rather than measured
        </div>
      )}
    </div>
  )
}

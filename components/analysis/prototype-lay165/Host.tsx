/**
 * PROTOTYPE (LAY-165) — the host. Holds the filter, picks the variant, draws the real chrome.
 *
 * Sub-shape A, as the skill prefers it: the variants are mounted **inside the shipped screen** —
 * the real `AnalysisFilterRail`, the real `CoverageLedgerPanel`, the shipped figures out of
 * `getPolarPerformanceData` — so each one is judged against the density it would really live in,
 * and narrowing the rail really narrows the chart. The only thing this file adds to the screen is
 * the picture underneath, which is the whole question.
 *
 * The per-Race view is the same three charts under the *real* `RaceDetailView`, with a real
 * `raceTrackHeatmap` above them (see `app/dev/polar-picture/page.tsx`), because where the chart
 * goes on that page — under the map in the map's column, or over in the figures column — is one of
 * the things the variants disagree about and neither can be judged in isolation.
 */

'use client'

import { useMemo, useState, type ReactElement } from 'react'
import AnalysisFilterRail from '@/components/analysis/AnalysisFilterRail'
import CoverageLedgerPanel from '@/components/analysis/CoverageLedgerPanel'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
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
import { describeDuration } from '@/services/recordings/coverage'
import type { AnalysisDimensionSpec, AnalysisFilter } from '@/types'

import type { PrototypeArchive, PrototypeRow } from './data'
import { raceCount, unscored } from './data'
import Switcher, { type Variant, type View } from './Switcher'
import VariantA, { VARIANT_A_NAME } from './VariantA'
import VariantB, { VARIANT_B_NAME } from './VariantB'
import VariantC, { VARIANT_C_NAME } from './VariantC'

const NAMES: Record<Variant, string> = {
  A: VARIANT_A_NAME,
  B: VARIANT_B_NAME,
  C: VARIANT_C_NAME,
}

interface HostProps {
  archive: PrototypeArchive
  dimensions: readonly AnalysisDimensionSpec[]
  initialFilter: AnalysisFilter
  initialVariant: Variant
  initialView: View
  /** Which Race the `race` view is of. One of `archive.tracks`' keys. */
  race: string
  /** The real Race Track Heatmap section for that Race, rendered by the server. */
  trackSection: ReactElement
}

export default function Host({
  archive,
  dimensions,
  initialFilter,
  initialVariant,
  initialView,
  race,
  trackSection,
}: HostProps): ReactElement {
  const [filter, setFilter] = useState<AnalysisFilter>(initialFilter)
  const [variant, setVariant] = useState<Variant>(initialVariant)
  const [view, setView] = useState<View>(initialView)
  /*
   * No wind-band state here any more. The rose used to take one and it was a second control over
   * an axis the rail already owns — see `VariantA`'s header. The rail narrows the rows; each chart
   * reads the certificate where those rows are.
   */

  /** The whole archive's rows, for the per-Race view's reference ghost. */
  const everything = archive.rows

  const matched = useMemo(
    () => matchedRows(everything, filter, dimensions) as PrototypeRow[],
    [everything, filter, dimensions]
  )
  const data = useMemo(
    () => getPolarPerformanceData(everything, filter, dimensions),
    [everything, filter, dimensions]
  )

  const raceRows = useMemo(
    () => everything.filter((row) => row.race_id === race),
    [everything, race]
  )

  function url(next: { variant?: Variant; view?: View }): void {
    const params = new URLSearchParams(window.location.search)
    if (next.variant !== undefined) params.set('variant', next.variant)
    if (next.view !== undefined) params.set('view', next.view)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }

  const chart = (rows: readonly PrototypeRow[], mode: View, reference: readonly PrototypeRow[] | null) => {
    const props = { archive, rows, reference, mode: mode === 'teaser' ? ('teaser' as const) : mode === 'race' ? ('race' as const) : ('season' as const) }

    if (variant === 'A') return <VariantA {...props} />
    if (variant === 'B') return <VariantB {...props} />
    return <VariantC {...props} />
  }

  return (
    <>
      <Switcher
        variant={variant}
        view={view}
        names={NAMES}
        onVariant={(next) => {
          setVariant(next)
          url({ variant: next })
        }}
        onView={(next) => {
          setView(next)
          url({ view: next })
        }}
      />

      {view === 'season' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AnalysisFilterRail
            dimensions={dimensions}
            filter={filter}
            rows={everything}
            races={archive.races}
            onChange={setFilter}
          />

          <CoverageLedgerPanel
            ledger={data.ledger}
            recordedRows={recordedRowsState(filter, dimensions)}
            recordedRowsLabel={recordedRowsLabel(dimensions)}
            onRecordedRowsChange={(include) =>
              setFilter(setRecordedRows(filter, dimensions, include))
            }
          />

          <Figures data={data} />

          {/* The variant, in the place LAY-155 left the band list. */}
          {chart(matched, 'season', null)}

          <Unscored rows={matched} />

          {matched.length < everything.length && (
            <button
              type="button"
              onClick={() => setFilter(EMPTY_FILTER)}
              style={{
                alignSelf: 'flex-start',
                padding: '5px 10px',
                borderRadius: 999,
                border: '1px solid var(--surface-border)',
                background: 'none',
                color: 'var(--text-accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
            >
              Back to the whole archive
            </button>
          )}
        </div>
      )}

      {view === 'race' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,620px)_minmax(0,1fr)] xl:items-start xl:gap-8">
          {/* The same two-column split `RaceDetailView` uses below its boundary, so the question
              "which column does the chart belong in" is asked under the real layout. */}
          {trackSection}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            <h2 style={HEADING}>Boat performance vs. polars</h2>
            {chart(raceRows, 'race', everything)}
            <Unscored rows={raceRows} />
          </div>
        </div>
      )}

      {view === 'teaser' && (
        <div
          style={{
            maxWidth: 360,
            padding: 14,
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-raised)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={HEADING}>Polar performance</span>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)' }}>
            {efficiencyPercent(data.overall.polar_efficiency)}
          </strong>
          {chart(recentFive(everything, archive), 'teaser', null)}
          <span style={NOTE}>
            Last five races · {describeDuration(data.overall.elapsed_seconds)} of scored sailing
          </span>
        </div>
      )}
    </>
  )
}

/** The teaser's own window: the five newest Races, by their own day (ADR 0029's recent-N). */
function recentFive(rows: readonly PrototypeRow[], archive: PrototypeArchive): PrototypeRow[] {
  const newest = new Set(
    [...archive.races]
      .sort((left, right) => right.day.localeCompare(left.day))
      .slice(0, 5)
      .map((race) => race.id)
  )

  return rows.filter((row) => newest.has(row.race_id))
}

/** The shipped figures, in the shipped words — so the chart below has something to agree with. */
function Figures({ data }: { data: ReturnType<typeof getPolarPerformanceData> }): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {(
        [
          ['Polar efficiency', data.overall.polar_efficiency, fillerAnchoredShare(data.overall)],
          ['VMG efficiency', data.overall.vmg_efficiency, vmgFillerAnchoredShare(data.overall)],
        ] as const
      ).map(([label, ratio, filler]) => (
        <div
          key={label}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-raised)',
          }}
        >
          <div style={HEADING}>{label}</div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--text-accent)',
            }}
          >
            {efficiencyPercent(ratio) ?? '—'}
          </div>
          {filler !== null && filler > 0 && (
            <div style={{ ...NOTE, color: 'var(--state-warning)', fontStyle: 'italic' }}>
              {sharePercent(filler)} filler-anchored
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * What is in the match and not in the picture, always, in words.
 *
 * ADR 0033's own rule on the track one screen over — *"178 of 258 rows are drawn but not scored"* —
 * applied to a chart that cannot draw an unscored row at all. A row with no figure has no angle to
 * sit at and no percentage to be coloured by, so the only honest place for it is a sentence.
 */
function Unscored({ rows }: { rows: readonly PrototypeRow[] }): ReactElement | null {
  const reasons = unscored(rows)
  const total = Object.values(reasons).reduce((sum, count) => sum + count, 0)
  if (total === 0) return null

  const WORDS: Record<string, string> = {
    frozen: 'frozen — the feed repeated the row above',
    low_speed: 'under 2 knots',
    maneuver_window: 'inside a manoeuvre window',
    off_the_grid: 'off the certificate’s axes',
    no_reading: 'no wind reading at all',
  }

  return (
    <p style={NOTE} data-testid="unscored">
      {total} of {rows.length} matched rows carry no figure and so are nowhere in the picture:{' '}
      {Object.entries(reasons)
        .sort((left, right) => right[1] - left[1])
        .map(([reason, count]) => `${count} ${WORDS[reason] ?? reason}`)
        .join(', ')}
      . They come from {raceCount(rows)} race{raceCount(rows) === 1 ? '' : 's'}.
    </p>
  )
}

const HEADING = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'var(--text-muted)',
}

const NOTE = { margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }

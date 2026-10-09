'use client'

import { useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import AnalysisFilterRail from '@/components/analysis/AnalysisFilterRail'
import { NOTE_STYLE, PILL_STYLE } from '@/components/analysis/chrome'
import CoverageLedgerPanel from '@/components/analysis/CoverageLedgerPanel'
import SailSelectionCellSheet from '@/components/analysis/SailSelectionCellSheet'
import SailSelectionGrid, { SailSelectionThumbnails } from '@/components/analysis/SailSelectionGrid'
import {
  AGREEMENT_GLYPHS,
  NO_FIGURE,
  SWATCH_STYLE,
  agreementTint,
  coverageTint,
  sailSelectionLayer,
  targetTint,
  type SailSelectionLayer,
} from '@/components/analysis/sail-selection-chrome'
import { radius, spacing } from '@/lib/utils/design'
import { countOf } from '@/services/analysis/figures'
import { filterToSearchParams } from '@/services/analysis/filter-url'
import {
  EMPTY_FILTER,
  recordedRowsLabel,
  recordedRowsState,
  setRecordedRows,
} from '@/services/analysis/filter'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import {
  cellKey,
  cellViews,
  getSailSelectionData,
  gridCoverage,
  unreachableRegions,
  type GridCoverage,
} from '@/services/analysis/sail-selection'
import { sailBands } from '@/services/boat/crossoverSailBands'
import type {
  AnalysisArchiveRace,
  AnalysisDimensionSpec,
  AnalysisFilter,
  CrossoverChartPayload,
  MatchableRow,
} from '@/types'

interface SailSelectionContentProps {
  /** Every in-window row of the whole archive. The screen's default is all of it. */
  rows: MatchableRow[]
  races: AnalysisArchiveRace[]
  /** Five dimensions, with no "sail used": the sail is the chart's own answer (ADR 0029). */
  dimensions: AnalysisDimensionSpec[]
  /** Read from `searchParams` on the server, already sanitised, so a shared link renders at once. */
  initialFilter: AnalysisFilter
  /** The boat's current **Crossover Chart**: the grid itself, drawn as it stands. */
  chart: CrossoverChartPayload
  /**
   * The current **Polar**'s own domain, or null where it could not be read.
   *
   * Only the bounds travel, never the grid: this answers "can a cell ever hold a figure", and a
   * screen handed the Polar's axes would be a step from resampling one grid onto the other, which
   * ADR 0028 forbids in both directions. Each row's own Target Speed already came from the Polar
   * its Race was sailed under (ADR 0012) and is not re-derived here.
   */
  domain: PolarDomain | null
  /**
   * The **Crossover Chart Version** `chart` is the payload of, or null where it is not known.
   *
   * Agreement is an integer comparison valid only inside one Version (ADR 0038), so this is what
   * lets the grid place a row from another Version without judging it. Null claims nothing either
   * way, which is what a fixture or a caller with no Version to hand should say.
   */
  chartVersionId?: string | null
}

/**
 * The **Sail Selection Screen**: the boat's Crossover Chart, with its season laid over it.
 *
 * ## Four layers, one grid, thumbnails as the switcher
 *
 * Coverage, percent of target and agreement do not fit in a cell 27px wide, so the screen draws
 * the same grid four times and a cell prints one number (ADR 0030). The **Chart** layer is never
 * narrowed and never ghosted: the chart's recommendation does not become less true because no Race
 * reached that cell.
 *
 * ## The filter is client state, mirrored into the URL
 *
 * ADR 0029, exactly as the Polar performance screen does it, and the whole reason this is a Client
 * Component. A tap **never navigates**: the rows arrived once, the aggregation is pure, and
 * narrowing is a re-render. The mirror is written in the change handler and never in an effect —
 * an effect would also run on mount and would silently rewrite a sailor's bad link into a good
 * one, dropping the narrowing they asked for without ever saying it did not exist.
 *
 * The **layer** and the **open cell** are deliberately *not* mirrored. They are where a sailor is
 * looking rather than which rows they are reasoning about, and a URL that changed on every glance
 * would make the back button a history of glances.
 */
export default function SailSelectionContent({
  rows,
  races,
  dimensions,
  initialFilter,
  chart,
  domain,
  chartVersionId = null,
}: SailSelectionContentProps): ReactElement {
  const [filter, setFilter] = useState<AnalysisFilter>(initialFilter)
  const [layer, setLayer] = useState<SailSelectionLayer>('chart')
  const [selected, setSelected] = useState<string | null>(null)

  const bands = useMemo(() => sailBands(chart), [chart])

  // 338 cells folded **once** per narrowing and read by five grids — four thumbnails and the
  // full-size one — plus the summary line. Everything downstream reads the fold rather than
  // redoing it, which is what `cellViews` and a `gridCoverage` over views are for.
  const { data, views, coverage, reasons } = useMemo(() => {
    const selection = getSailSelectionData(rows, filter, dimensions, chart, domain, chartVersionId)
    const folded = cellViews(selection.cells)

    return {
      data: selection,
      views: folded,
      coverage: gridCoverage(folded),
      // The legend's own sentences, read off the cells rather than asserted: a chart whose angle
      // axis ran past the Polar's would get a different reason, and a legend naming only one of
      // the four would be false there. Deduplicated by region, so this chart's 25 and 30 kt
      // columns are one sentence between them.
      reasons: unreachableRegions(selection.cells, domain),
    }
  }, [rows, filter, dimensions, chart, domain, chartVersionId])

  const active = sailSelectionLayer(layer)
  const open = views.find((view) => cellKey(view.cell.row, view.cell.column) === selected) ?? null
  const narrowed = data.ledger.matched_rows < rows.length

  function change(next: AnalysisFilter): void {
    setFilter(next)

    const query = filterToSearchParams(next, dimensions).toString()
    const { pathname } = window.location
    window.history.replaceState(null, '', query === '' ? pathname : `${pathname}?${query}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
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

      <SailSelectionThumbnails
        views={views}
        tws_axis={data.tws_axis}
        layer={layer}
        bands={bands}
        onSelect={(next) => {
          setLayer(next)
          // The open cell stays open across a layer change: the sailor is reading one cell four
          // ways, which is the comparison the small multiples exist to make.
        }}
      />

      <div>
        <h2 data-testid="sail-selection-layer-title" style={LAYER_TITLE_STYLE}>
          {active.name}
        </h2>
        <p style={{ ...NOTE_STYLE, marginTop: 2 }}>{active.blurb}</p>
      </div>

      <SailSelectionGrid
        views={views}
        twa_axis={data.twa_axis}
        tws_axis={data.tws_axis}
        layer={active}
        bands={bands}
        selected={selected}
        onSelect={setSelected}
      />

      <p data-testid="sail-selection-summary" style={SUMMARY_STYLE}>
        {summary(layer, coverage)}
      </p>

      {/* ADR 0025 asks every screen to state what its figures leave out, wherever there is room.
          This is that room: the rows the Countable rule excluded, and the two ways a row reaches no
          cell at all — no wind recorded, or below the chart's own first row or column. */}
      <p style={NOTE_STYLE}>
        {countOf(data.excluded_rows)} matched rows are excluded as Frozen, Low-Speed or inside a
        Maneuver Window.{' '}
        {data.rows_unplaced > 0 &&
          `${countOf(data.rows_unplaced)} recorded no wind angle or speed, so they belong to no cell. `}
        {data.rows_off_grid > 0 &&
          `${countOf(data.rows_off_grid)} sailed below the chart's own first row or column, where it makes no recommendation to have agreed or disagreed with.`}
      </p>

      <Legend layer={layer} coverage={coverage} reasons={reasons} />

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

      {open !== null && (
        <SailSelectionCellSheet
          view={open}
          dimensions={dimensions}
          domain={domain}
          bands={bands}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/** The one line under the grid: what this layer is actually over. */
function summary(layer: SailSelectionLayer, coverage: GridCoverage): string {
  const ghosts = coverage.ghosted > 0 ? ` ${coverage.ghosted} were emptied by this filter.` : ''

  if (layer === 'chart') {
    return `${coverage.cells} cells, and the chart’s recommendation in every one of them.`
  }
  if (layer === 'coverage') {
    return `${coverage.reached} of ${coverage.cells} cells have Countable sailing in them.${ghosts}`
  }
  if (layer === 'target') {
    // Phrased so no clause has to agree with its own number, since every one of the three can be
    // one cell on a young archive and 150 on this one.
    // The third clause is dropped rather than zeroed where no Polar was read: the question has no
    // answer there, and `0 where none can ever exist` would be an answer.
    const structural =
      coverage.unreachable === null
        ? ' · no Polar read, so where none can exist is unknown'
        : ` · ${coverage.unreachable} where none can ever exist`

    return (
      `${coverage.with_figure} of ${coverage.cells} cells carry a percent of target · ` +
      `${coverage.rows_without_figure} with sailing and no computable one${structural}.${ghosts}`
    )
  }

  return `${coverage.mixed} cells hold both agreeing and differing rows.${ghosts}`
}

/** What the colours and the glyphs mean, in words, beside a swatch that is never the only carrier. */
function Legend({
  layer,
  coverage,
  reasons,
}: {
  layer: SailSelectionLayer
  coverage: GridCoverage
  /** Why each unreachable cell is unreachable, deduplicated — never one asserted reason. */
  reasons: readonly string[]
}): ReactElement | null {
  if (layer === 'chart') return null

  return (
    <ul data-testid="sail-selection-legend" style={LEGEND_STYLE}>
      {layer === 'coverage' && (
        <>
          <li>
            <Swatch fill={coverageTint(1)} /> one race <Swatch fill={coverageTint(4)} /> a few{' '}
            <Swatch fill={coverageTint(9)} /> nine or more — one hue, more of it with more races.
          </li>
          <li>The number is the race count. A tapped cell gives the rows behind it.</li>
        </>
      )}

      {layer === 'target' && (
        <>
          <li>
            <Swatch fill={targetTint(80)} /> under 85 <Swatch fill={targetTint(90)} /> 85–94{' '}
            <Swatch fill={targetTint(100)} /> 95–104 <Swatch fill={targetTint(110)} /> 105 and over
            — above target gets its own band, because it is either genuinely fast or a calibration
            story.
          </li>
          <li>
            <em>Italic</em> means filler-anchored: the figure is compared against a cell the Polar
            manufactured rather than measured. Shown with the doubt attached, never withheld.
          </li>
          <li>
            <Swatch fill="var(--surface-divider)" /> {NO_FIGURE} is no Target Speed.{' '}
            {/* Null is not nought. With no Polar read, how much of the grid can never hold a
                figure has no answer — and printing `0` there would be a plausible number standing
                in for a missing one, which is the one thing AGENTS.md forbids outright. */}
            {coverage.unreachable === null
              ? 'How much of the grid can never hold one is unknown here, because the boat’s Polar could not be read.'
              : `${coverage.unreachable} of the ${coverage.cells} cells can never hold one.`}{' '}
            {reasons.join(' ')} Elsewhere a {NO_FIGURE} means this cell&apos;s own rows could not be
            scored; a tapped cell says which.
          </li>
        </>
      )}

      {layer === 'agreement' && (
        <>
          <li>
            <Swatch fill={agreementTint('agrees')} /> {AGREEMENT_GLYPHS.agrees} the sail carried was
            the one printed
          </li>
          <li>
            <Swatch fill={agreementTint('differs')} /> {AGREEMENT_GLYPHS.differs} a different sail on
            every annotated row — worth a look, not a verdict on the chart
          </li>
          <li>
            <Swatch fill={agreementTint('mixed')} /> {AGREEMENT_GLYPHS.mixed} both, across the rows
            in one cell
          </li>
          <li>
            <Swatch fill={agreementTint('not-recorded')} /> {AGREEMENT_GLYPHS['not-recorded']} rows
            here, and no row&apos;s Sail Configuration was written down
          </li>
          <li>
            <Swatch fill={agreementTint('off-chart')} /> {AGREEMENT_GLYPHS['off-chart']} a sail the
            chart has no word for — the vocabulary running out, and never disagreement
          </li>
          <li>
            <Swatch fill={agreementTint('other-version')} /> {AGREEMENT_GLYPHS['other-version']}{' '}
            sailed under a different Crossover Chart, where the same sail number means a different
            sail — drawn where it sailed, and not judged against this chart
          </li>
        </>
      )}

      <li>
        A cell with a dotted edge held sailing before this filter and holds none under it. The Chart
        layer never filters.
      </li>
    </ul>
  )
}

function Swatch({ fill }: { fill: string }): ReactElement {
  return <span aria-hidden="true" style={{ ...SWATCH_STYLE, background: fill }} />
}

const LAYER_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
}

const SUMMARY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
}

const LEGEND_STYLE: CSSProperties = {
  margin: 0,
  paddingLeft: spacing(4),
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(1),
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
  borderRadius: radius('sm'),
}

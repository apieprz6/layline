import { efficiencyPercent } from '@/services/analysis/figures'
import { fillerAnchoredShare, isFillerFlagged } from '@/services/analysis/polar-performance'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import {
  AGREEMENT_WORDS,
  SAIL_VERDICT_WORDS,
  cellBreakdown,
  cellKey,
  cellNotes,
  cellViews,
  chartAgreement,
  chartSays,
  emptyRegionSentence,
  getSailSelectionData,
  gridCoverage,
  judgeableShare,
  placementSentence,
  regionViews,
  sailSelectionExclusions,
  unreachableReason,
  unreachableRegions,
  verdictShares,
  type BreakdownLine,
  type CellAgreement,
  type CellTotals,
  type SailRegionView,
  type SailSelectionCellView,
} from '@/services/analysis/sail-selection'
import { namedSailRegions } from '@/services/boat/crossoverSailRegions'
import { filterAsArgument, offeredDimensions } from './analysis-filter'
import { coverageLedgerAnswer } from './coverage-ledger'
import type {
  AnalysisDimensionSpec,
  AnalysisFilter,
  CrossoverChartPayload,
  EfficiencyAggregate,
  MatchableRow,
  McpCellAgreement,
  McpPolarPerformanceFigure,
  McpSailBreakdownLine,
  McpSailRegion,
  McpSailSelectionCellArgument,
  McpSailSelectionCellDetail,
  McpSailVerdict,
  McpUnreachedCell,
  SailSelectionAnswer,
} from '@/types'

/** The Crossover Chart the grid is drawn from: the Version in force, as the screen reads it. */
export interface ChartInForce {
  payload: CrossoverChartPayload
  versionId: string | null
  versionNumber: number | null
}

/** A cell by its grid index, once `cellFromArgument` has found it. */
export interface GridCell {
  row: number
  column: number
}

export type CellReading = { ok: true; cell: GridCell } | { ok: false; message: string }

/**
 * The `cell` argument as a cell of this chart, or a refusal naming the axes that would have worked.
 * Exact axis values only: a cell is named the way the grid's own headings name it.
 */
export function cellFromArgument(argument: McpSailSelectionCellArgument, chart: CrossoverChartPayload): CellReading {
  const row = chart.twa_axis.indexOf(argument.twa)
  const column = chart.tws_axis.indexOf(argument.tws)
  if (row !== -1 && column !== -1) return { ok: true, cell: { row, column } }

  return {
    ok: false,
    message:
      `The Crossover Chart has no cell at ${argument.twa}° and ${argument.tws} kt. A cell is named by the ` +
      `chart's own axis values: twa one of ${chart.twa_axis.join(', ')} degrees, and tws one of ` +
      `${chart.tws_axis.join(', ')} knots.`,
  }
}

function figure(aggregate: EfficiencyAggregate): McpPolarPerformanceFigure {
  const filler = fillerAnchoredShare(aggregate)
  return {
    ratio: aggregate.polar_efficiency,
    percent: efficiencyPercent(aggregate.polar_efficiency),
    scoredSeconds: aggregate.elapsed_seconds,
    fillerAnchoredShare: filler,
    fillerAnchored: isFillerFlagged(filler),
  }
}

/** The screen's words for a reached cell's Cell Agreement; an unreached one gives its reason. */
const REACHED_AGREEMENT_WORDS = Object.fromEntries(
  (Object.entries(AGREEMENT_WORDS) as [CellAgreement, string][]).filter(([agreement]) => agreement !== 'no-rows')
) as Record<McpSailVerdict | 'mixed', string>

/** A reached cell's or region's Cell Agreement, as proportions of its rows. */
function reachedAgreement(totals: CellTotals): McpCellAgreement {
  return {
    agreement: totals.agreement as McpCellAgreement['agreement'],
    rows: totals.rows,
    races: totals.races,
    verdicts: verdictShares(totals),
    polarEfficiency: figure(totals.efficiency),
  }
}

function cellAgreement(totals: CellTotals, reason: () => string): McpCellAgreement | McpUnreachedCell {
  return totals.agreement === 'no-rows' ? { agreement: 'unreached', reason: reason() } : reachedAgreement(totals)
}

function regionAnswer(region: SailRegionView, domain: PolarDomain | null): McpSailRegion {
  return {
    region: region.index,
    sail: region.name,
    sailNumber: region.sail_number,
    cellCount: region.views.length,
    reachedCells: region.reached.length,
    cellAgreement: cellAgreement(region.totals, () => emptyRegionSentence(region)),
    cells: region.reached.map(({ cell, totals }) => {
      const noTarget = unreachableReason(cell, domain)
      return {
        twaDegrees: cell.twa,
        twsKnots: cell.tws,
        ...reachedAgreement(totals),
        ...(noTarget === null ? {} : { noTargetReason: noTarget }),
      }
    }),
    unreached: region.unreached.map(({ reason, views }) => ({
      reason,
      cells: views.map(({ cell }) => ({ twaDegrees: cell.twa, twsKnots: cell.tws })),
    })),
  }
}

function lineAnswer(line: BreakdownLine): McpSailBreakdownLine {
  return {
    id: line.id,
    label: line.label,
    aboutTheRecord: line.about_the_record,
    rows: line.rows,
    polarEfficiency: figure(line.efficiency),
    ...(line.verdict === null ? {} : { verdict: line.verdict }),
  }
}

/** One cell as the cell sheet states it: its figures, its sentences and its breakdown. */
function cellDetail(
  view: SailSelectionCellView,
  region: number,
  dimensions: readonly AnalysisDimensionSpec[],
  domain: PolarDomain | null
): McpSailSelectionCellDetail {
  const { cell, totals } = view
  const { notes, tally } = cellNotes(view, domain)
  const breakdown = cellBreakdown(cell, dimensions)

  return {
    twaDegrees: cell.twa,
    twsKnots: cell.tws,
    region,
    chartSays: chartSays(cell),
    sailNumber: cell.sail_number,
    cellAgreement: cellAgreement(totals, () => notes[0]),
    statement: tally === null ? notes : [...notes, tally],
    breakdown:
      totals.agreement === 'no-rows'
        ? null
        : {
            sails: breakdown.sails.map(lineAnswer),
            seas: breakdown.seas.map(lineAnswer),
            times: breakdown.times.map(lineAnswer),
          },
  }
}

/**
 * The **Sail Selection Screen** as it states itself, for the MCP `sail_selection` tool.
 *
 * Pure, and built on nothing but the screen's own functions: `getSailSelectionData` and the folds
 * beside it for the figures, `namedSailRegions` for the regions the Chart layer outlines, and the
 * cell sheet's own `cellNotes` for the words. It holds no rule of its own (ADR 0042, *A tool
 * inherits every rule and owns none*); it renames for a model. The caller hands in the rows
 * `readAnalysisArchive` read and the dimensions the screen would build from them.
 *
 * With no `cell`, the whole chart: Chart Agreement, and every region and cell with its Cell
 * Agreement. With one (already through `cellFromArgument`), that cell's sheet, breakdown included.
 */
export function sailSelectionAnswer(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  chart: ChartInForce,
  domain: PolarDomain | null,
  cell: GridCell | null
): SailSelectionAnswer {
  const { payload } = chart
  const data = getSailSelectionData(rows, filter, dimensions, payload, domain, chart.versionId)
  const views = cellViews(data.cells)
  const coverage = gridCoverage(views)
  const regions = regionViews(views, namedSailRegions(payload))
  const agreement = chartAgreement(data.cells)

  const key = cell === null ? null : cellKey(cell.row, cell.column)
  const opened = regions.flatMap((region) =>
    region.views
      .filter((view) => cellKey(view.cell.row, view.cell.column) === key)
      .map((view) => cellDetail(view, region.index, dimensions, domain))
  )

  return {
    filter: filterAsArgument(filter),
    crossoverChart: {
      version: chart.versionNumber,
      twaAxisDegrees: [...payload.twa_axis],
      twsAxisKnots: [...payload.tws_axis],
    },
    coverageLedger: coverageLedgerAnswer(data.ledger, sailSelectionExclusions(data.ledger)),
    grid: {
      cells: coverage.cells,
      reached: coverage.reached,
      withFigure: coverage.with_figure,
      rowsWithoutFigure: coverage.rows_without_figure,
      unreachable: coverage.unreachable,
      mixed: coverage.mixed,
      emptiedByFilter: coverage.ghosted,
      noTargetRegions: unreachableRegions(data.cells, domain),
      placement: placementSentence(data),
    },
    dimensions: offeredDimensions(dimensions),
    words: { cellAgreement: REACHED_AGREEMENT_WORDS, sailVerdict: SAIL_VERDICT_WORDS },
    chartAgreement:
      cell !== null
        ? null
        : {
            share: agreement.agreement,
            percent: efficiencyPercent(agreement.agreement),
            placedRows: agreement.placed_rows,
            judgeableRows: agreement.judgeable_rows,
            judgeableShare: judgeableShare(agreement),
            following: figure(agreement.following),
            differing: figure(agreement.differing),
          },
    regions: cell !== null ? null : regions.map((region) => regionAnswer(region, domain)),
    cell: opened[0] ?? null,
  }
}

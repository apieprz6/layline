import { countableSentence, gapSentence, ledgerHeadline, notCountableSeconds } from '@/services/analysis/coverage-ledger'
import { efficiencyPercent } from '@/services/analysis/figures'
import { fillerAnchoredShare, isFillerFlagged } from '@/services/analysis/polar-performance'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import {
  AGREEMENT_WORDS,
  SAIL_VERDICT_WORDS,
  cellBreakdown,
  cellKey,
  cellScoredSentence,
  cellViews,
  cellWithoutTargetSentence,
  chartAgreement,
  chartSays,
  emptyCellSentence,
  emptyRegionSentence,
  getSailSelectionData,
  gridCoverage,
  judgeableShare,
  placementSentence,
  regionViews,
  unreachableReason,
  unreachableRegions,
  verdictShares,
  verdictTallySentence,
  type BreakdownLine,
  type CellTotals,
  type CellVerdict,
  type SailSelection,
  type SailSelectionCellView,
} from '@/services/analysis/sail-selection'
import { chartSailRegions } from '@/services/boat/crossoverSailRegions'
import { filterAsArgument, offeredDimensions } from './analysis-filter'
import type {
  AnalysisDimensionSpec,
  AnalysisFilter,
  CrossoverChartPayload,
  EfficiencyAggregate,
  MatchableRow,
  McpCellAgreement,
  McpCoverageLedger,
  McpPolarPerformanceFigure,
  McpSailBreakdownLine,
  McpSailRegion,
  McpSailSelectionCell,
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
const REACHED_AGREEMENT_WORDS: Record<McpSailVerdict | 'mixed', string> = {
  agrees: AGREEMENT_WORDS.agrees,
  differs: AGREEMENT_WORDS.differs,
  mixed: AGREEMENT_WORDS.mixed,
  'not-recorded': AGREEMENT_WORDS['not-recorded'],
  'off-chart': AGREEMENT_WORDS['off-chart'],
  'other-version': AGREEMENT_WORDS['other-version'],
}

/** The five row verdicts, in the order the sheet's tally reads them. */
const VERDICTS: readonly CellVerdict[] = ['agrees', 'differs', 'not-recorded', 'off-chart', 'other-version']

function cellAgreement(totals: CellTotals, reason: () => string): McpCellAgreement | McpUnreachedCell {
  const shares = verdictShares(totals)
  if (totals.agreement === 'no-rows' || shares === null) return { agreement: 'unreached', reason: reason() }

  return {
    agreement: totals.agreement,
    rows: totals.rows,
    races: totals.races,
    verdicts: VERDICTS.filter((verdict) => totals.verdicts[verdict] > 0).map((verdict) => ({
      verdict,
      rows: totals.verdicts[verdict],
      share: shares[verdict],
    })),
    polarEfficiency: figure(totals.efficiency),
  }
}

/** A region's cells: the reached ones each with its Cell Agreement, the rest grouped by reason. */
function regionCells(
  views: readonly SailSelectionCellView[],
  domain: PolarDomain | null
): Pick<McpSailRegion, 'cells' | 'unreached'> {
  const cells: McpSailSelectionCell[] = []
  const unreached = new Map<string, [number, number][]>()

  for (const { cell, totals } of views) {
    const agreement = cellAgreement(totals, () => emptyCellSentence(cell))
    if (agreement.agreement === 'unreached') {
      const at = unreached.get(agreement.reason) ?? []
      at.push([cell.twa, cell.tws])
      unreached.set(agreement.reason, at)
      continue
    }

    const noTarget = unreachableReason(cell, domain)
    cells.push({
      twaDegrees: cell.twa,
      twsKnots: cell.tws,
      ...agreement,
      ...(noTarget === null ? {} : { noTargetReason: noTarget }),
    })
  }

  return { cells, unreached: [...unreached].map(([reason, at]) => ({ reason, cells: at })) }
}

function lineAnswer(line: BreakdownLine): McpSailBreakdownLine {
  return {
    id: line.id,
    label: line.label,
    aboutTheRecord: line.about_the_record,
    rows: line.rows,
    polarEfficiency: figure(line.efficiency),
    ...(line.verdict === null
      ? {}
      : { verdict: line.verdict as McpSailVerdict }),
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
  const reason = unreachableReason(cell, domain)
  const withoutTarget = cellWithoutTargetSentence(totals)
  const reached = totals.rows > 0
  const breakdown = cellBreakdown(cell, dimensions)

  return {
    twaDegrees: cell.twa,
    twsKnots: cell.tws,
    region,
    chartSays: chartSays(cell),
    sailNumber: cell.sail_number,
    cellAgreement: cellAgreement(totals, () => emptyCellSentence(cell)),
    statement: reached
      ? [
          cellScoredSentence(totals),
          ...(reason === null ? [] : [reason]),
          ...(withoutTarget === null ? [] : [withoutTarget]),
          verdictTallySentence(totals),
        ]
      : [emptyCellSentence(cell), ...(reason === null ? [] : [reason])],
    breakdown: reached
      ? {
          sails: breakdown.sails.map(lineAnswer),
          seas: breakdown.seas.map(lineAnswer),
          times: breakdown.times.map(lineAnswer),
        }
      : null,
  }
}

function coverageLedgerAnswer(data: SailSelection): McpCoverageLedger {
  const { ledger } = data
  const notCountable = notCountableSeconds(ledger)

  return {
    matchedSeconds: ledger.matched_seconds,
    totalSeconds: ledger.total_seconds,
    matchedRaces: ledger.matched_races,
    totalRaces: ledger.total_races,
    countableSeconds: ledger.countable_seconds,
    excluded:
      notCountable > 0 ? [{ reason: 'Not Countable: frozen, low-speed or mid-maneuver', seconds: notCountable }] : [],
    notRecorded: ledger.gaps.map((gap) => ({
      dimension: gap.dimension,
      missing: gap.label,
      seconds: gap.seconds,
      share: gap.share,
    })),
    statement: [
      ledgerHeadline(ledger),
      countableSentence(ledger),
      ...ledger.gaps.map(gapSentence),
      placementSentence(data),
    ],
  }
}

/**
 * The **Sail Selection Screen** as it states itself, for the MCP `sail_selection` tool.
 *
 * Pure, and built on nothing but the screen's own functions: `getSailSelectionData` and the folds
 * beside it for the figures, `chartSailRegions` for the regions the Chart layer outlines, and the
 * cell sheet's own sentence builders for the words. It holds no rule of its own (ADR 0042, *A tool
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
  const regions = regionViews(views, chartSailRegions(payload))

  const opened =
    cell === null ? null : views.find((view) => cellKey(view.cell.row, view.cell.column) === cellKey(cell.row, cell.column))
  const openedRegion =
    opened == null ? null : regions.find((region) => region.views.includes(opened))

  const agreement = chartAgreement(data.cells)

  return {
    filter: filterAsArgument(filter),
    crossoverChart: {
      version: chart.versionNumber,
      twaAxisDegrees: [...payload.twa_axis],
      twsAxisKnots: [...payload.tws_axis],
    },
    coverageLedger: coverageLedgerAnswer(data),
    grid: {
      cells: coverage.cells,
      reached: coverage.reached,
      withFigure: coverage.with_figure,
      rowsWithoutFigure: coverage.rows_without_figure,
      unreachable: coverage.unreachable,
      mixed: coverage.mixed,
      emptiedByFilter: coverage.ghosted,
      noTargetRegions: unreachableRegions(data.cells, domain),
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
    regions:
      cell !== null
        ? null
        : regions.map(
            (region): McpSailRegion => ({
              region: region.index,
              sail: region.name,
              sailNumber: region.sail_number,
              cellCount: region.views.length,
              reachedCells: region.views.filter((view) => view.totals.rows > 0).length,
              cellAgreement: cellAgreement(region.totals, () => emptyRegionSentence(region)),
              ...regionCells(region.views, domain),
            })
          ),
    cell: opened == null || openedRegion == null ? null : cellDetail(opened, openedRegion.index, dimensions, domain),
  }
}

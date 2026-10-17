import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { matchedRows } from '@/services/analysis/filter'
import { efficiencyPercent, patchPercent } from '@/services/analysis/figures'
import {
  NOTHING_SCORED,
  excludedFromFigures,
  fillerAnchoredShare,
  getPolarPerformanceData,
  isFillerFlagged,
  scoredSailingSentence,
  vmgFillerAnchoredShare,
} from '@/services/analysis/polar-performance'
import {
  FOCUS_WIDTHS,
  NOTHING_IN_WINDOW,
  NO_POLAR_TO_DRAW_AGAINST,
  UNDRAWN_REASONS,
  aggregateTargetKnots,
  clampCentre,
  focusRange,
  patchBounds,
  seasonWindow,
} from '@/services/analysis/polar-plot'
import { TARGET_VMG_CAVEAT } from '@/services/analysis/polar-targets'
import { filterAsArgument, offeredDimensions } from './analysis-filter'
import type {
  AnalysisDimensionSpec,
  AnalysisFilter,
  EfficiencyAggregate,
  MatchableRow,
  McpCoverageLedger,
  McpEfficiencyFigure,
  McpPolarPlotPatch,
  McpWindWindow,
  McpWindWindowArgument,
  PolarPayload,
  PolarPerformanceAnswer,
  PolarPlotPatch,
} from '@/types'

type Polars = Readonly<Record<string, PolarPayload>>

function figure(
  ratio: number | null,
  seconds: number,
  filler: number | null,
  nothing: string
): McpEfficiencyFigure {
  return {
    ratio,
    scoredSeconds: seconds,
    percent: efficiencyPercent(ratio),
    fillerAnchoredShare: filler,
    fillerAnchored: isFillerFlagged(filler),
    ...(ratio === null ? { note: nothing } : {}),
  }
}

/** Both figures over one set of sums, each with its own time and its own share (ADR 0036). */
function figures(
  sums: EfficiencyAggregate,
  nothing: string
): Pick<PolarPerformanceAnswer, 'polarEfficiency' | 'vmgEfficiency'> {
  return {
    polarEfficiency: figure(sums.polar_efficiency, sums.elapsed_seconds, fillerAnchoredShare(sums), nothing),
    vmgEfficiency: {
      ...figure(sums.vmg_efficiency, sums.vmg_elapsed_seconds, vmgFillerAnchoredShare(sums), nothing),
      caveat: TARGET_VMG_CAVEAT,
    },
  }
}

export type WindWindowReading = { ok: true; window: McpWindWindowArgument } | { ok: false; message: string }

/**
 * The `windWindow` argument checked against what the screen's slider can hold, or a refusal
 * naming what would have worked. Refused rather than clamped as the slider is: a clamped window
 * would be an answer about different wind than Claude asked for.
 */
export function windWindowFromArgument(argument: McpWindWindowArgument, polars: Polars): WindWindowReading {
  const range = focusRange(Object.values(polars))
  if (range === null) return { ok: false, message: NO_POLAR_TO_DRAW_AGAINST }

  if (!(FOCUS_WIDTHS as readonly number[]).includes(argument.width)) {
    return { ok: false, message: `windWindow.width must be one of ${FOCUS_WIDTHS.join(', ')} knots.` }
  }
  if (clampCentre(argument.centre, range) !== argument.centre) {
    return {
      ok: false,
      message: `windWindow.centre must be a whole knot from ${range.from} to ${range.to}, the Polar's wind range.`,
    }
  }

  return { ok: true, window: argument }
}

function patchAnswer(patch: PolarPlotPatch): McpPolarPlotPatch {
  const bounds = patchBounds(patch)
  const filler = fillerAnchoredShare(patch.efficiency)

  return {
    twaDegrees: { from: bounds.twa_from, to: bounds.twa_to },
    sogKnots: { from: bounds.sog_from, to: bounds.sog_to },
    ratio: patch.efficiency.polar_efficiency,
    percent: patchPercent(patch.efficiency.polar_efficiency),
    targetKnots: aggregateTargetKnots(patch.efficiency),
    scoredSeconds: patch.efficiency.elapsed_seconds,
    races: patch.races,
    fillerAnchoredShare: filler,
    fillerAnchored: isFillerFlagged(filler),
  }
}

/** One position of the Polar Plot's window, over the rows the rail matched. */
function windWindowAnswer(
  matched: readonly MatchableRow[],
  polars: Polars,
  { centre, width }: McpWindWindowArgument
): McpWindWindow {
  const view = seasonWindow(matched, polars, centre, width)

  return {
    centreKnots: centre,
    widthKnots: width,
    lowKnots: view.focus.low,
    highKnots: view.focus.high,
    polarColumnsInPlay: view.columns_in_play,
    ...figures(view.efficiency, NOTHING_IN_WINDOW),
    notDrawn: {
      seconds: view.undrawn.seconds,
      parts: view.undrawn.parts.map((part) => ({
        reason: UNDRAWN_REASONS[part.reason],
        seconds: part.seconds,
      })),
    },
    patches: view.patches.map(patchAnswer),
    ...(view.efficiency.elapsed_seconds === 0 ? { note: NOTHING_IN_WINDOW } : {}),
  }
}

/**
 * **Polar performance** as the screen states it, for the MCP `polar_performance` tool.
 *
 * Pure, and built on nothing but the screen's own functions: `getPolarPerformanceData` for the
 * figures and the ledger, `seasonWindow` for the Polar Plot's wind window, and the screen's own
 * sentence builders for the words. It holds no rule of its own: every exclusion, threshold and
 * sentence is the screen's, from `services/analysis`, and this only renames for a model (ADR 0042,
 * *A tool inherits every rule and owns none*). The caller hands in the rows `readAnalysisArchive`
 * read and the dimensions the screen would build from them, so the tool and the screen cannot
 * disagree about a filter.
 *
 * `window` must already have passed `windWindowFromArgument`.
 */
export function polarPerformanceAnswer(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  polars: Polars,
  window: McpWindWindowArgument | null = null
): PolarPerformanceAnswer {
  const { ledger, overall } = getPolarPerformanceData(rows, filter, dimensions)
  const range = focusRange(Object.values(polars))

  const coverageLedger: McpCoverageLedger = {
    matchedSeconds: ledger.matched_seconds,
    totalSeconds: ledger.total_seconds,
    matchedRaces: ledger.matched_races,
    totalRaces: ledger.total_races,
    countableSeconds: ledger.countable_seconds,
    excluded: excludedFromFigures({ ledger, overall }),
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
      scoredSailingSentence(overall),
    ],
  }

  return {
    filter: filterAsArgument(filter),
    ...figures(overall, NOTHING_SCORED),
    coverageLedger,
    dimensions: offeredDimensions(dimensions),
    windWindowOptions:
      range === null
        ? null
        : { centreFromKnots: range.from, centreToKnots: range.to, widthsKnots: [...FOCUS_WIDTHS] },
    windWindow:
      window === null ? null : windWindowAnswer(matchedRows(rows, filter, dimensions), polars, window),
  }
}

import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { efficiencyPercent } from '@/services/analysis/figures'
import {
  NOTHING_SCORED,
  excludedFromFigures,
  fillerAnchoredShare,
  getPolarPerformanceData,
  isFillerFlagged,
  scoredSailingSentence,
  vmgFillerAnchoredShare,
} from '@/services/analysis/polar-performance'
import { TARGET_VMG_CAVEAT } from '@/services/analysis/polar-targets'
import { filterAsArgument, offeredDimensions } from './analysis-filter'
import type {
  AnalysisDimensionSpec,
  AnalysisFilter,
  MatchableRow,
  McpCoverageLedger,
  McpEfficiencyFigure,
  PolarPerformanceAnswer,
} from '@/types'

function figure(ratio: number | null, seconds: number, filler: number | null): McpEfficiencyFigure {
  return {
    ratio,
    scoredSeconds: seconds,
    percent: efficiencyPercent(ratio),
    fillerAnchoredShare: filler,
    fillerAnchored: isFillerFlagged(filler),
    ...(ratio === null ? { note: NOTHING_SCORED } : {}),
  }
}

/**
 * **Polar performance** as the screen states it, for the MCP `polar_performance` tool.
 *
 * Pure, and built on nothing but the screen's own functions: `getPolarPerformanceData` for the
 * figures and the ledger, the ledger's own sentence builders for its words. It holds no rule of
 * its own: every exclusion, threshold and sentence is the screen's, from `services/analysis`, and
 * this only renames for a model (ADR 0042, *A tool inherits every rule and owns none*). The caller
 * hands in the rows `readAnalysisArchive` read and the dimensions the screen would build from
 * them, so the tool and the screen cannot disagree about a filter.
 */
export function polarPerformanceAnswer(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): PolarPerformanceAnswer {
  const { ledger, overall } = getPolarPerformanceData(rows, filter, dimensions)

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
    polarEfficiency: figure(overall.polar_efficiency, overall.elapsed_seconds, fillerAnchoredShare(overall)),
    // Its own share, over its own rows, exactly as the screen pairs them.
    vmgEfficiency: {
      ...figure(overall.vmg_efficiency, overall.vmg_elapsed_seconds, vmgFillerAnchoredShare(overall)),
      caveat: TARGET_VMG_CAVEAT,
    },
    coverageLedger,
    dimensions: offeredDimensions(dimensions),
  }
}

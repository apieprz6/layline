import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import { efficiencyPercent } from '@/services/analysis/figures'
import {
  NOTHING_SCORED,
  fillerAnchoredShare,
  getPolarPerformanceData,
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
    fillerAnchored: filler !== null && filler > 0,
    ...(ratio === null ? { note: NOTHING_SCORED } : {}),
  }
}

/**
 * **Polar performance** as the screen states it, for the MCP `polar_performance` tool.
 *
 * Pure, and built on nothing but the screen's own functions: `getPolarPerformanceData` for the
 * figures and the ledger, the ledger's own sentence builders for its words. The caller hands in
 * the rows `readAnalysisArchive` read and the dimensions the screen would build from them, so the
 * tool and the screen cannot disagree about a filter (ADR 0042).
 */
export function polarPerformanceAnswer(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): PolarPerformanceAnswer {
  const { ledger, overall } = getPolarPerformanceData(rows, filter, dimensions)

  // The ledger's countable seconds are partitioned by the figure's own tallies: a row with no
  // measured interval adds no time, so what is countable and not in the figure lacked a SOG or
  // a target.
  const notCountable = ledger.matched_seconds - ledger.countable_seconds
  const withoutTarget = ledger.countable_seconds - overall.elapsed_seconds

  const coverageLedger: McpCoverageLedger = {
    matchedSeconds: ledger.matched_seconds,
    totalSeconds: ledger.total_seconds,
    matchedRaces: ledger.matched_races,
    totalRaces: ledger.total_races,
    countableSeconds: ledger.countable_seconds,
    excluded: [
      { reason: 'Not Countable: frozen, low-speed or mid-maneuver', seconds: notCountable },
      {
        reason:
          'Countable, but not scored: no SOG, or no Target Speed (outside the Polar, or no ' +
          'Polar for the race)',
        seconds: withoutTarget,
      },
      {
        // VMG sums its own subset of the scored rows (`sumEfficiency`), so it can rest on less.
        reason: 'Scored for Polar Efficiency, but no Target VMG: left out of VMG Efficiency only',
        seconds: overall.elapsed_seconds - overall.vmg_elapsed_seconds,
      },
    ].filter((each) => each.seconds > 0),
    notRecorded: ledger.gaps.map((gap) => ({
      dimension: gap.dimension,
      missing: gap.label,
      seconds: gap.seconds,
      share: gap.share,
    })),
    statement: [ledgerHeadline(ledger), countableSentence(ledger), ...ledger.gaps.map(gapSentence)],
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

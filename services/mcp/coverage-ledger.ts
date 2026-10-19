import { countableSentence, gapSentence, ledgerHeadline } from '@/services/analysis/coverage-ledger'
import type { FigureExclusion } from '@/services/analysis/polar-performance'
import type { CoverageLedger, McpCoverageLedger } from '@/types'

/**
 * A screen's **Coverage Ledger** as a tool states it, in time and never in rows (ADR 0037).
 *
 * `excluded` and `closing` are the screen's own: what its figures leave out, and the sentence it
 * prints under the ledger's own lines, where it has one. Renamed for a model, nothing recomputed.
 */
export function coverageLedgerAnswer(
  ledger: CoverageLedger,
  excluded: readonly FigureExclusion[],
  closing: readonly string[] = []
): McpCoverageLedger {
  return {
    matchedSeconds: ledger.matched_seconds,
    totalSeconds: ledger.total_seconds,
    matchedRaces: ledger.matched_races,
    totalRaces: ledger.total_races,
    countableSeconds: ledger.countable_seconds,
    excluded: [...excluded],
    notRecorded: ledger.gaps.map((gap) => ({
      dimension: gap.dimension,
      missing: gap.label,
      seconds: gap.seconds,
      share: gap.share,
    })),
    statement: [ledgerHeadline(ledger), countableSentence(ledger), ...ledger.gaps.map(gapSentence), ...closing],
  }
}

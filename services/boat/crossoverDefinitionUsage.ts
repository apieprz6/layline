/**
 * How much of a **Crossover Chart** each sail definition accounts for.
 *
 * Derived at read rather than stored (ADR 0009): it is a fact about the payload that the payload
 * already contains, and the legend that shows it must be able to re-answer the question about a
 * Version written years ago.
 *
 * Zero is the answer worth having. Sail 7 of the boat's own chart is defined and called for by no
 * cell at all, and sail 4 by five cells out of 338 — "rarely used" and "never recommended" are both
 * real states, and the legend says so rather than dropping the row.
 *
 * A module of its own, apart from `crossoverPayload`, for the reason `polarSyntheticRows` is: the
 * legend is drawn inside the `'use client'` upload panel, and the write gate next door imports zod.
 * Deriving from a payload needs none of it — the counting here is arithmetic over numbers the
 * payload already holds — so the schema and its validator stay on the server where they belong.
 */

import type { CrossoverChartPayload, CrossoverDefinitionUsage } from '@/types'

export function crossoverDefinitionUsage(
  payload: CrossoverChartPayload
): CrossoverDefinitionUsage[] {
  const counts = new Map<number, number>()

  for (const row of payload.cells) {
    for (const sail of row) {
      counts.set(sail, (counts.get(sail) ?? 0) + 1)
    }
  }

  return payload.sail_definitions.map((definition) => ({
    definition,
    cells: counts.get(definition.number) ?? 0,
  }))
}

/**
 * How the legend states a definition's share of the chart: `'never recommended'`, `'1 cell'`,
 * `'5 cells'`. Nought is the answer worth printing — a definition no cell calls for is an inventory
 * entry the chart never recommends, which is not an absent definition and is not a mistake.
 */
export function describeDefinitionUsage(cells: number): string {
  if (cells === 0) return 'never recommended'
  return cells === 1 ? '1 cell' : `${cells} cells`
}

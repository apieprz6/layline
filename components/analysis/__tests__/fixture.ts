/**
 * Rows and races for the analysis component suites.
 *
 * Hand-built and deliberately lopsided in the ways the real archive is — one race fully annotated,
 * one with no **Sea State** or **Sail Configuration** at all, one sail in the vocabulary that was
 * never raced — because those are the shapes the rail and the ledger exist to render honestly.
 *
 * Not a `.test.ts`, so Jest collects the suites and not this.
 */

import type { PolarDomain } from '@/services/analysis/polar-targets'
import type { AnalysisArchiveRace, CrossoverChartPayload, MatchableRow, RowSail } from '@/types'

export const VOCABULARY = {
  /** `Reef + Jib 2` is in the chart and in no race — the disabled chip ADR 0014 asks for. */
  sails: ['Main + Jib 1', 'Main + Jib 2', 'Reef + Jib 2'],
  months: ['2026-06', '2026-07'],
}

/**
 * A six-cell **Crossover Chart** carrying the same three sails the vocabulary does.
 *
 * Two angles and three wind speeds, chosen so the fixture rows below land in three different cells
 * and so one wind-speed column (16 kt) sits past `POLAR_RANGE`'s own last — which is the shape of
 * this boat's real chart against its real certificate, and the only way to render the cells that
 * can never carry a percent of target.
 */
export const CHART: CrossoverChartPayload = {
  twa_axis: [40, 90],
  tws_axis: [4, 10, 16],
  cells: [
    [1, 1, 2],
    [1, 4, 4],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 2, label: 'Main + Jib 2' },
    { number: 4, label: 'Reef + Jib 2' },
  ],
}

/** A Polar that stops at 14 knots, so the chart's 16 kt column is past its last (ADR 0028). */
export const POLAR_RANGE: PolarDomain = {
  twa_from: 30,
  twa_to: 180,
  tws_from: 4,
  tws_to: 14,
}

export const RACES: AnalysisArchiveRace[] = [
  { id: 'july', title: 'Beer can — 1 Jul', day: '2026-07-01', seconds: 120 },
  { id: 'june', title: null, day: '2026-06-03', seconds: 120 },
]

let nextIndex = 0

export function matchableRow(over: Partial<MatchableRow> = {}): MatchableRow {
  nextIndex += 1
  const sog = over.sog ?? 6
  const target = 6

  return {
    race_id: 'june',
    row_index: nextIndex,
    day: '2026-06-03',
    day_seconds: 19 * 3600,
    tws: 11,
    twa: 42,
    sea_state: 'calm',
    sail: { recorded: 'definition', label: 'Main + Jib 1' } satisfies RowSail,
    countable: true,
    interval_seconds: 60,
    sog,
    efficiency: {
      row_index: nextIndex,
      target_speed: { knots: target, filler_anchored: false },
      polar_efficiency: sog / target,
      vmg_zone: 'upwind',
      vmg: sog,
      target_vmg: { estimated_knots: target, filler_anchored: false },
      vmg_efficiency: sog / target,
    },
    ...over,
  }
}

/**
 * Four rows: two annotated June rows, two unannotated July rows, one of them heavy air.
 *
 * Small enough that every count in the suites can be read off this list by hand, which is what
 * makes a wrong count a legible failure rather than a mystery.
 */
export const ROWS: MatchableRow[] = [
  matchableRow({ race_id: 'june', tws: 11 }),
  matchableRow({ race_id: 'june', tws: 4, sog: 3 }),
  matchableRow({
    race_id: 'july',
    day: '2026-07-01',
    tws: 18,
    sea_state: null,
    sail: { recorded: 'not-recorded' },
  }),
  matchableRow({
    race_id: 'july',
    day: '2026-07-01',
    tws: 18,
    sea_state: null,
    sail: { recorded: 'note-only' },
    countable: false,
  }),
]

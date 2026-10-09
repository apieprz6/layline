/**
 * The two readings of one comparison, held to the same answer.
 *
 * Layline asks "did the boat carry what the chart called for?" in two places and at two grains.
 * The **Race Track Heatmap** colours one row at a time (`compareSailToChart`, ADR 0038); the
 * **Sail Selection Screen** counts the same comparison over a chart cell's **Countable** rows as
 * **Cell Agreement** (ADR 0030). Both ADRs say in as many words that the two cannot disagree —
 * ADR 0038's is "the same comparison at the grain the map draws, through the same `crossoverLookup`,
 * so the two cannot disagree".
 *
 * A sentence in an ADR is not a guarantee, so this is the guarantee: one chart, one Testimony, and
 * the two code paths asked about the same rows. It is the same move
 * `calibration-eras.test.ts`'s Era reconciliation makes — a shared claim nothing else would notice
 * breaking.
 *
 * ## The mapping, and why the two vocabularies differ
 *
 * The heatmap distinguishes four ways to have no verdict because it has a readout to print them
 * in. The grid distinguishes three, because two of the heatmap's four describe rows that **reach no
 * cell on the grid at all** and so are counted outside it (`rows_off_grid`, `rows_unplaced`):
 *
 * | one row (ADR 0038) | one cell (ADR 0030) |
 * |---|---|
 * | `agrees` | `agrees` |
 * | `differs` | `differs` |
 * | `sail_unnamed` | `off-chart` |
 * | `no_sail_recorded` | `not-recorded` |
 * | `no_chart_version` | `not-recorded` — a Race with no Version can hold no Configurations |
 * | `no_chart_cell` | *not placed*: `rows_off_grid` |
 * | `no_reading` | *not placed*: `rows_unplaced` |
 */

import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { EMPTY_FILTER, SAIL_SELECTION_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { compareSailToChart, type FlownSail } from '@/services/analysis/sail-agreement'
import {
  cellTotals,
  getSailSelectionData,
  type CellVerdict,
} from '@/services/analysis/sail-selection'
import type { CrossoverChartPayload, MatchableRow, RowSail, SailAgreement } from '@/types'

/** One chart, read by both paths: Jib 1 below 12 knots, A2 above. */
const CHART: CrossoverChartPayload = {
  twa_axis: [40, 90],
  tws_axis: [6, 12],
  cells: [
    [1, 8],
    [1, 8],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 8, label: 'Main + A2' },
  ],
}

const CHART_VERSION = 'chart-version-1'
const LOOKUP = crossoverLookup(CHART)
const DIMENSIONS = analysisDimensions(SAIL_SELECTION_DIMENSIONS, { sails: [], months: [] })

/** What the heatmap would answer, and what the grid would, for one row under one Configuration. */
function bothReadings(
  sail: RowSail,
  entries: readonly FlownSail[],
  twa: number,
  tws: number
): { row: SailAgreement; cell: CellVerdict | 'unplaced' } {
  const perRow = compareSailToChart(
    { row_time: '2026-06-20 16:30:00', twa, tws },
    { lookup: LOOKUP, entries }
  )

  const matchable: MatchableRow = {
    race_id: 'race-a',
    row_index: 1,
    day: '2026-06-20',
    day_seconds: 16 * 3600 + 1800,
    tws,
    twa,
    sea_state: 'calm',
    sail,
    countable: true,
    interval_seconds: 60,
    sog: 6,
    efficiency: {
      row_index: 1,
      target_speed: { knots: 6, filler_anchored: false },
      polar_efficiency: 1,
      vmg_zone: 'upwind',
      vmg: 6,
      target_vmg: { estimated_knots: 6, filler_anchored: false },
      vmg_efficiency: 1,
    },
    crossover_chart_version_id: CHART_VERSION,
  }

  const grid = getSailSelectionData(
    [matchable],
    EMPTY_FILTER,
    DIMENSIONS,
    CHART,
    null,
    CHART_VERSION
  )

  const placed = grid.cells.flatMap((cell) => cell.slices.map((slice) => slice.verdict))

  return {
    row: perRow.agreement,
    cell: placed.length === 0 ? 'unplaced' : placed[0],
  }
}

/** A Configuration naming one of the chart's Definitions, in both paths' own shapes. */
function carrying(definition_number: number, label: string, at = '2026-06-20 16:00:00') {
  return {
    entries: [{ at, definition_number, label }] satisfies FlownSail[],
    sail: { recorded: 'definition', definition_number, label } satisfies RowSail,
  }
}

describe('the two readings of one comparison', () => {
  it('both agree where the sail flown is the one the cell names', () => {
    const jib = carrying(1, 'Main + Jib 1')
    const { row, cell } = bothReadings(jib.sail, jib.entries, 45, 8)

    expect(row).toBe('agrees')
    expect(cell).toBe('agrees')
  })

  it('both differ where it is not', () => {
    const kite = carrying(8, 'Main + A2')
    // 8 knots floors onto the 6 kt column, which calls for Jib 1.
    const { row, cell } = bothReadings(kite.sail, kite.entries, 45, 8)

    expect(row).toBe('differs')
    expect(cell).toBe('differs')
  })

  it('both agree on the other side of the crossover, which is the same chart read twice', () => {
    const kite = carrying(8, 'Main + A2')
    const { row, cell } = bothReadings(kite.sail, kite.entries, 45, 14)

    expect(row).toBe('agrees')
    expect(cell).toBe('agrees')
  })

  it('never match on names, so one spelling of a sail cannot become two', () => {
    // The same Definition number, with the label spelled the way a second Version might. Both
    // paths compare the number, so both still agree (ADR 0038, ADR 0023).
    const respelled = carrying(1, 'Main+Jib 1')
    const { row, cell } = bothReadings(respelled.sail, respelled.entries, 45, 8)

    expect(row).toBe('agrees')
    expect(cell).toBe('agrees')
  })

  it('both decline to judge a sail the chart has no word for', () => {
    const note: FlownSail[] = [
      { at: '2026-06-20 16:00:00', definition_number: null, label: null },
    ]
    const { row, cell } = bothReadings({ recorded: 'note-only' }, note, 45, 8)

    expect(row).toBe('sail_unnamed')
    expect(cell).toBe('off-chart')
  })

  it('both decline to judge a row nobody wrote a sail down for', () => {
    const { row, cell } = bothReadings({ recorded: 'not-recorded' }, [], 45, 8)

    expect(row).toBe('no_sail_recorded')
    expect(cell).toBe('not-recorded')
  })

  it('reads a Race with no chart Version as nothing written down, on both paths', () => {
    // A Race recording no Version can hold no Sail Configurations either (ADR 0023), so the grid
    // sees a row with no sail and the heatmap is handed no chart at all.
    const perRow = compareSailToChart({ row_time: '2026-06-20 16:30:00', twa: 45, tws: 8 }, null)
    const { cell } = bothReadings({ recorded: 'not-recorded' }, [], 45, 8)

    expect(perRow.agreement).toBe('no_chart_version')
    expect(cell).toBe('not-recorded')
  })
})

describe('the rows the grid places nowhere', () => {
  it('leaves a row below the chart’s first column off the grid, where the row path says so too', () => {
    const jib = carrying(1, 'Main + Jib 1')
    const { row, cell } = bothReadings(jib.sail, jib.entries, 45, 3)

    expect(row).toBe('no_chart_cell')
    expect(cell).toBe('unplaced')
  })

  it('does the same for a row that recorded no wind', () => {
    const jib = carrying(1, 'Main + Jib 1')
    const perRow = compareSailToChart(
      { row_time: '2026-06-20 16:30:00', twa: 45, tws: null },
      { lookup: LOOKUP, entries: jib.entries }
    )

    const grid = getSailSelectionData(
      [
        {
          race_id: 'race-a',
          row_index: 1,
          day: '2026-06-20',
          day_seconds: 16 * 3600,
          tws: null,
          twa: 45,
          sea_state: null,
          sail: jib.sail,
          countable: true,
          interval_seconds: 60,
          sog: 6,
          efficiency: {
            row_index: 1,
            target_speed: null,
            polar_efficiency: null,
            vmg_zone: null,
            vmg: null,
            target_vmg: null,
            vmg_efficiency: null,
          },
          crossover_chart_version_id: CHART_VERSION,
        },
      ],
      EMPTY_FILTER,
      DIMENSIONS,
      CHART,
      null,
      CHART_VERSION
    )

    expect(perRow.agreement).toBe('no_reading')
    expect(grid.rows_unplaced).toBe(1)
    expect(grid.cells.every((cell) => cell.slices.length === 0)).toBe(true)
  })
})

describe('the one thing only the grid has to answer', () => {
  /**
   * The heatmap always reads a row against **its own Race's** chart, so it can never be handed two
   * vocabularies. The grid draws **one** Version and lays a whole season over it, so it can — and
   * an integer comparison across two Versions' numbering is meaningless (ADR 0023). The row is
   * still drawn where it sailed; it is simply not judged.
   */
  it('places a row from another chart Version and declines to judge it', () => {
    const jib = carrying(1, 'Main + Jib 1')
    const grid = getSailSelectionData(
      [
        {
          race_id: 'older',
          row_index: 1,
          day: '2026-06-20',
          day_seconds: 16 * 3600,
          tws: 8,
          twa: 45,
          sea_state: 'calm',
          sail: jib.sail,
          countable: true,
          interval_seconds: 60,
          sog: 6,
          efficiency: {
            row_index: 1,
            target_speed: { knots: 6, filler_anchored: false },
            polar_efficiency: 1,
            vmg_zone: 'upwind',
            vmg: 6,
            target_vmg: { estimated_knots: 6, filler_anchored: false },
            vmg_efficiency: 1,
          },
          crossover_chart_version_id: 'a-retired-version',
        },
      ],
      EMPTY_FILTER,
      DIMENSIONS,
      CHART,
      null,
      CHART_VERSION
    )

    const reached = grid.cells.filter((cell) => cell.slices.length > 0)

    expect(reached).toHaveLength(1)
    expect(cellTotals(reached[0].slices).rows).toBe(1)
    expect(cellTotals(reached[0].slices).agreement).toBe('other-version')
    // And it is never read as disagreement, any more than Off-chart is.
    expect(cellTotals(reached[0].slices).verdicts.differs).toBe(0)
  })

  it('judges it where the caller cannot name the drawn Version, rather than refusing to', () => {
    // Null claims nothing either way: a fixture or a screen that does not know which Version it
    // drew is not evidence that the row came from a different one.
    const jib = carrying(1, 'Main + Jib 1')
    const { cell } = bothReadings(jib.sail, jib.entries, 45, 8)

    expect(cell).toBe('agrees')
  })
})

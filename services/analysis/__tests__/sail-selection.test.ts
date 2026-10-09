/**
 * The **Sail Selection Screen**'s aggregation: a season laid onto the boat's own Crossover Chart.
 *
 * Five claims are pinned here, each of them a place an obvious implementation gets it wrong and
 * each of them a decision ADR 0030 argues for rather than a detail:
 *
 *   - a row lands in its cell by a **floor** on *both* axes, and a row below either axis lands in
 *     no cell at all rather than in the first one;
 *   - **Cell Agreement** is a proportion over the cell's Countable rows, and `Off-chart` is never
 *     counted as disagreement;
 *   - the figures are **per-slice sums**, so the slices a narrowing leaves re-aggregate to exactly
 *     what a narrowed query would have returned;
 *   - a cell a narrowing emptied is distinguishable from one no Race ever reached (the ghost);
 *   - the **Chart** layer is never filtered and never ghosted.
 *
 * The real archive's own counts are pinned separately, in `archive-sail-selection.test.ts`, which
 * needs the owner's files and skips loudly without them. This suite is the arithmetic, on a chart
 * small enough that every figure in it can be read off by hand.
 */

import { countableRows } from '@/services/analysis/efficiency'
import {
  EMPTY_FILTER,
  SAIL_SELECTION_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import {
  cellBreakdown,
  cellTotals,
  cellViews,
  getSailSelectionData,
  gridCoverage,
  unreachableReason,
  type SailSelectionCell,
} from '@/services/analysis/sail-selection'
import type { AnalysisFilter, CrossoverChartPayload, MatchableRow, RowSail } from '@/types'

const JIB = 'Main + Jib 1'
const KITE = 'Main + A2'

/**
 * A chart with the two shapes that matter: a coarse angle axis to floor onto, and a wind-speed
 * column (25 kt) past where any ORC certificate reaches. The boat's own chart has exactly that
 * column, and it is why 26 of its cells can never hold a figure.
 */
const CHART: CrossoverChartPayload = {
  twa_axis: [40, 90],
  tws_axis: [6, 12, 25],
  cells: [
    [1, 1, 1],
    [1, 8, 8],
  ],
  sail_definitions: [
    { number: 1, label: JIB },
    { number: 8, label: KITE },
  ],
}

/** The boat's own certificate's shape: angles from 30, and a hard stop at 24 knots (Rule 402.2). */
const DOMAIN: PolarDomain = { twa_from: 30, twa_to: 180, tws_from: 4, tws_to: 24 }

const DIMENSIONS = analysisDimensions(SAIL_SELECTION_DIMENSIONS, {
  sails: [JIB, KITE],
  months: ['2026-06', '2026-07'],
})

let nextIndex = 0

function row(over: {
  twa?: number | null
  tws?: number | null
  sail?: RowSail
  sea?: 'calm' | 'slight' | null
  hour?: number
  sog?: number
  target?: number | null
  seconds?: number | null
  countable?: boolean
  filler?: boolean
  race_id?: string
}): MatchableRow {
  nextIndex += 1
  const sog = over.sog ?? 6
  const target = over.target === undefined ? 6 : over.target

  return {
    race_id: over.race_id ?? 'race-a',
    row_index: nextIndex,
    day: '2026-06-03',
    day_seconds: (over.hour ?? 14) * 3600,
    tws: over.tws === undefined ? 14 : over.tws,
    twa: over.twa === undefined ? 95 : over.twa,
    sea_state: over.sea === undefined ? 'calm' : over.sea,
    sail: over.sail ?? { recorded: 'definition', label: KITE },
    countable: over.countable ?? true,
    interval_seconds: over.seconds === undefined ? 60 : over.seconds,
    sog,
    efficiency: {
      row_index: nextIndex,
      target_speed: target === null ? null : { knots: target, filler_anchored: over.filler ?? false },
      polar_efficiency: target === null ? null : sog / target,
      vmg_zone: 'downwind',
      vmg: sog,
      target_vmg: target === null ? null : { estimated_knots: target, filler_anchored: false },
      vmg_efficiency: target === null ? null : sog / target,
    },
  }
}

function data(rows: readonly MatchableRow[], filter: AnalysisFilter = EMPTY_FILTER) {
  return getSailSelectionData(rows, filter, DIMENSIONS, CHART, DOMAIN)
}

function cellAt(cells: readonly SailSelectionCell[], twa: number, tws: number): SailSelectionCell {
  const found = cells.find((cell) => cell.twa === twa && cell.tws === tws)
  if (found === undefined) throw new Error(`no cell at ${twa}/${tws}`)
  return found
}

describe('the grid is the chart, drawn whole', () => {
  it('returns every cell in row-major order, reached or not', () => {
    const { cells, twa_axis, tws_axis } = data([])

    expect(cells).toHaveLength(6)
    expect(twa_axis).toEqual([40, 90])
    expect(tws_axis).toEqual([6, 12, 25])
    expect(cells.map((cell) => `${cell.twa}/${cell.tws}`)).toEqual([
      '40/6',
      '40/12',
      '40/25',
      '90/6',
      '90/12',
      '90/25',
    ])
  })

  it('prints the chart’s own recommendation in every cell, however little was sailed there', () => {
    const { cells } = data([])

    expect(cellAt(cells, 90, 12).sail_number).toBe(8)
    expect(cellAt(cells, 90, 12).recommendation?.definition.label).toBe(KITE)
    expect(cellAt(cells, 40, 6).recommendation?.definition.label).toBe(JIB)
  })

  it('leaves the Chart layer alone under a narrowing, because the chart is the chart', () => {
    const narrowed = data([row({})], { buckets: { sea: ['slight'] }, range: null })

    expect(narrowed.cells.every((cell) => cell.sail_number !== null)).toBe(true)
    expect(cellAt(narrowed.cells, 90, 12).recommendation?.definition.label).toBe(KITE)
  })
})

describe('where a row lands', () => {
  it('floors on both axes, so 95° at 14 kt reads the 90° row and the 12 kt column', () => {
    const { cells } = data([row({ twa: 95, tws: 14 })])

    expect(cellTotals(cellAt(cells, 90, 12).slices).rows).toBe(1)
    expect(cellTotals(cellAt(cells, 90, 6).slices).rows).toBe(0)
  })

  it('reads the angle’s magnitude, so a port-tack row lands in the same cell', () => {
    const { cells } = data([row({ twa: -95 }), row({ twa: 95 })])
    expect(cellTotals(cellAt(cells, 90, 12).slices).rows).toBe(2)
  })

  it('holds the floor above the last column, where a threshold is not a ceiling', () => {
    const { cells } = data([row({ twa: 95, tws: 40 })])
    expect(cellTotals(cellAt(cells, 90, 25).slices).rows).toBe(1)
  })

  it('puts a row below either axis in no cell at all, and says how many', () => {
    const below = data([row({ tws: 3 }), row({ twa: 20 })])

    expect(below.rows_off_grid).toBe(2)
    expect(below.cells.every((cell) => cell.slices.length === 0)).toBe(true)
  })

  it('counts a row with no wind recorded as unplaced rather than placing it', () => {
    const unplaced = data([row({ tws: null }), row({ twa: null })])

    expect(unplaced.rows_unplaced).toBe(2)
    expect(unplaced.rows_off_grid).toBe(0)
  })

  it('excludes a row the Countable rule excludes, and states that it did', () => {
    const mixed = data([row({}), row({ countable: false })])

    expect(mixed.excluded_rows).toBe(1)
    expect(cellTotals(cellAt(mixed.cells, 90, 12).slices).rows).toBe(1)
    // Matching and counting are different questions: the ledger still saw both rows (ADR 0026).
    expect(mixed.ledger.matched_rows).toBe(2)
  })
})

describe('Cell Agreement, as a proportion over the cell’s own rows', () => {
  const agreement = (rows: readonly MatchableRow[]) =>
    cellTotals(cellAt(data(rows).cells, 90, 12).slices)

  it('agrees where every judgeable row carried what the cell prints', () => {
    const totals = agreement([row({}), row({})])

    expect(totals.agreement).toBe('agrees')
    expect(totals.verdicts).toEqual({ agrees: 2, differs: 0, 'off-chart': 0, 'not-recorded': 0 })
  })

  it('differs where every judgeable row carried something else', () => {
    expect(agreement([row({ sail: { recorded: 'definition', label: JIB } })]).agreement).toBe(
      'differs'
    )
  })

  it('reads Mixed where one cell holds both, which 38 of this archive’s cells do', () => {
    const totals = agreement([row({}), row({ sail: { recorded: 'definition', label: JIB } })])

    expect(totals.agreement).toBe('mixed')
    expect(totals.verdicts.agrees).toBe(1)
    expect(totals.verdicts.differs).toBe(1)
  })

  it('reads Not recorded where no row’s Sail Configuration was written down', () => {
    const totals = agreement([row({ sail: { recorded: 'not-recorded' } })])

    expect(totals.agreement).toBe('not-recorded')
    expect(totals.rows).toBe(1)
  })

  it('reads Off-chart where the only sail named no Sail Definition', () => {
    expect(agreement([row({ sail: { recorded: 'note-only' } })]).agreement).toBe('off-chart')
  })

  it('never counts Off-chart as disagreement', () => {
    // A cell where the crew flew the recommended sail and, for a while, something the chart has no
    // word for. That is the vocabulary running out, not the crew contradicting the chart (ADR 0023).
    const totals = agreement([row({}), row({ sail: { recorded: 'note-only' } })])

    expect(totals.agreement).toBe('agrees')
    expect(totals.verdicts['off-chart']).toBe(1)
    expect(totals.verdicts.differs).toBe(0)
  })

  it('has no rows to judge where a narrowing emptied the cell', () => {
    expect(agreement([]).agreement).toBe('no-rows')
  })

  it('counts Countable rows only, since every figure on the screen does', () => {
    expect(agreement([row({ countable: false })]).verdicts.agrees).toBe(0)
  })
})

describe('the figures are per-slice sums, so a narrowing re-aggregates', () => {
  const ROWS = [
    row({ sea: 'calm', sog: 6, target: 6, seconds: 600 }),
    row({ sea: 'slight', sog: 3, target: 6, seconds: 60 }),
  ]

  it('weighs each row by the seconds it lasted rather than one row one vote', () => {
    const totals = cellTotals(cellAt(data(ROWS).cells, 90, 12).slices)

    // A mean of percentages says 75%; the ratio of sums says what the boat did (ADR 0036).
    expect(totals.efficiency.polar_efficiency).toBeCloseTo((6 * 600 + 3 * 60) / (6 * 660))
  })

  it('re-reads a narrowed cell from the slices alone, with nothing re-queried', () => {
    const whole = cellAt(data(ROWS).cells, 90, 12)
    const narrowed = cellAt(data(ROWS, { buckets: { sea: ['calm'] }, range: null }).cells, 90, 12)

    const reAggregated = cellTotals(whole.slices.filter((slice) => slice.sea === 'calm'))

    expect(reAggregated.efficiency).toEqual(cellTotals(narrowed.slices).efficiency)
    expect(reAggregated.rows).toBe(1)
    expect(reAggregated.efficiency.polar_efficiency).toBeCloseTo(1)
  })

  it('counts the Races a cell was reached by, and never counts one twice', () => {
    const totals = cellTotals(
      cellAt(
        data([
          row({ race_id: 'race-a', sea: 'calm' }),
          row({ race_id: 'race-a', sea: 'slight' }),
          row({ race_id: 'race-b', sea: 'calm' }),
        ]).cells,
        90,
        12
      ).slices
    )

    expect(totals.races).toBe(2)
    expect(totals.rows).toBe(3)
  })

  it('accounts for every Countable row of a slice, figure or no figure', () => {
    const cell = cellAt(data([row({}), row({ target: null }), row({ seconds: null })]).cells, 90, 12)

    expect(cellTotals(cell.slices).rows).toBe(3)
    expect(cell.slices.map((slice) => countableRows(slice.efficiency)).reduce((a, b) => a + b)).toBe(
      3
    )
  })
})

describe('a cell a narrowing emptied, against one nothing ever reached', () => {
  const ROWS = [row({ sea: 'calm' })]

  it('keeps the unfiltered count, which is what the ghost is drawn from', () => {
    const narrowed = data(ROWS, { buckets: { sea: ['slight'] }, range: null })
    const ghost = cellAt(narrowed.cells, 90, 12)

    expect(cellTotals(ghost.slices).rows).toBe(0)
    expect(ghost.unfiltered_rows).toBe(1)
  })

  it('leaves a cell no Race ever reached at nought, so blank means blank', () => {
    expect(cellAt(data(ROWS).cells, 40, 6).unfiltered_rows).toBe(0)
  })

  it('counts the unfiltered rows over the archive and not over the match', () => {
    // The narrowing is on the sea state; the cell's own unfiltered count must not move with it.
    const wide = cellAt(data(ROWS).cells, 90, 12)
    const narrow = cellAt(data(ROWS, { buckets: { sea: ['slight'] }, range: null }).cells, 90, 12)

    expect(narrow.unfiltered_rows).toBe(wide.unfiltered_rows)
  })
})

describe('a cell that can never hold a percent of Target Speed', () => {
  it('marks the columns past the Polar’s last, and says why', () => {
    const { cells } = data([])
    const past = cellAt(cells, 90, 25)

    expect(past.target_reachable).toBe(false)
    expect(unreachableReason(past, DOMAIN)).toContain("past the Polar's last column (24 kt)")
  })

  it('leaves a column inside the Polar’s range reachable', () => {
    expect(cellAt(data([]).cells, 90, 12).target_reachable).toBe(true)
    expect(unreachableReason(cellAt(data([]).cells, 90, 12), DOMAIN)).toBeNull()
  })

  it('reads a cell’s whole span and not only the column it opens on', () => {
    // 24 kt is the Polar's last column, so the chart's 12 kt column — which runs to 25 — overlaps
    // it and the cell is reachable. The 25 kt column opens past the end and never can be.
    const narrowDomain: PolarDomain = { ...DOMAIN, tws_to: 13 }
    const reaching = getSailSelectionData([], EMPTY_FILTER, DIMENSIONS, CHART, narrowDomain)

    expect(cellAt(reaching.cells, 90, 12).target_reachable).toBe(true)
    expect(cellAt(reaching.cells, 90, 25).target_reachable).toBe(false)
  })

  it('answers unknown rather than yes where no Polar was in hand to ask', () => {
    const noPolar = getSailSelectionData([], EMPTY_FILTER, DIMENSIONS, CHART, null)

    // Null and not `true`: the question has no answer with no Polar read, and `true` everywhere
    // would let the screen count the region at nought — a plausible number in place of a missing
    // one, which is the one thing AGENTS.md forbids outright.
    expect(noPolar.cells.every((cell) => cell.target_reachable === null)).toBe(true)
    expect(unreachableReason(cellAt(noPolar.cells, 90, 25), null)).toBeNull()
  })

  it('has no count of the region to give where the Polar could not be read', () => {
    const noPolar = getSailSelectionData([], EMPTY_FILTER, DIMENSIONS, CHART, null)

    expect(gridCoverage(cellViews(noPolar.cells)).unreachable).toBeNull()
    expect(gridCoverage(cellViews(data([]).cells)).unreachable).toBe(2)
  })

  it('is a different state from a cell that holds rows and still has no figure', () => {
    const cell = cellAt(data([row({ target: null })]).cells, 90, 12)
    const totals = cellTotals(cell.slices)

    expect(cell.target_reachable).toBe(true)
    expect(totals.rows).toBe(1)
    expect(totals.efficiency.polar_efficiency).toBeNull()
  })
})

describe('a tapped cell’s breakdown', () => {
  const ROWS = [
    row({ sail: { recorded: 'definition', label: KITE }, sea: 'calm', hour: 14, sog: 6 }),
    row({ sail: { recorded: 'definition', label: JIB }, sea: 'slight', hour: 22, sog: 3 }),
    row({ sail: { recorded: 'not-recorded' }, sea: null, hour: 14, sog: 6, target: null }),
  ]

  const breakdown = cellBreakdown(cellAt(data(ROWS).cells, 90, 12), DIMENSIONS)

  it('gives each sail actually carried its own percent over its own rows', () => {
    const byId = new Map(breakdown.sails.map((line) => [line.id, line]))

    expect(byId.get(KITE)?.efficiency.polar_efficiency).toBeCloseTo(1)
    expect(byId.get(JIB)?.efficiency.polar_efficiency).toBeCloseTo(0.5)
    expect(byId.get(KITE)?.verdict).toBe('agrees')
    expect(byId.get(JIB)?.verdict).toBe('differs')
  })

  it('lists the rows whose sail was never written down, with their own figure', () => {
    const unrecorded = breakdown.sails.find((line) => line.id === 'not-recorded')

    expect(unrecorded?.label).toBe('Not recorded')
    expect(unrecorded?.about_the_record).toBe(true)
    expect(unrecorded?.rows).toBe(1)
    // No figure rather than the cell's average borrowed downward (ADR 0030).
    expect(unrecorded?.efficiency.polar_efficiency).toBeNull()
  })

  it('names a Sea State in the filter rail’s own words, Not recorded among them', () => {
    expect(breakdown.seas.map((line) => line.label).sort()).toEqual([
      'Calm (0–1 ft)',
      'Not recorded',
      'Slight (1–2 ft)',
    ])
  })

  it('splits day from night on the time dimension’s fixed clock', () => {
    const byId = new Map(breakdown.times.map((line) => [line.id, line]))

    expect(byId.get('day')?.rows).toBe(2)
    expect(byId.get('night')?.rows).toBe(1)
    expect(byId.get('night')?.efficiency.polar_efficiency).toBeCloseTo(0.5)
  })

  it('puts the most sailing first, so the largest line is never buried', () => {
    expect(breakdown.times[0].id).toBe('day')
  })

  it('has nothing to break down for a cell with no rows', () => {
    const empty = cellBreakdown(cellAt(data([]).cells, 40, 6), DIMENSIONS)
    expect(empty).toEqual({ sails: [], seas: [], times: [] })
  })
})

describe('what the grid says about itself', () => {
  it('counts reached, figure-bearing, unreachable, mixed and ghosted cells', () => {
    const rows = [
      row({ twa: 95, tws: 14 }),
      row({ twa: 95, tws: 14, sail: { recorded: 'definition', label: JIB } }),
      row({ twa: 45, tws: 7, target: null }),
    ]

    const coverage = gridCoverage(cellViews(data(rows).cells))

    expect(coverage).toEqual({
      cells: 6,
      reached: 2,
      with_figure: 1,
      rows_without_figure: 1,
      // Two angle rows × the one wind-speed column past the certificate's end.
      unreachable: 2,
      mixed: 1,
      ghosted: 0,
    })
  })

  it('counts a cell a narrowing emptied as ghosted rather than as reached', () => {
    const coverage = gridCoverage(
      cellViews(data([row({ sea: 'calm' })], { buckets: { sea: ['slight'] }, range: null }).cells)
    )

    expect(coverage.reached).toBe(0)
    expect(coverage.ghosted).toBe(1)
  })
})

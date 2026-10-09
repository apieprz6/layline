/**
 * The **Sail Selection Screen** over the boat's own chart and its own season.
 *
 * The regression guard, pinned as counts rather than shapes, for the reason `archive-targets.test.ts`
 * gives: these figures decide what the screen says about thirteen races that have already been
 * sailed, and the only way to notice a rule drifting is to write down what the archive measures
 * today and fail when it stops measuring that.
 *
 * Needs the owner's Crossover Chart, Polar and recordings, so it skips loudly without them — see
 * `boat-setup.ts`, `archive.ts` and `archive-annotations.ts`.
 *
 * 🚨 **Every one of those files is read through `once()`, inside a test body.** Jest executes a
 * `describe.skip` callback at collection time and skips only the `it`s inside it, so a read at
 * describe scope takes the whole suite down on a machine without the files instead of skipping.
 */

import {
  archiveChart,
  archiveDomain,
  archiveMonths,
  archiveRows,
  describeArchiveScreen,
  once,
} from '@/services/analysis/__tests__/archive-screen'
import { countableRows } from '@/services/analysis/efficiency'
import {
  EMPTY_FILTER,
  SAIL_SELECTION_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'
import {
  cellTotals,
  getSailSelectionData,
  gridCoverage,
  type CellVerdict,
  type SailSelection,
} from '@/services/analysis/sail-selection'
import type { AnalysisFilter } from '@/types'

/** The screen's own five dimensions, over the archive's own months. */
const dimensions = once(() =>
  analysisDimensions(SAIL_SELECTION_DIMENSIONS, { sails: [], months: archiveMonths() })
)

/** The whole archive laid over the boat's own chart, under one filter. */
function screenFor(filter: AnalysisFilter): SailSelection {
  return getSailSelectionData(archiveRows(), filter, dimensions(), archiveChart(), archiveDomain())
}

const screen = once((): SailSelection => screenFor(EMPTY_FILTER))

/** Every verdict in the archive, in Countable rows — the proportion, not a per-cell flag. */
const verdicts = once((): Record<CellVerdict, number> => {
  const total: Record<CellVerdict, number> = {
    agrees: 0,
    differs: 0,
    'off-chart': 0,
    'not-recorded': 0,
  }

  for (const cell of screen().cells) {
    const cellVerdicts = cellTotals(cell.slices).verdicts
    for (const verdict of Object.keys(total) as CellVerdict[]) {
      total[verdict] += cellVerdicts[verdict]
    }
  }

  return total
})

describeArchiveScreen('the grid is the boat’s own chart', () => {
  it('is 26 angles × 13 wind speeds, 338 cells', () => {
    const { twa_axis, tws_axis, cells } = screen()

    expect(twa_axis).toHaveLength(26)
    expect(tws_axis).toHaveLength(13)
    expect(cells).toHaveLength(338)
    // The two columns that decide how much of the grid can ever hold a figure, and the irregular
    // step at 25 that makes a floor lookup — not a nearest-column one — the right reading.
    expect(tws_axis.slice(-3)).toEqual([24, 25, 30])
    expect(twa_axis[0]).toBe(35)
  })

  it('prints a recommendation in every one of them', () => {
    expect(screen().cells.every((cell) => cell.recommendation !== null)).toBe(true)
  })
})

describeArchiveScreen('what thirteen races reached', () => {
  /**
   * **2,698 Countable rows, not the 2,707 ADR 0030 quotes**, and the nine are already accounted
   * for: the prototype that measured the ADR's figures detected Maneuvers *after* clipping to the
   * Race Window, and the shipped engine detects before, because a flip before the gun still has
   * the boat recovering into the race's first rows (ADR 0009). `archive-maneuvers.test.ts` pins
   * 2,698 and `archive-paddlewheel.test.ts` records the same nine-row difference by name. This
   * reads the shipped figure, so the screen and the rest of the app cannot disagree about which
   * rows a season is made of.
   */
  it('reproduces the archive’s own row counts through the Countable rule', () => {
    const all = archiveRows()

    expect(all).toHaveLength(4088)
    expect(all.filter((row) => row.countable)).toHaveLength(2698)
  })

  it('reaches 150 of the 338 cells', () => {
    expect(gridCoverage(screen().cells).reached).toBe(150)
  })

  it('holds 38 cells where the crew both agreed and differed with the chart', () => {
    expect(gridCoverage(screen().cells).mixed).toBe(38)
  })

  it('leaves no cell ghosted, since nothing is narrowed', () => {
    expect(gridCoverage(screen().cells).ghosted).toBe(0)
  })
})

describeArchiveScreen('the region that can never hold a percent of Target Speed', () => {
  /**
   * **52 cells, not the 74 LAY-158's acceptance criteria quote** — and the difference is a document
   * that was already amended rather than a drift in the rule.
   *
   * ADR 0030 measured 74: the chart's 35° and 40° rows, below what was then read as the Polar's
   * first trustworthy angle, plus its 25 and 30 kt columns, past the certificate's last. ADR 0036
   * then overturned the first half — trust is per *cell*, this certificate's filler ramp clears at
   * a different angle in every wind-speed column, and a **Filler-Anchored** figure is shown with a
   * flag rather than withheld. ADR 0030 carries that amendment in writing, and it says in as many
   * words that its state 4 "survives only for a cell truly past either axis's defined range".
   *
   * What survives is the two wind-speed columns: 26 angles × 2 columns = 52. It is a property of
   * the two artifacts' shapes and not of how much racing has been logged, and it will not move
   * until the Polar gains measured columns above 24 knots.
   */
  it('is the two wind-speed columns past the certificate’s last, and nothing else', () => {
    const { cells } = screen()
    const unreachable = cells.filter((cell) => !cell.target_reachable)

    expect(unreachable).toHaveLength(52)
    expect([...new Set(unreachable.map((cell) => cell.tws))]).toEqual([25, 30])
    // The angle rows ADR 0030 originally counted into that region are reachable again (ADR 0036).
    expect(cells.filter((cell) => cell.twa === 35).every((cell) => cell.tws >= 25)).toBe(false)
    expect(
      cells.filter((cell) => cell.twa === 35 && cell.tws === 12)[0].target_reachable
    ).toBe(true)
  })

  it('shows a Filler-Anchored figure in that region rather than withholding one', () => {
    const ramp = screen()
      .cells.filter((cell) => cell.twa <= 40 && cell.target_reachable)
      .map((cell) => cellTotals(cell.slices))
      .filter((totals) => totals.rows > 0)

    expect(ramp.length).toBeGreaterThan(0)
    expect(ramp.some((totals) => totals.efficiency.filler_anchored_rows > 0)).toBe(true)
    expect(ramp.every((totals) => totals.efficiency.polar_efficiency !== null)).toBe(true)
  })
})

describeArchiveScreen('Cell Agreement over the whole archive', () => {
  /**
   * ADR 0030 publishes 947 / 298 / 1,299 off the prototype's 2,707 Countable rows. The shipped
   * engine's 2,698 give 946 / 295 / 1,298 — the same nine-row difference as above, landing five
   * rows inside a cell and four outside one. Pinned as measured, with the ADR's figures named, for
   * the reason `archive-targets.test.ts` names ADR 0036's undercount: the measurement is the
   * evidence, and a quietly adjusted number is how a drifting rule goes unnoticed.
   */
  it('counts the rows that agreed, differed, and were never written down', () => {
    expect(verdicts()).toEqual({
      agrees: 946,
      differs: 295,
      'off-chart': 0,
      'not-recorded': 1298,
    })
  })

  it('accounts for every Countable row that reached a cell', () => {
    const placed = Object.values(verdicts()).reduce((total, count) => total + count, 0)
    const countable = archiveRows().filter((row) => row.countable).length

    // The rest reached no cell at all, and the screen says how many and why.
    expect(placed + screen().rows_off_grid + screen().rows_unplaced).toBe(countable)
  })

  it('leaves Off-chart empty, because the unnameable sail was flown below the chart', () => {
    // Four rows at TWS 3.0–3.6 kt under the chart's own 4 kt first column: no floor, so no cell and
    // nothing to have disagreed with. The state is reserved for the day a boat flies mainsail alone
    // in raceable wind (ADR 0030).
    expect(verdicts()['off-chart']).toBe(0)

    const noteOnly = archiveRows().filter((row) => row.countable && row.sail.recorded === 'note-only')
    expect(noteOnly).toHaveLength(4)
    expect(Math.max(...noteOnly.map((row) => row.tws ?? 0))).toBeLessThan(4)
  })

  it('reads nearly half the Countable rows as Not recorded, which is a state and not a gap', () => {
    const { agrees, differs } = verdicts()
    const notRecorded = verdicts()['not-recorded']

    expect(notRecorded).toBeGreaterThan(agrees + differs)
  })
})

describeArchiveScreen('a narrowing, re-aggregated from the slices', () => {
  it('empties cells and leaves them ghosted rather than blank', () => {
    const moderate = screenFor({ buckets: { sea: ['moderate'] }, range: null })

    const narrowed = gridCoverage(moderate.cells)
    const whole = gridCoverage(screen().cells)

    expect(narrowed.reached).toBeLessThan(whole.reached)
    expect(narrowed.ghosted).toBe(whole.reached - narrowed.reached)
  })

  it('re-reads every narrowed cell from the unnarrowed slices, with nothing re-queried', () => {
    const calm = screenFor({ buckets: { sea: ['calm'] }, range: null })

    const byKey = new Map(calm.cells.map((cell) => [`${cell.twa}:${cell.tws}`, cell]))

    for (const cell of screen().cells) {
      const narrowed = byKey.get(`${cell.twa}:${cell.tws}`)
      const reAggregated = cellTotals(cell.slices.filter((slice) => slice.sea === 'calm'))

      expect(reAggregated.rows).toBe(cellTotals(narrowed?.slices ?? []).rows)
      expect(reAggregated.efficiency.polar_efficiency).toBe(
        cellTotals(narrowed?.slices ?? []).efficiency.polar_efficiency
      )
    }
  })

  it('keeps each cell’s own slices adding up to the cell', () => {
    for (const cell of screen().cells) {
      const totals = cellTotals(cell.slices)
      const summed = cell.slices
        .map((slice) => countableRows(slice.efficiency))
        .reduce((total, count) => total + count, 0)

      expect(summed).toBe(totals.rows)
    }
  })
})

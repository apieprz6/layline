/**
 * Target Speed, the Crossover Chart lookup and the aggregate, over the boat's own two artifacts
 * and its own season.
 *
 * The regression guard, pinned as counts rather than shapes, for the same reason Row Quality's and
 * Maneuvers' are: these figures decide what a race page says about a race that has already been
 * read, and the only way to notice a rule drifting is to write down what the archive measures today
 * and fail when it stops measuring that.
 *
 * Needs the owner's Boat Setup files throughout and the owner's recordings for the last block, so
 * it skips loudly without either — see `archive.ts` and `boat-setup.ts`.
 *
 * 🚨 **Every one of those files is read through `once()`, inside a test body.** Jest executes a
 * `describe.skip` callback at collection time and skips only the `it`s inside it, so a read at
 * describe scope runs on a machine that has neither file set and takes the whole suite down with a
 * `TypeError` instead of skipping — which is exactly what the first version of this file did.
 *
 * ## The one figure here that corrects a document
 *
 * ADR 0036's prose says the row-level floor "discards six real cells at TWA 40 and seven at TWA
 * 45". Six at 40 is right. At 45 it is **eight**, which is what the ADR's own measured table two
 * paragraphs above says — one ramp cell in the lightest column, the remaining eight real — and what
 * this implementation reads off the certificate. The table is the measurement; the sentence
 * undercounts it by one. LAY-154's acceptance criteria quote the sentence, so this is written down
 * rather than quietly reproduced.
 */

import {
  describeBoatSetup,
  ownCrossoverChart,
  ownPolar,
} from '@/services/analysis/__tests__/boat-setup'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import type { ScorableRow } from '@/services/analysis/efficiency'
import {
  aggregateEfficiency,
  computeRowEfficiency,
  scorableRows,
} from '@/services/analysis/efficiency'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import {
  classifyPolarCells,
  isAnchorable,
  polarSuppression,
} from '@/services/boat/polarSyntheticRows'
import {
  archiveFilenames,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { assessRowQuality } from '@/services/recordings/row-quality'

/** The last block needs the recordings *as well as* the two artifacts. */
const describeSeason = archiveFilenames.length > 0 ? describeBoatSetup : describe.skip

/**
 * Deferred until first asked for, then kept.
 *
 * Deferred because of the collection-time hazard at the top of this file; kept because the
 * certificate is classified cell by cell and the season is thirteen files parsed, assessed and
 * joined, and several tests want the same answer.
 */
function once<T>(build: () => T): () => T {
  let cached: { value: T } | null = null
  return () => (cached ??= { value: build() }).value
}

const polar = once(ownPolar)
const cells = once(() => classifyPolarCells(polar()))
const targets = once(() => polarTargets(polar()))
const chart = once(ownCrossoverChart)
const chartLookup = once(() => crossoverLookup(chart()))

describeBoatSetup("the boat's own certificate, read per cell", () => {
  const realAt = (twa: number): number =>
    cells()[polar().twa_axis.indexOf(twa)].filter((origin) => isAnchorable(origin)).length

  it('is the nine-column ORC axis the research confirmed', () => {
    expect(polar().tws_axis).toEqual([4, 6, 8, 10, 12, 14, 16, 20, 24])
    // prettier-ignore
    expect(polar().twa_axis).toEqual([
      30, 35, 40, 45, 52, 60, 75, 90, 100, 110, 120, 135, 150, 160, 170, 180,
    ])
  })

  it("reproduces ADR 0036's measured table of this certificate's filler", () => {
    const table = polar()
      .twa_axis.slice(0, 5)
      .map((twa, row) => {
        const kinds = cells()[row].map((origin) => (isAnchorable(origin) ? 'real' : 'ramp'))
        return `${twa} ${kinds.join(' ')}`
      })

    expect(table).toEqual([
      '30 ramp ramp ramp ramp ramp ramp ramp ramp ramp',
      '35 ramp ramp ramp ramp ramp ramp ramp ramp ramp',
      '40 ramp ramp ramp real real real real real real',
      '45 ramp real real real real real real real real',
      '52 real real real real real real real real real',
    ])
  })

  it('recovers the cells the row-level floor discards', () => {
    // The whole reason the per-cell rule exists. See the note at the top of this file for the one
    // number here that differs from ADR 0036's prose.
    expect(polarSuppression(polar()).firstTrustworthyTwa).toBe(52)

    expect(realAt(30)).toBe(0)
    expect(realAt(35)).toBe(0)
    expect(realAt(40)).toBe(6)
    expect(realAt(45)).toBe(8)
  })

  it('has no empty cell anywhere in it, so nothing it answers is missing for that reason', () => {
    // Why the archive figures below are unaffected by the empty-cell rule, and worth asserting
    // rather than assuming: a certificate tabulates a speed at every cell it has, and the
    // `no-data` state belongs to library polars with untabulated columns.
    expect(cells().flat()).not.toContain('no-data')
  })

  it('finds this certificate has one interpolated row, which may still anchor a target', () => {
    // TWA 100 is the exact arithmetic mean of 90 and 110 in all nine columns — a generator's
    // smoothing, not the boat's own speed, and anchorable all the same (ADR 0028).
    const row100 = cells()[polar().twa_axis.indexOf(100)]

    expect(row100.every((origin) => origin === 'interpolated')).toBe(true)
    expect(realAt(100)).toBe(9)
  })

  it("scores the boat's whole beat-angle range, which the row floor suppressed entirely", () => {
    // Beat angle runs 47° to 40° across this axis, every one of those at or below the 52° floor.
    for (const twa of [40, 43, 45, 47, 50]) {
      expect(targets().targetSpeed(twa, 12)).not.toBeNull()
    }
  })

  it('still reports missing past the certificate’s own last column', () => {
    // ORC Rule 402.2 caps a certificate at 24 knots. The boat does not stop there, and ADR 0028's
    // out-of-axis rule is untouched by the per-cell change.
    expect(targets().targetSpeed(90, 24)).not.toBeNull()
    expect(targets().targetSpeed(90, 25)).toBeNull()
    expect(targets().targetSpeed(29, 12)).toBeNull()
  })
})

describeBoatSetup("the boat's own Crossover Chart, floored against that certificate", () => {
  it('is the thirteen-column chart with the 25-knot breakpoint in it', () => {
    expect(chart().tws_axis).toEqual([4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30])
    expect(chart().twa_axis).toHaveLength(26)
    expect(chart().cells.flat()).toHaveLength(338)
  })

  it('reads the 25-knot column where the sail actually changes, and not before', () => {
    // The column differs from its 24-knot neighbour in 6 of 26 rows and from 30 in 18 of 26: it is
    // where the A2 is retired at deep angles before everything collapses by 30 kt (ADR 0028).
    const at = chart().tws_axis.indexOf(25)
    const differsFrom = (other: number): number =>
      chart().cells.filter((row) => row[at] !== row[chart().tws_axis.indexOf(other)]).length

    expect(differsFrom(24)).toBe(6)
    expect(differsFrom(30)).toBe(18)
  })

  it('keeps a boat at 24.6 knots on the 24-knot recommendation', () => {
    expect(chartLookup().recommend(140, 24.6)?.chart_tws).toBe(24)
    expect(chartLookup().recommend(140, 25)?.chart_tws).toBe(25)
  })

  describe("the two grids' mismatched axes, measured", () => {
    /** Every chart cell, with whether the Polar can put a percent of target in it. */
    const scored = once(() =>
      chart().twa_axis.flatMap((twa) =>
        chart().tws_axis.map((tws) => ({ twa, tws, target: targets().targetSpeed(twa, tws) }))
      )
    )

    it('leaves 52 cells with no Target Speed at all — the 25 and 30 knot columns', () => {
      // ADR 0030 measured 74 such cells against the row-level floor. Per-cell trust recovers 22 of
      // them (TWA 35 and 40, across the eleven columns the certificate reaches), and the 52 that
      // remain are the two columns no certificate can express: ADR 0028's one true missing state.
      const missing = scored().filter((cell) => cell.target === null)

      expect(missing).toHaveLength(52)
      expect(new Set(missing.map((cell) => cell.tws))).toEqual(new Set([25, 30]))
      expect(74 - 52).toBe(22)
    })

    it('shows a flagged percent for 14 of the 22 recovered cells, and a clean one for 8', () => {
      // Not every recovered cell is Filler-Anchored. TWA 40 is the boat's own measured speed from
      // 10 knots up, so eight of its cells carry an unflagged target; TWA 35 is manufactured in
      // every column, and TWA 40's lightest three are still on the ramp.
      const recovered = scored().filter(
        (cell) => (cell.twa === 35 || cell.twa === 40) && cell.target !== null
      )

      expect(recovered).toHaveLength(22)
      expect(recovered.filter((cell) => cell.target?.filler_anchored)).toHaveLength(14)
      expect(recovered.filter((cell) => !cell.target?.filler_anchored)).toHaveLength(8)
    })

    it('answers at the chart’s own 18 and 22 knot columns, which no certificate measures', () => {
      // Never resampled onto the Polar's axis, in either direction (ADR 0028).
      expect(polar().tws_axis).not.toContain(18)
      expect(targets().targetSpeed(90, 18)).not.toBeNull()
      expect(chartLookup().recommend(90, 18)?.chart_tws).toBe(18)
    })
  })
})

describeSeason('a season of races, scored against those two artifacts', () => {
  /** One recording, in the only order this is ever computed in: assess whole, then clip. */
  function race(filename: string): ScorableRow[] {
    const rows = transcribe(filename).transcription.rows
    const quality = assessRowQuality(rows)
    const assessed = analysisRows(quality, detectManeuvers(rows, quality))
    const inside = new Set(
      analysisRowsWithin(assessed, raceWindowFor(filename)).map((at) => at.row_index)
    )

    return scorableRows(rows, assessed).filter((at) => inside.has(at.row_index))
  }

  const season = once(() =>
    archiveFilenames.map((filename) => ({ filename, rows: race(filename) }))
  )
  const windows = once(() => season().map(({ rows }) => aggregateEfficiency(rows, targets())))

  it('scores every race in the archive without a single row throwing', () => {
    expect(season()).toHaveLength(13)
    expect(season().every(({ rows }) => rows.length > 0)).toBe(true)
  })

  it('never fabricates a Target Speed for a row outside the certificate', () => {
    // The structural gap: the chart reaches 30 knots and the certificate stops at 24. Pinned as a
    // positive count, because a suite that only asserted "no nulls" would pass on an
    // implementation that clamped them away.
    const offAxis = season().flatMap(({ rows }) =>
      rows.filter(
        (row) => row.countable && computeRowEfficiency(row, targets()).target_speed === null
      )
    )

    expect(offAxis.length).toBeGreaterThan(0)
  })

  it('computes a Filler-Anchored figure for the rows the old floor would have silenced', () => {
    // The rows sailed at or below TWA 45 in light air. Under the row-level floor every one of them
    // read as "no data" for a race that actually happened (ADR 0036).
    const flagged = season().flatMap(({ rows }) =>
      rows.filter(
        (row) => row.countable && computeRowEfficiency(row, targets()).target_speed?.filler_anchored
      )
    )

    expect(flagged.length).toBeGreaterThan(0)
    // And every one of them carries a number, which is the entire point.
    expect(
      flagged.every((row) => (computeRowEfficiency(row, targets()).target_speed?.knots ?? 0) > 0)
    ).toBe(true)
  })

  it('aggregates a race as a ratio of sums, not a mean of its rows’ percentages', () => {
    /**
     * The archive's first race — 3 June, a beer can — pinned whole, because this is the figure a
     * race page states. 49 Countable rows carry an interval and a target across 1,470 measured
     * seconds; 6 of them are Filler-Anchored and 1 sits outside the certificate's axes.
     *
     * Polar Efficiency reads **92.77%** as a ratio of sums and **95.16%** as a mean of the same 49
     * rows' own percentages — two and a half points of difference, from six rows out of forty-nine,
     * which is precisely the domination ADR 0036 ruled the mean out over.
     */
    const { filename, rows } = season()[0]
    const figure = windows()[0]

    const percentages = rows
      .filter((row) => row.countable)
      .map((row) => computeRowEfficiency(row, targets()).polar_efficiency)
      .filter((at): at is number => at !== null)
    const mean = percentages.reduce((sum, at) => sum + at, 0) / percentages.length

    expect(filename).toBe('06-03-26-beer-can.csv')
    expect(figure.rows).toBe(49)
    expect(figure.filler_anchored_rows).toBe(6)
    expect(figure.rows_without_target).toBe(1)
    expect(figure.elapsed_seconds).toBe(1470)
    expect(figure.polar_efficiency).toBeCloseTo(0.9277, 4)
    expect(mean).toBeCloseTo(0.9516, 4)

    // VMG Efficiency is the harsher number, and should be: it judges the steering angle too.
    expect(figure.vmg_efficiency).toBeCloseTo(0.7496, 4)
    expect(figure.vmg_efficiency).toBeLessThan(figure.polar_efficiency as number)
  })

  it('weights each race by its own measured elapsed time, never by a cadence', () => {
    // One recording's median in-window cadence is 75 seconds. A flat per-row weight would read
    // these races as far closer in length than they are.
    expect(windows().every((figure) => figure.elapsed_seconds > 0)).toBe(true)

    // The longest race is a distance race and the shortest a twenty-minute beer can: an order of
    // magnitude apart in time, which a row count alone does not express.
    const seconds = windows().map((figure) => figure.elapsed_seconds)
    expect(Math.max(...seconds) / Math.min(...seconds)).toBeGreaterThan(10)
  })

  it('states the Filler-Anchored rows behind every race figure rather than hiding them', () => {
    expect(windows().every((figure) => figure.filler_anchored_rows <= figure.rows)).toBe(true)
    expect(windows().some((figure) => figure.filler_anchored_rows > 0)).toBe(true)
  })

  it('accounts for every Countable row of every race in one of three tallies', () => {
    // ADR 0025's coverage requirement, over the real season rather than a fixture: no row that
    // left a figure goes untallied.
    season().forEach(({ rows }, index) => {
      const figure = windows()[index]
      const countable = rows.filter((row) => row.countable).length

      expect(figure.rows + figure.rows_without_target + figure.rows_without_interval).toBe(
        countable
      )
    })
  })

  it('re-aggregates to a season figure by adding sums, not averaging ratios', () => {
    const actual = windows().reduce((sum, at) => sum + at.actual_distance_nm, 0)
    const target = windows().reduce((sum, at) => sum + at.target_distance_nm, 0)
    const ratios = windows()
      .map((at) => at.polar_efficiency)
      .filter((at): at is number => at !== null)

    const seasonFigure = actual / target
    const averaged = ratios.reduce((sum, at) => sum + at, 0) / ratios.length

    // Pinned to four places as the regression guard, both of them, because the difference between
    // the two methods is the claim: a season of thirteen races an order of magnitude apart in
    // length reads 92.43% by distance and 92.84% by averaging each race's own ratio. Four tenths
    // of a point here, where every race happens to sail near the same efficiency — it is the
    // *rows* inside a race that the two methods disagree about violently, which is what the
    // per-race assertion above measures.
    expect(seasonFigure).toBeCloseTo(0.9243, 4)
    expect(averaged).toBeCloseTo(0.9284, 4)
  })
})

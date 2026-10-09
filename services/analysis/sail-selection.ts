/**
 * The **Sail Selection Screen**'s aggregation: ADR 0026's `getSailSelectionData`, as ADR 0030
 * specified it.
 *
 * It lays a season of **Recording Rows** onto the boat's own **Crossover Chart** — 26 angles × 13
 * wind speeds, 338 cells on this boat — and answers, per cell, the three things the screen draws
 * over the chart's own recommendation: how much racing reached it, how that racing went against
 * the **Polar**, and whether the sail carried was the one printed. The chart layer itself is not
 * here, because the chart is not aggregated: it is the payload, drawn as it stands.
 *
 * Isomorphic, like everything else in this directory: ADR 0029 runs it in the browser on every
 * chip tap, so nothing here may import a server-only module.
 *
 * ## Per-slice sums, never a per-cell average
 *
 * ADR 0030's standing requirement, and the one structural decision in this file. A cell does not
 * hold a percent — it holds one `EfficiencyAggregate` per (**Sail Configuration**, **Sea State**,
 * time of day) slice, and the cell's own figure is those slices added up (`cellTotals`). Two things
 * fall out of that and neither survives storing an average:
 *
 *   - **A narrowing re-aggregates.** Drop the slices a filter excludes, add the rest, and the
 *     figure is right — no second pass over the archive, and nothing re-queried.
 *   - **Every breakdown line carries its own percent over its own rows.** 140° at 10 kt reads one
 *     figure across its hundred rows and quite another under each sail that actually flew there,
 *     and a sailor acts on the sub-figure (ADR 0030).
 *
 * The sums are ratios of summed distances, weighted by each row's own measured interval — ADR
 * 0036's rule, not ADR 0030's original wording. ADR 0030 described the cell figure as "an average
 * of per-row Polar Efficiency"; ADR 0036 later ruled a mean of per-row percentages out everywhere,
 * naming this screen as one of its consumers, because a **Filler-Anchored** row's percentage can
 * run arbitrarily high and a mean lets a handful of them carry a cell. `mergeEfficiency` is the
 * same arithmetic over slices that `sumEfficiency` is over rows, so both readings of a cell agree.
 *
 * ## Countable rows only, and the rows that land nowhere are counted
 *
 * Every figure on the screen reads **Countable** rows (ADR 0025), so a cell's coverage is Countable
 * coverage and the rows the rule excludes are reported rather than dropped silently. Two more
 * kinds of row reach no cell at all, and both are stated for the same reason: one whose `TWA` or
 * `TWS` was never recorded cannot be placed, and one *below* either of the chart's axes has no
 * floor and therefore no recommendation to have agreed or disagreed with — the four rows of the 26
 * Aug race that flew mainsail alone at 3.0–3.6 knots are the archive's own example (ADR 0030).
 */

import { coverageLedger } from '@/services/analysis/coverage-ledger'
import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { countableRows, mergeEfficiency, sumEfficiency } from '@/services/analysis/efficiency'
import { NOTE_ONLY, NOT_RECORDED, bucketOf, matchedRows } from '@/services/analysis/filter'
import type { PolarDomain } from '@/services/analysis/polar-targets'
import type {
  AnalysisDimension,
  AnalysisDimensionSpec,
  AnalysisFilter,
  CoverageLedger,
  CrossoverChartPayload,
  EfficiencyAggregate,
  MatchableRow,
  SailRecommendation,
} from '@/types'

/**
 * What one row says about its own cell's recommendation.
 *
 * Two verdicts and three ways to have none, kept apart because they are different facts and a
 * single "no" would flatten a decision somebody made on the water, a gap in the archive and the
 * edge of a vocabulary into one shrug (ADR 0038's reasoning, at this grain).
 *
 * **Off-chart is not disagreement.** A **Sail Configuration** that names no **Sail Definition** is
 * the vocabulary running out, not the crew contradicting the chart's advice (ADR 0023, ADR 0030) —
 * and the same verdict covers the mirror case, a chart cell whose sail number names no Definition
 * of its own Version, because there too one side of the comparison has no word for what it holds.
 *
 * **Other-version is reserved and empty**, like `off-chart` before it. A row whose Race was sailed
 * under a different **Crossover Chart Version** has its sail written in a different vocabulary, so
 * the integer comparison ADR 0038 fixes is not available and nothing may be concluded — see
 * `verdictOf`. This boat has one Version, so no row is in this state today.
 */
export type CellVerdict =
  | 'agrees'
  | 'differs'
  | 'off-chart'
  | 'not-recorded'
  | 'other-version'

/**
 * **Cell Agreement**: what a cell's Countable rows, taken together, say about its recommendation.
 *
 * The four verdicts plus `mixed` — a cell holding both agreeing and differing rows, which 38 of
 * this archive's do — and `no-rows` for a cell the narrowing or the season left empty. Never a
 * verdict on the chart: a cell where the crew flew something else is a cell worth looking at, and
 * the word is never "wrong" (ADR 0030).
 */
export type CellAgreement = CellVerdict | 'mixed' | 'no-rows'

/**
 * One (Sail Configuration, Sea State, time of day) slice of one cell, as sums.
 *
 * The three keys are **bucket ids** in the **Analysis Filter**'s own vocabulary, so a renderer
 * labels a line from the same registry the rail draws from and no second spelling of "Not
 * recorded" enters the codebase. The sail is keyed the way `bucketOf` keys it even though this
 * screen's rail has no sail chip (ADR 0029): the vocabulary is the chart's either way.
 */
export interface SailSelectionSlice {
  /** A **Sail Definition**'s label, `NOTE_ONLY`, or `NOT_RECORDED`. */
  sail: string
  /** A **Sea State** value, or `NOT_RECORDED`. */
  sea: string
  /** `day` or `night`, on the `time` dimension's fixed clock. */
  time: string
  /** How this slice's sail stood against *this cell's* recommendation. */
  verdict: CellVerdict
  /** The sums over this slice's own Countable rows. Add them, never average them. */
  efficiency: EfficiencyAggregate
  /**
   * Which Races these rows come from.
   *
   * Ids and not a count, because a count cannot be re-aggregated: one Race reaches a cell in
   * several slices, and adding two slices' race counts would count it twice.
   */
  race_ids: readonly string[]
}

/** One cell of the grid — reached or not, and reachable by a figure or not. */
export interface SailSelectionCell {
  /** This cell's own index in the chart's grid, which is what `cells[row][column]` is read with. */
  row: number
  column: number
  /** The chart's own axis values for this cell, which is what a sentence about it prints. */
  twa: number
  tws: number
  /** The sail number the chart's cell holds, printed whether or not it resolves to a Definition. */
  sail_number: number | null
  /** What the chart calls for here. Null only where that number names no Definition. */
  recommendation: SailRecommendation | null
  /** Per-slice sums over this cell's matched, Countable rows. Empty where none matched. */
  slices: SailSelectionSlice[]
  /**
   * Countable rows this cell holds with the **filter cleared** — what a ghost is drawn from.
   *
   * A cell a narrowing emptied keeps a dotted outline rather than going blank, because silently
   * blanking loses the one thing a sailor wants from a narrowing: what it cost (ADR 0030).
   */
  unfiltered_rows: number
  /**
   * Whether a **Target Speed** can exist anywhere in this cell, ever — or **null** for *unknown*.
   *
   * False only where the cell's whole region lies outside the **Polar**'s own axes, which on this
   * boat is the chart's 25 and 30 knot columns against a certificate that stops at 24 — a property
   * of the two artifacts' shapes and not of how much racing has been logged (ADR 0028, ADR 0030).
   *
   * **Null where no Polar was in hand to ask**, and null rather than `true` on purpose. A failed or
   * absent Polar read means the question cannot be answered, and answering it `true` would let a
   * screen count the region at nought — a plausible number standing in for a missing one, which is
   * the one thing `AGENTS.md` forbids outright. A renderer draws a null cell the way it draws a
   * reachable one, because an unknown limit is no reason to dash a cell; what it must not do is
   * *state* the limit, and the null is what stops it.
   */
  target_reachable: boolean | null
}

/** What the Sail Selection Screen draws. Typed here and not centrally: nothing else names it. */
export interface SailSelection {
  /** Always present, narrowed or not (ADR 0029). */
  ledger: CoverageLedger
  /** The chart's axes, so a renderer draws the grid without re-deriving its geometry. */
  twa_axis: readonly number[]
  tws_axis: readonly number[]
  /** Row-major, **every** cell of the chart, reached or not — 338 of them on this boat. */
  cells: SailSelectionCell[]
  /** Matched Countable rows below one of the chart's axes: no floor, so no cell (ADR 0030). */
  rows_off_grid: number
  /** Matched Countable rows with no `TWA` or no `TWS` recorded, which cannot be placed at all. */
  rows_unplaced: number
  /** Matched rows the **Countable** rule excludes, which ADR 0025 asks every screen to state. */
  excluded_rows: number
}

/** A cell's figures, read off its slices. The fold ADR 0030's "sums travel" rule exists for. */
export interface CellTotals {
  /** Countable rows behind this cell, matched. */
  rows: number
  /** Races at least one of those rows comes from. */
  races: number
  /** The slices' sums added, with the ratios recomputed — never their ratios averaged. */
  efficiency: EfficiencyAggregate
  /** The verdict tallies, in Countable rows. **Cell Agreement** is a proportion (ADR 0030). */
  verdicts: Record<CellVerdict, number>
  /** The cell's own reading of those tallies. */
  agreement: CellAgreement
}

/** One line of a tapped cell's breakdown, carrying its own percent of target over its own rows. */
export interface BreakdownLine {
  /** The bucket id this line groups, for a stable key and for a test to name a line by. */
  id: string
  /** The value's own words, from the screen's registry where it has one. */
  label: string
  /** Whether this line is about the **record** rather than the water (ADR 0029). */
  about_the_record: boolean
  rows: number
  efficiency: EfficiencyAggregate
  /** How this sail stood against the cell's recommendation. Null on the other two groups. */
  verdict: CellVerdict | null
}

/** A tapped cell, broken down three ways. */
export interface CellBreakdown {
  /** Per **Sail Configuration** actually carried, plus the rows whose sail was never written down. */
  sails: BreakdownLine[]
  /** Per **Sea State**, **Not recorded** among them. */
  seas: BreakdownLine[]
  /** Day against night, on the `time` dimension's fixed clock. */
  times: BreakdownLine[]
}

/** The slice key: three bucket ids and a verdict, joined on a character none of them can hold. */
function sliceKey(sail: string, sea: string, time: string, verdict: CellVerdict): string {
  return `${sail}\u0000${sea}\u0000${time}\u0000${verdict}`
}

/**
 * A cell key, by grid index rather than by axis value, so nothing is re-floored to find it.
 *
 * Exported because it is also the screen's **selection identity** — which cell's breakdown is open
 * — so the grid, the sheet and the aggregation all have to spell it the same way. Four private
 * copies of one template string is three chances for a tap to open a neighbour's breakdown.
 */
export function cellKey(row: number, column: number): string {
  return `${row}:${column}`
}

/** What a cell nothing matched reads its slices from. Shared, because 188 cells ask for it. */
const NO_SLICES: ReadonlyMap<string, MatchableRow[]> = new Map()

/**
 * How one row's sail stands against one cell's recommendation.
 *
 * **An integer comparison, in one vocabulary** — ADR 0038's rule, and this module reads it the same
 * way `compareSailToChart` does at the per-row grain the Race Track Heatmap draws. A
 * **Sail Configuration** names a **Sail Definition** *number* of the Version its Race points at,
 * and so does the chart's own cell (ADR 0023); matching on names instead would make "Main + A2" and
 * "Main+A2" two different sails. `services/analysis/__tests__/sail-agreement-reconciliation.test.ts`
 * holds the two readings to the same answer, so "the two cannot disagree" is a test rather than a
 * sentence in an ADR.
 *
 * **Which makes the Version load-bearing here in a way it is not there.** The heatmap colours a row
 * against its own Race's chart; this screen draws **one** grid and lays a whole season over it. A
 * row from another Version is still *placed* — the grid's geometry is the drawn chart's, and the
 * boat really did sail at that angle and wind speed — but it cannot be *judged*, because its sail
 * number means something else in its own chart. That is `other-version`, and concluding anything
 * from it would be comparing two vocabularies' integers.
 *
 * Both ways the comparison can simply run out of words land on `off-chart`, which is never counted
 * as disagreement: the crew flew something the chart has no word for, or the chart's own cell holds
 * a sail number its Version no longer defines. Either way the vocabulary ran out on one side, and
 * that is not the crew contradicting the chart (ADR 0023, ADR 0030).
 */
function verdictOf(
  row: MatchableRow,
  recommendation: SailRecommendation | null,
  /** The Version the grid is drawn from, or null where the caller could not say which. */
  chartVersionId: string | null
): CellVerdict {
  if (row.sail.recorded === 'not-recorded') return 'not-recorded'
  if (row.sail.recorded === 'note-only' || recommendation === null) return 'off-chart'

  // Null on either side is not a mismatch: a caller that cannot name the drawn Version is not
  // evidence that the row came from another one, and this archive's Races that carry Sail
  // Configurations all point at the Version the chart is drawn from.
  if (
    chartVersionId !== null &&
    row.crossover_chart_version_id !== null &&
    row.crossover_chart_version_id !== chartVersionId
  ) {
    return 'other-version'
  }

  return row.sail.definition_number === recommendation.definition.number ? 'agrees' : 'differs'
}

/**
 * Whether one axis entry's own span overlaps a range at all.
 *
 * A chart cell is a **region**, not a point: it opens at its axis value and runs to the next one,
 * and the *last* entry runs on without end, because a crossover threshold's last column is a
 * threshold and not a ceiling (ADR 0028). So the question "can this cell ever hold a figure" is
 * about two intervals meeting, and `tws_axis[11] === 25` against a Polar stopping at 24 is the case
 * that matters: the span opens past the Polar's end, so nothing inside it can ever be scored.
 */
function spanReaches(
  axis: readonly number[],
  index: number,
  from: number,
  to: number
): boolean {
  const opens = axis[index]
  const closes = index + 1 < axis.length ? axis[index + 1] : Number.POSITIVE_INFINITY

  return opens <= to && closes > from
}

/**
 * Whether a cell of this chart can ever carry a percent of **Target Speed**, or null for unknown.
 *
 * Exported because the legend has to be able to say how large the region is, and the `–` it prints
 * there is a different fact from the `–` a cell with rows and no computable target prints — the two
 * are told apart by *where they are*, which means something has to be able to say where (ADR 0030).
 */
export function targetReachable(
  chart: CrossoverChartPayload,
  domain: PolarDomain | null,
  row: number,
  column: number
): boolean | null {
  if (domain === null) return null

  return (
    spanReaches(chart.twa_axis, row, domain.twa_from, domain.twa_to) &&
    spanReaches(chart.tws_axis, column, domain.tws_from, domain.tws_to)
  )
}

/**
 * The four ways a cell's region can fall outside the Polar's, each said twice.
 *
 * Twice because the two readers want different sentences about one fact. A **tapped cell** is
 * asking about itself and gets its own numbers — "25 kt is past the Polar's last column (24 kt)".
 * The **legend** is describing a region and has to say it once however many cells are in it, so
 * naming any one cell's numbers there would be arbitrary. One table rather than two, so the two
 * phrasings cannot come to disagree about the rule.
 *
 * Four and not one. This boat's region is its two top wind-speed columns, but a chart whose angle
 * axis ran past the Polar's, or opened below it, would get a sentence that was simply false — and
 * `spanReaches` can fail on either side of either axis.
 */
const UNREACHABLE_SIDES: readonly {
  holds(cell: UnreachableCell, domain: PolarDomain): boolean
  cell(cell: UnreachableCell, domain: PolarDomain): string
  region(domain: PolarDomain): string
}[] = [
  {
    holds: (cell, domain) => cell.tws > domain.tws_to,
    cell: (cell, domain) =>
      `${cell.tws} kt is past the Polar's last column (${domain.tws_to} kt), and a Target Speed is never extrapolated.`,
    region: (domain) =>
      `Past the Polar's last column (${domain.tws_to} kt) a Target Speed is never extrapolated.`,
  },
  {
    holds: (cell, domain) => cell.tws < domain.tws_from,
    cell: (cell, domain) =>
      `${cell.tws} kt is below the Polar's first column (${domain.tws_from} kt), so there is no bracket to interpolate inside.`,
    region: (domain) =>
      `Below the Polar's first column (${domain.tws_from} kt) there is no bracket to interpolate inside.`,
  },
  {
    holds: (cell, domain) => cell.twa > domain.twa_to,
    cell: (cell, domain) =>
      `${cell.twa}° is past the Polar's last tabulated angle (${domain.twa_to}°).`,
    region: (domain) => `Past the Polar's last tabulated angle (${domain.twa_to}°) there is nothing to read.`,
  },
  {
    holds: (cell, domain) => cell.twa < domain.twa_from,
    cell: (cell, domain) =>
      `${cell.twa}° is below the Polar's first tabulated angle (${domain.twa_from}°).`,
    region: (domain) =>
      `Below the Polar's first tabulated angle (${domain.twa_from}°) there is nothing to read.`,
  },
]

/** What saying why a cell is unreachable needs of it. */
type UnreachableCell = Pick<SailSelectionCell, 'twa' | 'tws' | 'target_reachable'>

/**
 * Said where no side matches, which `spanReaches` makes unreachable in both senses.
 *
 * Kept anyway rather than returned as null: a dash with no reason is the one thing ADR 0012 rules
 * out, and a sentence that is merely vague is still a reason.
 */
const OUTSIDE_THE_AXES =
  "This cell lies outside the Polar's own axes, where a Target Speed is never extrapolated."

/** Which side of the Polar's domain this cell falls outside, or null where it falls inside. */
function sideOf(
  cell: UnreachableCell,
  domain: PolarDomain | null
): (typeof UNREACHABLE_SIDES)[number] | null {
  if (cell.target_reachable !== false || domain === null) return null
  return UNREACHABLE_SIDES.find((side) => side.holds(cell, domain)) ?? null
}

/**
 * Why this cell can never hold a percent of target, in words, or null where it can or nobody knows.
 *
 * Said rather than left as a dash on its own, because ADR 0012's stance on absence is that it is a
 * legitimate answer *with a reason*, and because the structural `–` and the "rows but no target"
 * `–` would otherwise be indistinguishable.
 */
export function unreachableReason(
  cell: UnreachableCell,
  domain: PolarDomain | null
): string | null {
  if (cell.target_reachable !== false || domain === null) return null

  return sideOf(cell, domain)?.cell(cell, domain) ?? OUTSIDE_THE_AXES
}

/**
 * One sentence per region of the grid that can never hold a figure, in axis order, or none.
 *
 * What the legend prints. Read off the cells rather than asserted, and deduplicated by *side* so
 * that this chart's 25 and 30 knot columns are one sentence between them rather than two
 * near-identical ones.
 */
export function unreachableRegions(
  cells: readonly UnreachableCell[],
  domain: PolarDomain | null
): string[] {
  if (domain === null) return []

  const said = new Set<string>()
  let generic = false

  for (const cell of cells) {
    if (cell.target_reachable !== false) continue

    const side = sideOf(cell, domain)
    if (side === null) generic = true
    else said.add(side.region(domain))
  }

  // In the table's own order, not in the order the cells happened to be walked: the first two are
  // about wind speed and the last two about angle, which is how a sailor reads the grid.
  const ordered = UNREACHABLE_SIDES.map((side) => side.region(domain)).filter((each) =>
    said.has(each)
  )

  return generic ? [...ordered, OUTSIDE_THE_AXES] : ordered
}

/**
 * The screen's grid over one filter.
 *
 * The ledger is computed from the same rows and the same filter rather than from the matched set,
 * so its totals are the archive's and cannot drift from the grid beside them.
 *
 * ## Placed by the drawn chart, judged in its own Version
 *
 * `chart` is the **Crossover Chart** the grid is drawn from, and **every** row is placed on it —
 * a cell shows one recommendation, so "agrees" inside that cell has to mean agreement with *that*
 * recommendation, and judging each row against its own Race's Version would print `=` in a cell
 * whose sail the row never carried.
 *
 * Which is exactly why the two cannot be the same question. Placement is geometry and applies to
 * every row; the verdict is an integer comparison and is only meaningful inside one Version (ADR
 * 0038, ADR 0023). So a row from another Version is drawn where it sailed and left unjudged
 * (`other-version`) rather than name-matched across vocabularies. `chartVersionId` is what tells
 * the two apart; null where the caller cannot say, which claims nothing either way.
 */
export function getSailSelectionData(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  chart: CrossoverChartPayload,
  domain: PolarDomain | null,
  chartVersionId: string | null = null
): SailSelection {
  const lookup = crossoverLookup(chart)

  // The filter cleared, for the ghosts: a cell that had rows before this narrowing has to be able
  // to say so, and that is a fact about the whole archive rather than about the match.
  const unfiltered = new Map<string, number>()
  for (const row of rows) {
    if (!row.countable || row.twa === null || row.tws === null) continue
    const at = lookup.cell(row.twa, row.tws)
    if (at === null) continue

    const key = cellKey(at.row, at.column)
    unfiltered.set(key, (unfiltered.get(key) ?? 0) + 1)
  }

  const matched = matchedRows(rows, filter, dimensions)
  const grouped = new Map<string, Map<string, MatchableRow[]>>()
  let rows_off_grid = 0
  let rows_unplaced = 0
  let excluded_rows = 0

  for (const row of matched) {
    if (!row.countable) {
      excluded_rows += 1
      continue
    }

    if (row.twa === null || row.tws === null) {
      rows_unplaced += 1
      continue
    }

    const at = lookup.cell(row.twa, row.tws)
    if (at === null) {
      rows_off_grid += 1
      continue
    }

    const cell = cellKey(at.row, at.column)
    const slices = grouped.get(cell) ?? new Map<string, MatchableRow[]>()
    grouped.set(cell, slices)

    // The verdict is part of the key, and is computed here **per row** rather than per slice,
    // because it is not a function of the sail alone: two rows carrying a sail of the same name
    // from two **Crossover Chart Versions** are one bucket to the filter and two different
    // comparisons to the chart. Keying on it is what keeps a slice's verdict true of every row in
    // it, which is what lets `cellTotals` tally verdicts by slice at all.
    const key = sliceKey(
      bucketOf(row, 'sail'),
      bucketOf(row, 'sea'),
      bucketOf(row, 'time'),
      verdictOf(row, lookup.recommendAt(at.row, at.column), chartVersionId)
    )
    const held = slices.get(key) ?? []
    held.push(row)
    slices.set(key, held)
  }

  // Row-major, and every cell — a cell no Race reached is a state the grid draws, not an absence
  // to skip (ADR 0014).
  const cells = chart.twa_axis.flatMap((twa, row) =>
    chart.tws_axis.map((tws, column): SailSelectionCell => {
      const recommendation = lookup.recommendAt(row, column)

      return {
        row,
        column,
        twa,
        tws,
        sail_number: chart.cells[row]?.[column] ?? null,
        recommendation,
        slices: [...(grouped.get(cellKey(row, column)) ?? NO_SLICES).entries()].map(
          ([key, held]): SailSelectionSlice => {
            const [sail, sea, time, verdict] = key.split('\u0000')

            return {
              sail,
              sea,
              time,
              verdict: verdict as CellVerdict,
              efficiency: sumEfficiency(held),
              race_ids: [...new Set(held.map((each) => each.race_id))],
            }
          }
        ),
        unfiltered_rows: unfiltered.get(cellKey(row, column)) ?? 0,
        target_reachable: targetReachable(chart, domain, row, column),
      }
    })
  )

  return {
    ledger: coverageLedger(rows, filter, dimensions),
    twa_axis: chart.twa_axis,
    tws_axis: chart.tws_axis,
    cells,
    rows_off_grid,
    rows_unplaced,
    excluded_rows,
  }
}

const NO_VERDICTS: Record<CellVerdict, number> = {
  agrees: 0,
  differs: 0,
  'off-chart': 0,
  'not-recorded': 0,
  'other-version': 0,
}

/**
 * The cell's own reading of its verdict tallies.
 *
 * **The two real verdicts win.** A cell holding agreeing rows and unjudgeable ones agrees, as far
 * as anything can be said about it — which is why the three non-verdicts are consulted last, and
 * why `off-chart` can never tip a cell into reading as disagreement (ADR 0023).
 *
 * Among those three, the ones where something *was* written down come first: "the record is there
 * and the comparison is not" is a different and more surprising thing to be told than "nobody
 * wrote it down", which 31 of this archive's reached cells say already. Both of the first two are
 * empty today — the only unnameable sail the archive holds was flown below the chart's first
 * column and reaches no cell, and the boat has one Crossover Chart Version (ADR 0030, ADR 0038).
 */
export function cellAgreement(verdicts: Record<CellVerdict, number>, rows: number): CellAgreement {
  if (rows === 0) return 'no-rows'
  if (verdicts.agrees > 0 && verdicts.differs > 0) return 'mixed'
  if (verdicts.agrees > 0) return 'agrees'
  if (verdicts.differs > 0) return 'differs'
  if (verdicts['off-chart'] > 0) return 'off-chart'

  return verdicts['other-version'] > 0 ? 'other-version' : 'not-recorded'
}

/**
 * A cell's figures from its slices — and the whole of what "sums travel" buys.
 *
 * Hand it every slice and it reads the cell; hand it the slices a narrowing leaves and it reads
 * the narrowed cell, correctly, with nothing re-queried. The ratios are recomputed from the summed
 * distances either way (`mergeEfficiency`), which is what an average could not have done.
 */
export function cellTotals(slices: readonly SailSelectionSlice[]): CellTotals {
  const verdicts = { ...NO_VERDICTS }
  const races = new Set<string>()
  let rows = 0

  for (const slice of slices) {
    const held = countableRows(slice.efficiency)
    rows += held
    verdicts[slice.verdict] += held
    for (const id of slice.race_ids) races.add(id)
  }

  return {
    rows,
    races: races.size,
    efficiency: mergeEfficiency(slices.map((slice) => slice.efficiency)),
    verdicts,
    agreement: cellAgreement(verdicts, rows),
  }
}

/** A bucket's own words in this screen's registry, or the id itself where it offers no such chip. */
function bucketLabel(
  dimensions: readonly AnalysisDimensionSpec[],
  dimension: AnalysisDimension,
  id: string
): string {
  const spec = dimensions.find((each) => each.id === dimension)
  return spec?.buckets.find((bucket) => bucket.id === id)?.label ?? id
}

/**
 * What the sail group calls a line.
 *
 * Spelled here because this screen's rail has no sail chip to read it off (ADR 0029) — and spelled
 * from `filter.ts`'s own bucket ids rather than beside them, so there is still one answer to what
 * *Not recorded* and *Note only* are called.
 */
function sailLabel(id: string): string {
  if (id === NOT_RECORDED) return 'Not recorded'
  return id === NOTE_ONLY ? 'Note only' : id
}

/** One group of a breakdown: the slices folded on one of their three keys. */
function group(
  slices: readonly SailSelectionSlice[],
  keyOf: (slice: SailSelectionSlice) => string,
  describe: (id: string, held: readonly SailSelectionSlice[]) => Omit<BreakdownLine, 'id' | 'rows' | 'efficiency'>
): BreakdownLine[] {
  const grouped = new Map<string, SailSelectionSlice[]>()

  for (const slice of slices) {
    const id = keyOf(slice)
    const held = grouped.get(id) ?? []
    held.push(slice)
    grouped.set(id, held)
  }

  return [...grouped.entries()]
    .map(([id, held]): BreakdownLine => {
      const efficiency = mergeEfficiency(held.map((slice) => slice.efficiency))

      return { id, rows: countableRows(efficiency), efficiency, ...describe(id, held) }
    })
    // Most sailing first, and ties by name so two screenshots of one archive agree. A **Not
    // recorded** line is sorted with the rest rather than exiled to the end: on this archive it is
    // often the largest line there is, and ADR 0029 is explicit that burying the biggest bucket is
    // exactly backwards.
    .sort((left, right) => right.rows - left.rows || left.label.localeCompare(right.label))
}

/**
 * A tapped cell, broken down by **Sail Configuration**, **Sea State** and time of day.
 *
 * Each line carries **its own** percent of target over **its own** rows, never the cell's average
 * borrowed downward. The archive's own case for this: 140° at 10 kt reads 91.4% across a hundred
 * rows, and underneath that sits one figure under Main + A2, another on the rows nobody annotated,
 * another again in calm water against slight chop, and day against night. A sailor acts on the
 * sub-figure (ADR 0030).
 *
 * This is also the only place on the screen the sail actually carried is listed, which is why it
 * is not optional: ADR 0029 drops the "sail used" chip here, so without these lines the carried
 * sail would be visible nowhere on the screen whose whole subject is which sail to carry.
 */
export function cellBreakdown(
  cell: Pick<SailSelectionCell, 'slices'>,
  dimensions: readonly AnalysisDimensionSpec[]
): CellBreakdown {
  return {
    sails: group(cell.slices, (slice) => slice.sail, (id, held) => ({
      label: sailLabel(id),
      about_the_record: id === NOT_RECORDED || id === NOTE_ONLY,
      // Every slice of one sail in one cell carries the same verdict, because a verdict is a
      // function of the sail and the cell alone — so the first is the group's.
      verdict: held[0].verdict,
    })),
    seas: group(cell.slices, (slice) => slice.sea, (id) => ({
      label: bucketLabel(dimensions, 'sea', id),
      about_the_record: id === NOT_RECORDED,
      verdict: null,
    })),
    times: group(cell.slices, (slice) => slice.time, (id) => ({
      label: bucketLabel(dimensions, 'time', id),
      about_the_record: id === NOT_RECORDED,
      verdict: null,
    })),
  }
}

/**
 * How well the chart matches what the boat actually does, over a whole grid rather than per cell.
 *
 * The Overall tab's card. **Three figures and not one**, because agreement alone cannot answer the
 * question a sailor is really asking. 31% agreement means one thing on a race where following the
 * chart was measurably faster and the opposite on a race where it was slower, and this archive
 * holds both: 08-22 reads 97.8% of target when the chart was followed against 90.1% when it was
 * not, and 08-26 reads 80.3% against 86.5%.
 *
 * So the pair travels with the share, and **no verdict is computed from it**. Over this archive the
 * two sides differ by half a point across 294 differing rows, a fifth of them Filler-Anchored —
 * well inside the noise — and a card that divided them into "the chart is wrong by 0.5%" would be
 * inventing a finding. ADR 0030's rule holds here too: the word is never "wrong", about the chart
 * or about the crew.
 */
export interface ChartAgreement {
  /**
   * Countable rows that landed in a cell at all, judgeable or not.
   *
   * The denominator the *coverage* sentence needs, which is not the one the share uses: half this
   * archive's placed sailing carries no **Sail Configuration**, and a card that quietly dropped
   * those rows from both numerator and denominator would report a confident share over a third of
   * the evidence without saying so.
   */
  placed_rows: number
  /**
   * Of those, the rows that can be compared with the chart at all: `Agrees` plus `Differs`.
   *
   * **Off-chart** is out of this, as is **Not recorded** — for different reasons that come to the
   * same arithmetic. A row whose sail was never written down cannot be judged; a row carrying a
   * sail the chart has no word for *has* been judged and the answer is that the vocabulary ran
   * out, which is never disagreement (ADR 0023) and would be dishonest as agreement.
   */
  judgeable_rows: number
  /** Agreeing rows over judgeable ones, or null where nothing could be judged. Never a zero. */
  agreement: number | null
  /** The sums over the rows that carried what their own cell calls for. */
  following: EfficiencyAggregate
  /** The sums over the rows that carried something else. */
  differing: EfficiencyAggregate
}

/**
 * The share, and both sides' own percent of target.
 *
 * Built from the slices, so it costs nothing the screen was not already computing and needs no
 * **Polar** read of its own: each row's **Target Speed** came from the Polar its own Race was
 * sailed under (ADR 0012) and travels with it.
 */
export function chartAgreement(cells: readonly SailSelectionCell[]): ChartAgreement {
  const following: EfficiencyAggregate[] = []
  const differing: EfficiencyAggregate[] = []
  let placed_rows = 0
  let agrees = 0
  let differs = 0

  for (const cell of cells) {
    for (const slice of cell.slices) {
      const rows = countableRows(slice.efficiency)
      placed_rows += rows

      if (slice.verdict === 'agrees') {
        agrees += rows
        following.push(slice.efficiency)
      }
      if (slice.verdict === 'differs') {
        differs += rows
        differing.push(slice.efficiency)
      }
    }
  }

  const judgeable_rows = agrees + differs

  return {
    placed_rows,
    judgeable_rows,
    agreement: judgeable_rows === 0 ? null : agrees / judgeable_rows,
    following: mergeEfficiency(following),
    differing: mergeEfficiency(differing),
  }
}

/**
 * One cell with its figures already folded.
 *
 * The shape every reader of the grid wants: five grids are drawn from the same 338 cells — four
 * thumbnails and the full-size one — and folding each cell's slices once per grid is four folds
 * nobody asked for. Typed here rather than beside the renderer because `gridCoverage` reads it too.
 */
export interface SailSelectionCellView {
  cell: SailSelectionCell
  totals: CellTotals
}

/** Every cell, folded once, in the order the grid draws them. */
export function cellViews(
  cells: readonly SailSelectionCell[]
): SailSelectionCellView[] {
  return cells.map((cell) => ({ cell, totals: cellTotals(cell.slices) }))
}

/**
 * How many cells the grid holds, how many were reached, and how many can never hold a figure.
 *
 * The counts each layer's own summary line states. Written once because they are read three times
 * over — under the grid, in the legend, and by the Overall tab's row — and three call sites each
 * folding 338 cells their own way is how two of them come to disagree.
 */
export interface GridCoverage {
  cells: number
  /** Cells with at least one matched Countable row. */
  reached: number
  /** Of those, how many hold a percent of target. */
  with_figure: number
  /** Cells with rows and no computable target: inside the Polar, and still unanswerable. */
  rows_without_figure: number
  /**
   * Cells whose region lies outside the Polar's axes, reached or not (ADR 0028) — or **null**
   * where no Polar was in hand to ask.
   *
   * Null and not nought. With no Polar read the question has no answer, and a zero here would read
   * as "every cell can hold a figure" — a plausible number in place of a missing one. A caller
   * that cannot print the figure has to say so instead, which is what the null forces.
   */
  unreachable: number | null
  /** Cells holding both agreeing and differing rows. */
  mixed: number
  /** Cells a narrowing emptied, which keep a dotted ghost. */
  ghosted: number
}

export function gridCoverage(views: readonly SailSelectionCellView[]): GridCoverage {
  const coverage = {
    cells: views.length,
    reached: 0,
    with_figure: 0,
    rows_without_figure: 0,
    unreachable: 0,
    mixed: 0,
    ghosted: 0,
  }

  let known = true

  for (const { cell, totals } of views) {
    if (cell.target_reachable === null) known = false
    if (cell.target_reachable === false) coverage.unreachable += 1
    if (totals.agreement === 'mixed') coverage.mixed += 1

    if (totals.rows === 0) {
      if (cell.unfiltered_rows > 0) coverage.ghosted += 1
      continue
    }

    coverage.reached += 1
    if (totals.efficiency.polar_efficiency === null) coverage.rows_without_figure += 1
    else coverage.with_figure += 1
  }

  return { ...coverage, unreachable: known ? coverage.unreachable : null }
}

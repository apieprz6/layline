/**
 * Tell a Polar's measured rows from the file's own filler.
 *
 * A polar is target boat speed, and a certificate tabulates angles no boat sails. Those rows
 * are generated: `docs/research/orc-polar-file-formats.md` measured Handsome Pete's certificate
 * and found row 35 to be exactly twice row 30 in every one of the nine columns, and row 40
 * exactly three times it in the lightest three — one straight line ramping up from zero, whose
 * zero-crossing sits at TWA 25.00° ± 0.06° in all nine. A sailor pinching at 28° who saw those
 * numbers would read 480% of polar.
 *
 * So the rows are suppressed on display. Two things follow from that being a *display* rule:
 *
 *   - Nothing here changes a payload. The stored grid keeps every row the file gave, filler and
 *     all, which is what lets a better detector re-answer this about a Version written years
 *     ago (ADR 0009). There is no detector version column for the same reason.
 *   - The answer is detected, not declared. The ticket says "below about 45°" because 45 is
 *     where two very different files happen to agree: an ORC certificate export tabulates
 *     nothing below its beat angle and needs no suppression at all, while a qtVlm library polar
 *     ramps all the way from TWA 0 and needs nine rows of it hidden.
 *
 * The detector is three signatures and one walk:
 *
 *   **no-data** — every cell zero.
 *   **ramp-filler** — an exact multiple of the lowest tabulated row, by position: the row one
 *     step above it is twice it, two steps above is three times it, and so on. That is the same
 *     statement as "the line through them crosses zero one step below the lowest row".
 *   **partial-ramp-filler** — on that ramp in the lightest column but not in every column.
 *     Filler binds in light air, where the boat cannot make its target, and gives way to real
 *     speed as the wind fills in — so the *leading* column is the test. Without that anchor a
 *     single column agreeing by coincidence would condemn a measured row, which is exactly what
 *     happens on both fixtures: the qtVlm file's row 50 sits on the ramp in its lightest column
 *     and is real data.
 *   **interpolated** — the exact arithmetic mean of the rows either side, in every column.
 *
 * The walk goes contiguously up from the lowest angle while each row is one of those, and stops
 * at the first row that is none. Bottom-up and contiguous because filler is a floor, not a
 * scatter: a coincidence higher up the axis is never reached.
 *
 * A ramp needs two rows to be a ramp. The lowest row is only filler if the row above it doubles
 * it, which is what keeps an ORC certificate's own close-hauled row — a real 3.96 knots at
 * TWA 52 — from being read as a seed.
 *
 * ## Two grains, two jobs
 *
 * All of the above answers per *row*, which is the grain the display rule needs: its job is hiding
 * rows wholesale. Scoring a row the boat actually sailed needs the same signatures asked per
 * *cell* (`classifyPolarCells`, ADR 0036), because a certificate's ramp clears at a different
 * angle in every wind-speed column. The two live together because both describe what the file
 * contains and nothing else; composing either with a recorded row is `services/analysis/`'s job.
 */

import type { PolarCellOrigin, PolarPayload, PolarRowOrigin, PolarSuppression } from '@/types'

/**
 * A tenth of a knot. Generous against the rounding a sixfold multiple of a two-decimal base
 * accumulates — the library file's ramp rows sit 0.05 off it at worst — and still below what a
 * real row misses the ramp by: that file's first measured row is 0.19 knots off in the lightest
 * column, which is the column a row gets its last chance in, and 1.59 off at its worst.
 */
const RAMP_TOLERANCE = 0.1

/**
 * A hundredth of a knot for the interpolation test, which is the rounding of the two-decimal
 * mean itself and nothing more. Being loose here would start calling smooth real rows generated.
 */
const INTERPOLATION_TOLERANCE = 0.01

/** How each column of a row compares with the ramp the base row generates. */
type RampAgreement = 'full' | 'leading' | 'none'

export function classifyPolarRows(payload: PolarPayload): PolarRowOrigin[] {
  const rows = payload.boat_speed
  const origins: PolarRowOrigin[] = rows.map((row) =>
    row.every((speed) => speed === 0) ? 'no-data' : 'measured'
  )

  const baseIndex = origins.indexOf('measured')
  // Every row zero. Nothing to compare anything with, and nothing to display either.
  if (baseIndex === -1) return origins

  const agreementWith = (index: number): RampAgreement =>
    rampAgreement(rows[baseIndex], rows[index], index - baseIndex + 1)

  // A ramp is only a ramp with a second row on it.
  if (baseIndex + 1 < rows.length && agreementWith(baseIndex + 1) === 'full') {
    origins[baseIndex] = 'ramp-filler'

    for (let index = baseIndex + 1; index < rows.length; index += 1) {
      const agreement = agreementWith(index)
      if (agreement === 'none') break
      origins[index] = agreement === 'full' ? 'ramp-filler' : 'partial-ramp-filler'
    }
  }

  // Interpolation is a separate signature and can sit anywhere, so it is looked for on every row
  // the ramp did not already account for.
  for (let index = 1; index < rows.length - 1; index += 1) {
    if (origins[index] !== 'measured') continue
    if (isMeanOfNeighbours(rows[index - 1], rows[index], rows[index + 1])) {
      origins[index] = 'interpolated'
    }
  }

  return origins
}

/**
 * The same question one grain finer: where did each *cell* come from?
 *
 * `classifyPolarRows` answers for a row because its caller hides rows, and that is the wrong grain
 * for scoring a row the boat actually sailed (ADR 0036). Measured on this boat's certificate, the
 * ramp clears at a different angle in every wind-speed column — real from TWA 40 above 10 knots,
 * from 45 in 6–8, and only from 52 in 4 — so `polarSuppression`'s single 52° floor discards six
 * measured cells at TWA 40 and eight at 45, including the boat's best upwind angle in every
 * condition it can sail in. Nothing here changes that floor: the table's job is hiding rows, and
 * for that job one verdict per row is correct.
 *
 * Three differences from the row-level walk, each for a reason:
 *
 *   - **The ramp is walked per column, not per row.** Still contiguously up from the base row,
 *     because filler is a floor and not a scatter — which is also what keeps the library fixture's
 *     row 50, real data whose lightest cell happens to land on the ramp, from being condemned by
 *     a coincidence the walk never reaches.
 *   - **There is no `partial-ramp-filler`.** It was the row-level name for "this row's columns
 *     disagree", and at cell grain the disagreement *is* the answer.
 *   - **A zero is its own answer.** `no-data` is per-cell here rather than only describing a row
 *     of zeroes: a cell holding 0 is the file saying nothing at that angle and wind speed, and
 *     interpolating through it would invent a target far below anything the boat was measured at.
 *
 * `interpolated` stays a row-level verdict, read straight off `classifyPolarRows`. Its signature —
 * the exact mean of the rows either side — is only evidence of a generator when it holds in every
 * column at once; asked of one cell it would condemn any smooth stretch of a real polar. Nothing
 * is lost by that, because an interpolated cell anchors a Target Speed exactly as a measured one
 * does (ADR 0028, ADR 0036) and the label is all that would change.
 *
 * One row per TWA, one entry per TWS, in the payload's own order.
 */
export function classifyPolarCells(payload: PolarPayload): PolarCellOrigin[][] {
  const rows = payload.boat_speed
  const rowOrigins = classifyPolarRows(payload)

  const cells: PolarCellOrigin[][] = rows.map((row, index) =>
    row.map((speed) => {
      if (speed === 0) return 'no-data'
      return rowOrigins[index] === 'interpolated' ? 'interpolated' : 'measured'
    })
  )

  // The lowest row the file says anything in, which is the ramp's seed where there is a ramp.
  const base = rows.findIndex((row) => row.some((speed) => speed !== 0))
  if (base === -1) return cells

  /** Whether this cell is its own multiple of the base cell below it, by position. */
  const onRamp = (index: number, column: number): boolean => {
    const seed = rows[base][column]
    // A column the base row left empty generates no ramp, so no cell above it is on one.
    if (seed === 0) return false

    const speed = rows[index]?.[column]
    if (speed === undefined) return false

    return Math.abs(speed - seed * (index - base + 1)) <= RAMP_TOLERANCE
  }

  for (let column = 0; column < rows[base].length; column += 1) {
    // A ramp needs two cells to be a ramp, for the reason the row-level walk needs two rows: an
    // ORC certificate's own close-hauled speed must not be read as a seed for lack of a second
    // point on the line.
    if (!onRamp(base + 1, column)) continue

    for (let index = base; index < rows.length && onRamp(index, column); index += 1) {
      if (cells[index][column] !== 'no-data') cells[index][column] = 'ramp-filler'
    }
  }

  return cells
}

/** Whether a cell may anchor a **Target Speed**: the file measured it, or a generator smoothed it. */
export function isAnchorable(origin: PolarCellOrigin): boolean {
  return origin === 'measured' || origin === 'interpolated'
}

export function polarSuppression(payload: PolarPayload): PolarSuppression {
  const origins = classifyPolarRows(payload)

  let first = 0
  while (first < origins.length && origins[first] !== 'measured') first += 1

  // Every row read as generated. That is a file we have misread rather than a polar with nothing
  // in it, and an empty grid would say nothing about why — so the whole grid is shown.
  if (first === 0 || first === origins.length) {
    return {
      firstTrustworthyTwa: payload.twa_axis[0],
      suppressedTwa: [],
      reason: null,
    }
  }

  const firstTrustworthyTwa = payload.twa_axis[first]

  return {
    firstTrustworthyTwa,
    suppressedTwa: payload.twa_axis.slice(0, first),
    reason:
      `Angles below ${firstTrustworthyTwa}° are not the boat's measured speed — ` +
      `${whatWasFound(origins.slice(0, first))} — so they are stored but not shown.`,
  }
}

/** How each kind of suppressed row reads in the sentence the screen prints. */
const FOUND: Record<Exclude<PolarRowOrigin, 'measured'>, string> = {
  'no-data': 'the file records nothing at them',
  'ramp-filler': 'the file ramps up to its lowest real row rather than measuring them',
  'partial-ramp-filler': 'they are still on that ramp where the wind is lightest',
  interpolated: 'they are the exact mean of the rows either side',
}

/**
 * What the detector actually found, in the order the rows are in.
 *
 * Said this way round because the sentence is the only account the sailor gets of a gap in the
 * grid, and a stated reason that is not the found one is worse than a vague one. A grid whose
 * floor is a row of zeroes is not a ramp, and must not be described as one.
 */
function whatWasFound(suppressed: PolarRowOrigin[]): string {
  const found: string[] = []

  for (const origin of suppressed) {
    if (origin === 'measured') continue
    const clause = FOUND[origin]
    if (!found.includes(clause)) found.push(clause)
  }

  if (found.length === 1) return found[0]

  return `${found.slice(0, -1).join(', ')} and ${found[found.length - 1]}`
}

/**
 * Whether `row` is `multiple` × `base`: in every column that either of them says anything in,
 * in the lightest such column only, or in neither.
 */
function rampAgreement(base: number[], row: number[], multiple: number): RampAgreement {
  let informative = 0
  let matched = 0
  let leadingMatched = false

  for (const [column, speed] of row.entries()) {
    const expected = base[column] * multiple
    if (speed === 0 && base[column] === 0) continue

    informative += 1
    if (Math.abs(speed - expected) <= RAMP_TOLERANCE) {
      matched += 1
      if (informative === 1) leadingMatched = true
    }
  }

  if (informative === 0) return 'none'
  if (matched === informative) return 'full'
  return leadingMatched ? 'leading' : 'none'
}

/** Every cell the exact mean of the cells above and below it, which no measured row is. */
function isMeanOfNeighbours(below: number[], row: number[], above: number[]): boolean {
  return row.every(
    (speed, column) =>
      Math.abs(speed - (below[column] + above[column]) / 2) <= INTERPOLATION_TOLERANCE
  )
}

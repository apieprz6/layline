/**
 * Parse the grid half of a **Crossover Chart** — a `.sailselect` — into the `twa_axis`, `tws_axis`
 * and `cells` a `CrossoverChartPayload` holds.
 *
 * The format is documented: qtVlm pp. 32–33 and p. 38, surveyed in
 * `docs/research/orc-polar-file-formats.md` and exercised against the manual's own example in
 * `__tests__/crossoverGridFile.test.ts`. It is the *same document* as a `.pol` — a `TWA/TWS`
 * header of wind speeds, one delimited row per wind angle — so everything about reading it as
 * text lives in `delimitedGrid` and is shared with the polar, tolerances and all.
 *
 * What is not shared is what a cell means. A polar cell is a boat speed, a decimal magnitude that
 * may be interpolated between. A crossover cell is a **sail id**: qtVlm's external identifier for
 * one Sail Configuration, which the definitions file names. So:
 *
 *   - a cell must be a whole number, because `2.5` identifies nothing;
 *   - a decimal comma is *not* read as a decimal point, unlike in a polar, because a sail id has
 *     no decimal part for a locale to write differently;
 *   - nothing is ever interpolated, averaged or compared between two cells.
 *
 * **Monotonicity is deliberately not validated.** A row that reads `6;6;6;2;2;4;5` looks like it
 * goes backwards and does not: sail 6 is a reaching spinnaker giving way to sail 2, a jib, as the
 * wind builds. The ids are not ordered by size, area or anything else. qtVlm's own documented
 * example has that exact row, and 15 of the 26 rows of the boat's own chart are non-monotonic.
 *
 * Two things this parser does not decide. Whether a cell's id **resolves** to a definition is the
 * payload gate's question — the definitions arrive in a second file, and this one has never seen
 * them. And `0` is read as the id `0` and nothing else: qtVlm documents no meaning for it and
 * OpenCPN's "invalid course" convention is about polars, so inventing a "do not sail" sentinel
 * here would be reading something into the file that is not in it.
 */

import {
  GridWarnings,
  PLAIN_NUMBER,
  findHeaderIndex,
  readGridHeader,
  readGridLines,
  readRowFields,
  warnAboutHeaderToken,
} from '@/services/boat/delimitedGrid'
import type {
  CrossoverGrid,
  CrossoverGridParseOutcome,
  CrossoverGridParseRefusal,
  CrossoverGridParseWarningCode,
} from '@/types'

/** The format label recorded in `payload.source.format`. */
export const CROSSOVER_GRID_FORMAT = 'qtvlm-sailselect'

/**
 * A megabyte, as for a polar. The boat's own chart is 26 × 13 and under two kilobytes, so
 * anything approaching this is a different kind of file with a `.sailselect` name.
 */
const MAX_CHARACTERS = 1_048_576

/** The same absurd ceilings the polar uses: 181 whole degrees, and more speeds than anyone emits. */
const MAX_TWA_ROWS = 181
const MAX_TWS_COLUMNS = 200

/** A whole number, with no decimal part at all — which is what a sail id is. */
const WHOLE_NUMBER = /^[+-]?\d+$/

/** A number written with a comma for its decimal point, worth naming in a refusal. */
const COMMA_DECIMAL = /^[+-]?\d+,\d+$/

export function parseCrossoverGridFile(contents: string): CrossoverGridParseOutcome {
  const warnings = new GridWarnings<CrossoverGridParseWarningCode>()

  function refuse(
    reason: CrossoverGridParseRefusal,
    message: string,
    line?: number
  ): CrossoverGridParseOutcome {
    return { ok: false, reason, message, ...(line === undefined ? {} : { line }) }
  }

  if (contents.length > MAX_CHARACTERS) {
    return refuse(
      'too-large',
      `a sail chart is a couple of kilobytes; this file is ${Math.round(contents.length / 1024)} KB`
    )
  }

  const content = readGridLines(contents, warnings)

  if (content.length < 2) {
    return refuse(
      'too-few-lines',
      'a sail chart needs a header of wind speeds and at least one angle row'
    )
  }

  const headerIndex = findHeaderIndex(content, warnings)
  const header = readGridHeader(content[headerIndex], warnings)
  const headerLine = header.line

  if (header.fields.length < 2) {
    return refuse(
      'no-header',
      'the first line carries no wind speeds, so there is no grid to read',
      headerLine.line
    )
  }

  warnAboutHeaderToken(header, warnings)

  const width = header.fields.length - 1
  if (width > MAX_TWS_COLUMNS) {
    return refuse('grid-too-large', `${width} wind speeds is not a sail chart`, headerLine.line)
  }

  /**
   * Read an axis value: a plain non-negative number, decimals allowed.
   *
   * The axes are wind angles and wind speeds and not ids, so nothing here requires them to be
   * whole. qtVlm is explicit that the steps are free, and a second vendor's published template
   * has a `25` between 20 and 30 — so a half-knot breakpoint is a thing this format permits and
   * refusing one would refuse a legal chart.
   */
  function readAxisValue(
    field: string,
    line: number,
    what: string
  ): number | CrossoverGridParseOutcome {
    const value = field.trim()

    if (value === '') {
      return refuse('empty-cell', `${what} is empty`, line)
    }

    if (!PLAIN_NUMBER.test(value)) {
      return refuse('not-a-number', `${what} is not a number: ${JSON.stringify(field)}`, line)
    }

    return Number(value)
  }

  /**
   * Read one cell as a sail id. Three refusals rather than one, because "2.5 is not a whole
   * number" and "Main + A2 is not a number" are different mistakes with different fixes — the
   * second is what reading a transposed Expedition sail chart looks like.
   */
  function readSailId(field: string, line: number, what: string): number | CrossoverGridParseOutcome {
    const value = field.trim()

    if (value === '') {
      return refuse(
        'empty-cell',
        `${what} is empty; qtVlm requires a value in every cell of the grid`,
        line
      )
    }

    if (WHOLE_NUMBER.test(value)) return Number(value)

    if (COMMA_DECIMAL.test(value) || PLAIN_NUMBER.test(value)) {
      return refuse(
        'not-an-integer',
        `${what} is ${JSON.stringify(field)}; a sail id is a whole number`,
        line
      )
    }

    return refuse(
      'not-a-number',
      `${what} is not a sail number: ${JSON.stringify(field)}. A cell holds the number a definition gives, not its name.`,
      line
    )
  }

  const tws_axis: number[] = []
  for (const [index, field] of header.fields.slice(1).entries()) {
    const value = readAxisValue(field, headerLine.line, `wind speed ${index + 1}`)
    if (typeof value !== 'number') return value
    if (value < 0) {
      return refuse(
        'value-out-of-range',
        `a wind speed cannot be negative: ${value}`,
        headerLine.line
      )
    }
    if (index > 0 && value <= tws_axis[index - 1]) {
      return refuse(
        'axis-not-ascending',
        `the wind speed axis goes ${tws_axis[index - 1]} then ${value}; it must ascend`,
        headerLine.line
      )
    }
    tws_axis.push(value)
  }

  const twa_axis: number[] = []
  const cells: number[][] = []

  for (const row of content.slice(headerIndex + 1)) {
    const fields = readRowFields(row, header, width)

    if (fields.length !== width + 1) {
      return refuse(
        'row-width-mismatch',
        `this angle row has ${fields.length - 1} sails where the header has ${width} wind speeds`,
        row.line
      )
    }

    const angle = readAxisValue(fields[0], row.line, 'the true wind angle')
    if (typeof angle !== 'number') return angle
    if (angle < 0 || angle > 180) {
      return refuse(
        'value-out-of-range',
        `a true wind angle runs 0 to 180 degrees, not ${angle}`,
        row.line
      )
    }
    const previous = twa_axis.at(-1)
    if (previous !== undefined && angle <= previous) {
      return refuse(
        'axis-not-ascending',
        `the angle axis goes ${previous} then ${angle}; it must ascend`,
        row.line
      )
    }
    twa_axis.push(angle)

    if (twa_axis.length > MAX_TWA_ROWS) {
      return refuse('grid-too-large', `${twa_axis.length} angle rows is not a sail chart`, row.line)
    }

    const sails: number[] = []
    for (const [index, field] of fields.slice(1).entries()) {
      const sail = readSailId(field, row.line, `the sail at ${tws_axis[index]} knots`)
      if (typeof sail !== 'number') return sail
      if (sail < 0) {
        return refuse(
          'value-out-of-range',
          `a sail number cannot be negative: ${sail} at ${tws_axis[index]} knots`,
          row.line
        )
      }
      sails.push(sail)
    }
    cells.push(sails)
  }

  if (cells.length === 0) {
    return refuse('too-few-lines', 'the file has a header of wind speeds but no angle rows')
  }

  const grid: CrossoverGrid = {
    twa_axis,
    tws_axis,
    cells,
    // Verbatim, in the case and with the separator the file wrote it: it is the only evidence
    // about which exporter produced the file, and normalising it would throw that away.
    header_token: header.token,
  }

  return { ok: true, grid, warnings: warnings.all() }
}

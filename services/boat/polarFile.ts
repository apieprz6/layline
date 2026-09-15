/**
 * Parse a **Polar** file into the grid a `PolarPayload` holds.
 *
 * The format is surveyed in `docs/research/orc-polar-file-formats.md`, over a corpus of 273
 * real files. There is no specification to conform to — `.pol` is whatever the exporter that
 * wrote it did — so this module's two lists come from that survey rather than from a standard:
 *
 *   **Tolerated, with a warning**: a byte-order mark; CRLF or bare-CR line endings; blank
 *   lines; `#` and `!` comment lines; one free-text line before the header; one trailing
 *   delimiter per line; any casing of the header token, either separator, and a bare `TWA`;
 *   decimal commas, but only when the delimiter is `;` or TAB, where a comma cannot also be
 *   separating fields. Anything unrecognised in the header is warned about and kept.
 *
 *   **Refused**: no header; a row that is not the header's width; an empty cell; a
 *   non-numeric value; an axis that repeats or goes backwards; a TWA outside 0..180; a
 *   negative wind speed or boat speed; a grid past 181 × 200; a file past a megabyte.
 *
 * A non-ascending axis is a refusal and not a truncation point. qtVlm reads such a file and
 * silently drops everything past the fault, which is the one behaviour Layline will not copy:
 * a file we cannot read is reported, never quietly halved.
 *
 * Nothing here corrects, rounds, clamps, reorders, deduplicates or pads. A TWA 0 row and a
 * TWS 0 column are kept when the file supplies them and are *not* added when it does not,
 * because padding is a lookup-time concern and an invented row would be indistinguishable
 * from a measured one. Row 30 and row 35 of an ORC certificate are manufactured filler
 * (`docs/research/orc-polar-file-formats.md`), and they are stored exactly as given too —
 * suppressing them is a display rule, applied by `polarSyntheticRows`, never a storage rule.
 *
 * The one thing that does not survive is textual scale: `0.00` becomes the JSON number `0`.
 * The verbatim bytes are what Storage holds, and `content_sha256` is what proves they are
 * unchanged; this payload is the reading of them, which is why the grid may be re-derived
 * from the file at any time but the file is never re-derived from the grid.
 */

import type {
  PolarParseOutcome,
  PolarParseRefusal,
  PolarParseWarning,
  PolarParseWarningCode,
  PolarPayload,
} from '@/types'

/** The format label recorded in `payload.source`, for every dialect of `.pol` alike. */
const POLAR_FORMAT = 'orc-pol'

/**
 * A megabyte. The largest file in the corpus is a few tens of kilobytes, and the bucket's own
 * limit is 10 MB, so anything approaching this is a different kind of file with a `.pol` name.
 */
const MAX_CHARACTERS = 1_048_576

/** 181 whole degrees of TWA, and more wind speeds than any exporter emits. */
const MAX_TWA_ROWS = 181
const MAX_TWS_COLUMNS = 200

/** `twa/tws`, `TWA\TWS`, `Twa/Tws` — the separator and the casing are both free. */
const HEADER_SENTINEL = /^twa[/\\]tws$/i

/** A bare `TWA` first field, which 86 of the corpus's 273 files use. */
const BARE_TWA = /^twa$/i

/**
 * A number in the form the file may write one. Deliberately narrower than `Number()`, which
 * also reads `0x10`, `Infinity`, `1e3` and whitespace — none of which any exporter emits, and
 * all of which would be a sign we are reading something that is not a polar.
 */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/** A number written with a comma for its decimal point, as a French-locale export does. */
const COMMA_DECIMAL = /^[+-]?\d+,\d+$/

/** Sniffed from the header, most distinctive first; whitespace is the fallback. */
const DELIMITERS = ['\t', ';', ','] as const

/** One line of the file, carrying the number it had before anything was skipped. */
interface NumberedLine {
  line: number
  text: string
}

export function parsePolarFile(contents: string): PolarParseOutcome {
  const warnings: PolarParseWarning[] = []
  const seen = new Set<PolarParseWarningCode>()

  /**
   * File-wide oddities are reported once with the line they were first seen on. A trailing
   * tab on all 38 lines of a qtVlm library file is one fact about the file, and 38 copies of
   * it would bury the warning that matters.
   */
  function warnOnce(code: PolarParseWarningCode, line?: number, detail?: string): void {
    if (seen.has(code)) return
    seen.add(code)
    warnings.push({ code, ...(line === undefined ? {} : { line }), ...(detail === undefined ? {} : { detail }) })
  }

  function warn(code: PolarParseWarningCode, line: number, detail?: string): void {
    warnings.push({ code, line, ...(detail === undefined ? {} : { detail }) })
  }

  function refuse(reason: PolarParseRefusal, message: string, line?: number): PolarParseOutcome {
    return { ok: false, reason, message, ...(line === undefined ? {} : { line }) }
  }

  if (contents.length > MAX_CHARACTERS) {
    return refuse(
      'too-large',
      `a polar is a few kilobytes; this file is ${Math.round(contents.length / 1024)} KB`
    )
  }

  let text = contents

  if (text.startsWith('﻿')) {
    text = text.slice(1)
    warnOnce('bom-stripped', 1)
  }

  if (text.includes('\r')) {
    // Normalised for reading only. The bytes in Storage keep their own line endings, which is
    // what `content_sha256` is over.
    text = text.replace(/\r\n?/g, '\n')
    warnOnce('crlf-line-endings', 1)
  }

  // Numbered before anything is dropped, so a refusal points at the line the admin will count
  // to in their own editor rather than at a line in some filtered version of their file.
  const lines: NumberedLine[] = text.split('\n').map((value, index) => ({
    line: index + 1,
    text: value,
  }))

  const content: NumberedLine[] = []
  for (const line of lines) {
    const trimmed = line.text.trim()
    if (trimmed === '') {
      // A file ends in a newline far more often than not, so the empty final line is not an
      // oddity worth reporting.
      if (line.line < lines.length) warn('blank-line-skipped', line.line)
      continue
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      warn('comment-line-skipped', line.line, trimmed.slice(0, 60))
      continue
    }
    content.push({ line: line.line, text: line.text })
  }

  if (content.length < 2) {
    return refuse(
      'too-few-lines',
      'a polar needs a header of wind speeds and at least one angle row'
    )
  }

  // The header is the first content line, unless the second one carries the sentinel — some
  // exporters put the boat's name or the certificate number on a line of its own first.
  let headerIndex = 0
  const firstFieldOf = (line: NumberedLine): string =>
    splitFields(line.text, sniffDelimiter(line.text))[0]?.trim() ?? ''

  if (!HEADER_SENTINEL.test(firstFieldOf(content[0])) && !BARE_TWA.test(firstFieldOf(content[0]))) {
    const second = firstFieldOf(content[1])
    if (HEADER_SENTINEL.test(second) || BARE_TWA.test(second)) {
      warn('description-line-skipped', content[0].line, content[0].text.trim().slice(0, 60))
      headerIndex = 1
    }
  }

  const headerLine = content[headerIndex]
  const delimiter = sniffDelimiter(headerLine.text)
  const headerFields = splitFields(headerLine.text, delimiter).map((field) => field.trim())

  // The trailing delimiter is decided on the header and applied to the whole file: a file that
  // ends every line with a tab ends the header with one too.
  const trailingDelimiter = headerFields.length > 1 && headerFields.at(-1) === ''
  if (trailingDelimiter) {
    headerFields.pop()
    warnOnce('trailing-empty-field', headerLine.line)
  }

  if (headerFields.length < 2) {
    return refuse(
      'no-header',
      'the first line carries no wind speeds, so there is no grid to read',
      headerLine.line
    )
  }

  const headerToken = headerFields[0]
  if (BARE_TWA.test(headerToken)) {
    warnOnce('bare-twa-header', headerLine.line, headerToken)
  } else if (!HEADER_SENTINEL.test(headerToken)) {
    warnOnce('unexpected-header-token', headerLine.line, headerToken)
  }

  const width = headerFields.length - 1
  if (width > MAX_TWS_COLUMNS) {
    return refuse(
      'grid-too-large',
      `${width} wind speeds is not a polar`,
      headerLine.line
    )
  }

  /**
   * Read one field as a number. Decimal commas are only ever read as decimal points when the
   * delimiter cannot itself be a comma — otherwise `1,5` is two fields and reading it as one
   * value would invent a grid the file does not have.
   */
  function readNumber(field: string, line: number, what: string): number | PolarParseOutcome {
    let value = field.trim()

    if (value === '') {
      return refuse('empty-cell', `${what} is empty; a polar has no missing entries`, line)
    }

    if ((delimiter === ';' || delimiter === '\t') && COMMA_DECIMAL.test(value)) {
      warnOnce('decimal-comma-normalised', line, value)
      value = value.replace(',', '.')
    }

    if (!PLAIN_NUMBER.test(value)) {
      return refuse('not-a-number', `${what} is not a number: ${JSON.stringify(field)}`, line)
    }

    return Number(value)
  }

  const tws_axis: number[] = []
  for (const [index, field] of headerFields.slice(1).entries()) {
    const value = readNumber(field, headerLine.line, `wind speed ${index + 1}`)
    if (typeof value !== 'number') return value
    if (value < 0) {
      return refuse('value-out-of-range', `a wind speed cannot be negative: ${value}`, headerLine.line)
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
  const boat_speed: number[][] = []

  for (const row of content.slice(headerIndex + 1)) {
    const fields = splitFields(row.text, delimiter)

    if (trailingDelimiter && fields.length === width + 2 && fields.at(-1)?.trim() === '') {
      fields.pop()
    }

    if (fields.length !== width + 1) {
      return refuse(
        'row-width-mismatch',
        `this angle row has ${fields.length - 1} speeds where the header has ${width}`,
        row.line
      )
    }

    const angle = readNumber(fields[0], row.line, 'the true wind angle')
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
      return refuse('grid-too-large', `${twa_axis.length} angle rows is not a polar`, row.line)
    }

    const speeds: number[] = []
    for (const [index, field] of fields.slice(1).entries()) {
      const speed = readNumber(field, row.line, `boat speed at ${tws_axis[index]} knots`)
      if (typeof speed !== 'number') return speed
      if (speed < 0) {
        return refuse(
          'value-out-of-range',
          `a boat speed cannot be negative: ${speed} at ${tws_axis[index]} knots`,
          row.line
        )
      }
      speeds.push(speed)
    }
    boat_speed.push(speeds)
  }

  if (boat_speed.length === 0) {
    return refuse('too-few-lines', 'the file has a header of wind speeds but no angle rows')
  }

  const payload: PolarPayload = {
    twa_axis,
    tws_axis,
    boat_speed,
    // The token verbatim, in the case the file wrote it: it is evidence about the exporter,
    // and normalising it would throw away the only clue a later reader has.
    source: { format: POLAR_FORMAT, header_token: headerToken },
  }

  return { ok: true, payload, warnings }
}

/**
 * The delimiter this file uses, sniffed rather than inferred from the extension — the corpus
 * has TAB, `;`, `,` and space files all named `.pol`.
 *
 * `null` means whitespace, which is both the fallback and a real format: a run of spaces is
 * one delimiter, so it cannot be handled by splitting on a single character.
 */
function sniffDelimiter(headerLine: string): string | null {
  for (const candidate of DELIMITERS) {
    if (headerLine.includes(candidate)) return candidate
  }
  return null
}

function splitFields(line: string, delimiter: string | null): string[] {
  if (delimiter === null) return line.trim().split(/\s+/)
  return line.split(delimiter)
}

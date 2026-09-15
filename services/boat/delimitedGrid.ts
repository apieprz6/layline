/**
 * What a `.pol` and a `.sailselect` have in common as *text*.
 *
 * The two formats hold different things — boat speeds against sail numbers — but they are the
 * same document: a `TWA/TWS` header of wind speeds, one delimited row per wind angle, and the
 * same handful of oddities that survive being written by a dozen different exporters. qtVlm
 * documents the shape once (p. 38) and both files obey it, so the reading of it lives here once
 * and neither parser owns a private copy.
 *
 * What is shared is the *reading* — the byte-order mark, the line endings, the comment and blank
 * lines, the free-text line some exporters put before the header, the delimiter, and the trailing
 * delimiter. What is not shared is everything the fields *mean*: a polar cell is a non-negative
 * decimal and a crossover cell is a whole-number sail id, so each parser reads its own values and
 * makes its own refusals.
 *
 * Nothing here corrects anything. A tolerated oddity is reported, never quietly repaired, because
 * a file nobody was told was odd is a file nobody knows to look at.
 */

import type { GridParseWarning, GridParseWarningCode } from '@/types'

/** Sniffed from the header, most distinctive first; whitespace is the fallback. */
const DELIMITERS = ['\t', ';', ','] as const

/** `twa/tws`, `TWA\TWS`, `Twa/Tws` — the separator and the casing are both free. */
export const HEADER_SENTINEL = /^twa[/\\]tws$/i

/** A bare `TWA` first field, which 86 of the polar corpus's 273 files use. */
export const BARE_TWA = /^twa$/i

/**
 * A number in the form a grid file may write one. Deliberately narrower than `Number()`, which
 * also reads `0x10`, `Infinity`, `1e3` and whitespace — none of which any exporter emits, and all
 * of which would be a sign we are reading something that is not a grid.
 */
export const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/** One line of the file, carrying the number it had before anything was skipped. */
export interface NumberedLine {
  line: number
  text: string
}

/**
 * What the shared readers need of a warning collector: somewhere to put the codes *they* raise.
 *
 * Narrower than `GridWarnings<Code>` on purpose. A parser collects its own codes too — the
 * polar's `decimal-comma-normalised` — and `GridWarnings<PolarParseWarningCode>` is *not* a
 * `GridWarnings<GridParseWarningCode>`, because the code type appears in both argument and return
 * position. Every collector is a sink for the shared codes, which is all these readers ask for.
 */
export interface GridWarningSink {
  once(code: GridParseWarningCode, line?: number, detail?: string): void
  at(code: GridParseWarningCode, line: number, detail?: string): void
}

/**
 * The four oddities that are about the *lines* of a delimited file rather than about a grid, so
 * they are the only four `readGridLines` can raise.
 *
 * Stated separately because the Crossover Chart's definitions file is a two-column list with no
 * header at all: it shares the byte-order mark, the line endings and the comments, and has no
 * header token to be surprised by. Naming exactly what the reader raises means its collector need
 * not accept a code it will never be handed.
 */
export type LineReadingWarningCode = Extract<
  GridParseWarningCode,
  'bom-stripped' | 'crlf-line-endings' | 'blank-line-skipped' | 'comment-line-skipped'
>

export interface LineWarningSink {
  once(code: LineReadingWarningCode, line?: number, detail?: string): void
  at(code: LineReadingWarningCode, line: number, detail?: string): void
}

/**
 * Collects warnings for one parse, reporting a file-wide oddity once.
 *
 * A trailing tab on all 38 lines of a qtVlm library file is one fact about the file, and 38
 * copies of it would bury the warning that matters.
 */
export class GridWarnings<Code extends string = GridParseWarningCode> {
  private readonly collected: GridParseWarning<Code>[] = []
  private readonly seen = new Set<Code>()

  /** Report this code once for the whole file, at the line it was first seen on. */
  once(code: Code, line?: number, detail?: string): void {
    if (this.seen.has(code)) return
    this.seen.add(code)
    this.collected.push({
      code,
      ...(line === undefined ? {} : { line }),
      ...(detail === undefined ? {} : { detail }),
    })
  }

  /** Report this code again, for something that is per-line rather than per-file. */
  at(code: Code, line: number, detail?: string): void {
    this.collected.push({ code, line, ...(detail === undefined ? {} : { detail }) })
  }

  /** The warnings in the order they were found. */
  all(): GridParseWarning<Code>[] {
    return this.collected
  }
}

/**
 * The lines of the file that carry content, numbered as they are in the sailor's own editor.
 *
 * Numbered before anything is dropped, so a refusal points at the line the admin will count to
 * rather than at a line in some filtered version of their file.
 *
 * The byte-order mark and the line endings are stepped over for *reading* only: the bytes in
 * Storage keep both, and `content_sha256` is over those bytes.
 */
export function readGridLines(contents: string, warnings: LineWarningSink): NumberedLine[] {
  let text = contents

  if (text.startsWith('﻿')) {
    text = text.slice(1)
    warnings.once('bom-stripped', 1)
  }

  if (text.includes('\r')) {
    text = text.replace(/\r\n?/g, '\n')
    warnings.once('crlf-line-endings', 1)
  }

  const lines: NumberedLine[] = text
    .split('\n')
    .map((value, index) => ({ line: index + 1, text: value }))

  const content: NumberedLine[] = []

  for (const line of lines) {
    const trimmed = line.text.trim()

    if (trimmed === '') {
      // A file ends in a newline far more often than not, so the empty final line is not an
      // oddity worth reporting.
      if (line.line < lines.length) warnings.at('blank-line-skipped', line.line)
      continue
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      warnings.at('comment-line-skipped', line.line, trimmed.slice(0, 60))
      continue
    }

    content.push({ line: line.line, text: line.text })
  }

  return content
}

/**
 * The delimiter this file uses, sniffed rather than inferred from the extension — the polar
 * corpus has TAB, `;`, `,` and space files all named `.pol`.
 *
 * `null` means whitespace, which is both the fallback and a real format: a run of spaces is one
 * delimiter, so it cannot be handled by splitting on a single character.
 */
export function sniffDelimiter(headerLine: string): string | null {
  for (const candidate of DELIMITERS) {
    if (headerLine.includes(candidate)) return candidate
  }
  return null
}

export function splitFields(line: string, delimiter: string | null): string[] {
  if (delimiter === null) return line.trim().split(/\s+/)
  return line.split(delimiter)
}

/** The first field of a line, under that line's own sniffed delimiter. */
export function firstFieldOf(line: NumberedLine): string {
  return splitFields(line.text, sniffDelimiter(line.text))[0]?.trim() ?? ''
}

/**
 * Which content line is the header.
 *
 * The first, unless the second one carries the sentinel — some exporters put the boat's name or
 * the certificate number on a line of its own first. Reports the skip rather than swallowing it.
 */
export function findHeaderIndex(content: NumberedLine[], warnings: GridWarningSink): number {
  const first = firstFieldOf(content[0])

  if (HEADER_SENTINEL.test(first) || BARE_TWA.test(first)) return 0

  const second = firstFieldOf(content[1])

  if (HEADER_SENTINEL.test(second) || BARE_TWA.test(second)) {
    warnings.at('description-line-skipped', content[0].line, content[0].text.trim().slice(0, 60))
    return 1
  }

  return 0
}

/** A header split into fields, with the trailing delimiter accounted for. */
export interface GridHeader {
  /** The header line itself, for a refusal to point at. */
  line: NumberedLine
  /** `null` for whitespace-delimited. */
  delimiter: string | null
  /** The fields, trimmed, without the trailing empty one. */
  fields: string[]
  /** Whether every line in this file ends with the delimiter. */
  trailingDelimiter: boolean
  /** The first field verbatim, in the case the file wrote it. */
  token: string
}

/**
 * Read the header line: its delimiter, its fields, and whether the file ends every line with a
 * delimiter.
 *
 * The trailing delimiter is decided on the header and applied to the whole file: a file that ends
 * every line with a tab ends the header with one too.
 */
export function readGridHeader(line: NumberedLine, warnings: GridWarningSink): GridHeader {
  const delimiter = sniffDelimiter(line.text)
  const fields = splitFields(line.text, delimiter).map((field) => field.trim())

  const trailingDelimiter = fields.length > 1 && fields.at(-1) === ''
  if (trailingDelimiter) {
    fields.pop()
    warnings.once('trailing-empty-field', line.line)
  }

  const token = fields[0] ?? ''

  return { line, delimiter, fields, trailingDelimiter, token }
}

/**
 * Report on the header token, which is kept verbatim either way.
 *
 * Called after the field count has been checked, so a file with no grid at all is refused as
 * having no header rather than warned about its token.
 */
export function warnAboutHeaderToken(header: GridHeader, warnings: GridWarningSink): void {
  if (BARE_TWA.test(header.token)) {
    warnings.once('bare-twa-header', header.line.line, header.token)
  } else if (!HEADER_SENTINEL.test(header.token)) {
    warnings.once('unexpected-header-token', header.line.line, header.token)
  }
}

/**
 * The fields of one data row, with the file's trailing delimiter dropped if it is there.
 *
 * `width` is the number of value columns, so a row is `width + 1` fields: the axis label and
 * then one value per column.
 */
export function readRowFields(
  row: NumberedLine,
  header: GridHeader,
  width: number
): string[] {
  const fields = splitFields(row.text, header.delimiter)

  if (header.trailingDelimiter && fields.length === width + 2 && fields.at(-1)?.trim() === '') {
    fields.pop()
  }

  return fields
}

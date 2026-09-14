/**
 * Transcribe a qtVlm VDR export into a Transcription, and render a Transcription back.
 *
 * qtVlm's CSV is not a format so much as a user's choices: which columns to log, whether the
 * date reads month-first or day-first, whether decimals use a point or a comma, and which
 * language the ALARM column's no-alarm word is in. None of that is announced in the file, so
 * all of it is sniffed here and reported alongside the rows — a figure Layline states rather
 * than one it assumes.
 *
 * Two rules shape the whole module:
 *
 *   1. Every value is transcribed as text. `0.0` and `-0.0` and `20.10` are one JavaScript
 *      number and none of them renders back as what the file said, so a number here would
 *      quietly cost the round trip its bytes. Postgres `numeric` keeps the scale it is given
 *      (see `docs/design-docs/race-archive-schema.md`), so text in and text out is the one
 *      representation that survives both hops — provided the text is already the form `numeric`
 *      gives back, so `+5.0` and `007` and `-0.0` are refused rather than stored as values whose
 *      bytes would change on the way out. Every one of the archive's thirteen recordings passes
 *      that unaltered.
 *
 *   2. Nothing is interpreted. An empty field is null, never zero and never a sentinel: `-1`
 *      is a real wind angle and `0` a real direction, so a stand-in would be indistinguishable
 *      from a reading. `ALARM` keeps whatever word it holds, because `None` and `Aucune` mean
 *      the same thing to a reader and different things to a hash. Unrecognised columns are
 *      kept in `extras` under their verbatim header name rather than dropped.
 *
 * `parseQtvlmRecording` reassembles its own output and compares it to the bytes it was given
 * before returning, so a Transcription that cannot reproduce the file is never handed back.
 * The round trip is therefore a property of the value, not a claim about it (ADR 0008); the
 * test over the archive's own recordings is in `__tests__/archive-round-trip.test.ts`.
 *
 * What that check cannot see is the storage hop, so the two things that would survive it and
 * still come back different — a value `numeric` re-renders, and a column name that is a
 * property of every JavaScript object — are refused and worked around here respectively.
 */

import { createHash } from 'node:crypto'

import { daysInMonth } from '@/services/recordings/wall-clock'
import type {
  RecordingDateOrder,
  RecordingRowExtras,
  Transcription,
  TranscriptionChannels,
  TranscriptionOutcome,
  TranscriptionRefusal,
  TranscriptionRow,
} from '@/types'

/** The one column a recording cannot do without, and the two that make it a track. */
export const DATE_COLUMN = 'Date'
const LONGITUDE_COLUMN = 'Longitude'
const LATITUDE_COLUMN = 'Latitude'

/**
 * Verbatim qtVlm header name to the column that holds it. Every other header is an extra,
 * which is why a header variant — `RPM` inserted mid-header, a column the sailor turned off —
 * needs no change here.
 *
 * `TWA` and `TWA (calc)` are different columns and are kept apart deliberately: true wind
 * angle is read from `TWA`, and `TWA (calc)` is transcribed and read by nothing (ADR 0008).
 *
 * A Map rather than the object it is written as, because a plain object answers to `constructor`
 * and `toString` as well, and a column so named would be slotted into a field that is a
 * function instead of landing in `extras`.
 */
const CHANNEL_COLUMNS: Readonly<Record<string, keyof TranscriptionChannels>> = {
  Longitude: 'longitude',
  Latitude: 'latitude',
  COG: 'cog',
  SOG: 'sog',
  TWD: 'twd',
  TWS: 'tws',
  TWA: 'twa',
  GWD: 'gwd',
  GWS: 'gws',
  CTW: 'ctw',
  STW: 'stw',
  POL: 'pol',
  PRE: 'pre',
  XTE: 'xte',
  RPM: 'rpm',
  'TWA (calc)': 'twa_calc',
  'AWA (calc)': 'awa_calc',
  'AWS (calc)': 'aws_calc',
  ALARM: 'alarm',
  OBSERVATIONS: 'observations',
}

const CHANNEL_BY_COLUMN: ReadonlyMap<string, keyof TranscriptionChannels> = new Map(
  Object.entries(CHANNEL_COLUMNS)
)

/**
 * The two channels that are words rather than measurements. They are never normalised and
 * never trimmed: one archive file records the alarm `'AIS '`, trailing space and all.
 */
const TEXT_CHANNELS: ReadonlySet<keyof TranscriptionChannels> = new Set([
  'alarm',
  'observations',
])

/** A row with nothing in it. Columns the file does not carry stay null rather than absent. */
const NO_CHANNELS: Readonly<TranscriptionChannels> = {
  longitude: null,
  latitude: null,
  cog: null,
  sog: null,
  twd: null,
  tws: null,
  twa: null,
  gwd: null,
  gws: null,
  ctw: null,
  stw: null,
  pol: null,
  pre: null,
  xte: null,
  rpm: null,
  twa_calc: null,
  awa_calc: null,
  aws_calc: null,
  alarm: null,
  observations: null,
}

/** Delimiters worth considering, most likely first. Sniffed from the header, never assumed. */
const DELIMITER_CANDIDATES = [';', '\t', ',', '|'] as const

/**
 * `DD/MM/YYYY HH:MM:SS` or `MM/DD/YYYY HH:MM:SS` — which of the two is the whole problem, so
 * the pattern captures the first two components without naming them.
 */
const SLASH_TIMESTAMP = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})$/

/** A number written with a comma for its decimal point, which a French-locale export is. */
const COMMA_DECIMAL = /^[+-]?\d+,\d+$/
const POINT_DECIMAL = /^[+-]?\d+\.\d+$/

/**
 * The text form Postgres `numeric` gives back: an optional sign, no leading zeros, an optional
 * fraction of any length. A value outside it is re-rendered or refused by the database, either
 * of which would cost the stored round trip its bytes — so it is refused here instead, where
 * the reason can name the column.
 */
const CANONICAL_NUMERIC = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/

/** `numeric` has one zero and it is positive, so `-0.0` comes back as `0.0`. */
const NEGATIVE_ZERO = /^-0(\.0*)?$/

/** A UTF-8 byte-order mark, which belongs to no column and so cannot be reproduced. */
const BYTE_ORDER_MARK = '\uFEFF'

/** What a header position holds, decided once so parse and reassemble cannot disagree. */
type Slot =
  | { kind: 'date' }
  | { kind: 'channel'; channel: keyof TranscriptionChannels; numeric: boolean }
  | { kind: 'extra'; column: string }

/** The first two components of a slash timestamp, still un-assigned to day and month. */
interface TimestampParts {
  first: number
  second: number
  year: number
  hour: number
  minute: number
  second_of_minute: number
}

export interface ParseQtvlmOptions {
  /**
   * Overrides the sniffed ordering. This is the correction path the schema exists for: when
   * every day in a file is 12 or below the file cannot say which reading is right, so a wrong
   * one is fixed by re-parsing the stored bytes with this set — never by re-uploading.
   */
  dateOrder?: RecordingDateOrder
}

/**
 * Both default to the Transcription's own sniffed values, so the ordinary call takes no options
 * and cannot quietly produce the wrong bytes. They are overridable only because a caller may be
 * reproducing the recipe in
 * `supabase/migrations/20260910183000_create_race_archive_and_boat_setup.sql`, which hardcodes
 * `;` and a point.
 *
 * Neither has a column in `recordings`. Every file in the archive uses both defaults, so the
 * SQL recipe is right as written; a comma-decimal upload would need the separator stored before
 * its bytes could be reproduced from the database rather than from the file. Because the fields
 * are required on `Transcription`, whoever assembles one from database rows has to answer that
 * question rather than inherit a wrong default.
 */
export interface ReassembleOptions {
  delimiter?: string
  decimalSeparator?: '.' | ','
}

function refuse(reason: TranscriptionRefusal, message: string): TranscriptionOutcome {
  return { ok: false, reason, message }
}

/** Two digits, for a timestamp component. */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The delimiter, sniffed from the header line alone.
 *
 * The header is the only line guaranteed to be free of numbers, which is what makes this
 * independent of the decimal separator: a `;`-delimited file with comma decimals has commas
 * all through its rows and none in its header.
 */
function sniffDelimiter(header: string): string {
  let best: string = DELIMITER_CANDIDATES[0]
  let bestCount = 0

  for (const candidate of DELIMITER_CANDIDATES) {
    const count = header.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }

  return best
}

/**
 * The decimal separator, sniffed from the recognised measurements alone.
 *
 * An unrecognised column is deliberately not consulted. Its value is stored verbatim in
 * `extras` and rendered verbatim on the way back, so the separator does nothing to it — which
 * means a boat logging four instrument channels Layline has no name for could otherwise
 * outvote the readings it does, and get a perfectly reproducible file refused.
 *
 * A file that mixes both forms is not refused here; it simply fails to reassemble, and the
 * self-check turns that into a refusal with the bytes to prove it.
 */
function sniffDecimalSeparator(slots: Slot[], rows: string[][]): '.' | ',' {
  const numericSlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.kind === 'channel' && slot.numeric)

  let commas = 0
  let points = 0

  for (const cells of rows) {
    for (const { index } of numericSlots) {
      const cell = cells[index]
      if (COMMA_DECIMAL.test(cell)) commas += 1
      else if (POINT_DECIMAL.test(cell)) points += 1
    }
  }

  return commas > points ? ',' : '.'
}

/** Split a timestamp into components, or null when it is not one of the forms qtVlm writes. */
function timestampParts(verbatim: string): TimestampParts | null {
  const match = SLASH_TIMESTAMP.exec(verbatim)
  if (!match) return null

  const [, first, second, year, hour, minute, secondOfMinute] = match
  return {
    first: Number(first),
    second: Number(second),
    year: Number(year),
    hour: Number(hour),
    minute: Number(minute),
    second_of_minute: Number(secondOfMinute),
  }
}

/**
 * The components read under one ordering, as a naive wall-clock stamp — or null when that
 * reading is not a real date.
 *
 * There is no timezone conversion here of any kind, and no `Date` in the arithmetic: the
 * string is assembled from the components the file gave. A recording is in the sailor's own
 * wall clock, and a UTC hop and back is exactly how an hour goes missing.
 */
function resolveTimestamp(parts: TimestampParts, order: RecordingDateOrder): string | null {
  const month = order === 'MDY' ? parts.first : parts.second
  const day = order === 'MDY' ? parts.second : parts.first

  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(parts.year, month)) return null
  if (parts.hour > 23 || parts.minute > 59 || parts.second_of_minute > 59) return null

  const date = `${parts.year}-${pad2(month)}-${pad2(day)}`
  return `${date}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second_of_minute)}`
}

/**
 * Which way round the dates read, and on what evidence.
 *
 * A component above 12 can only be a day, so one such row settles the file. Absent that the
 * file genuinely cannot say — `06/03` is two real dates three months apart — and month-first
 * is the assumption, recorded as an assumption. This is the only guess the parser makes, and
 * `date_verbatim` is stored beside every resolved stamp so it stays correctable.
 */
function decideDateOrder(
  parts: TimestampParts[]
): { order: RecordingDateOrder; proven: boolean } | { contradiction: string } {
  let dayFirst = false
  let monthFirst = false

  for (const p of parts) {
    if (p.first > 12) dayFirst = true
    if (p.second > 12) monthFirst = true
  }

  if (dayFirst && monthFirst) {
    return {
      contradiction:
        'the Date column reads day-first in some rows and month-first in others, so no single ordering fits the file',
    }
  }

  if (dayFirst) return { order: 'DMY', proven: true }
  if (monthFirst) return { order: 'MDY', proven: true }
  return { order: 'MDY', proven: false }
}

/**
 * Transcribe a qtVlm VDR export.
 *
 * Give it the uploaded bytes where they are to hand: `content_sha256` is then taken over those
 * exact bytes, and a file that is not UTF-8 is refused rather than read with replacement
 * characters and hashed as something the file never was. A string is accepted for convenience
 * and re-encoded as UTF-8, which is the same hash for any file that really was UTF-8.
 */
export function parseQtvlmRecording(
  source: string | Uint8Array,
  options: ParseQtvlmOptions = {}
): TranscriptionOutcome {
  const bytes = typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source)

  const text = bytes.toString('utf8')

  // Decoding has to be lossless, and re-encoding is the whole test: a Windows-1252 export
  // decodes to U+FFFD where its accented byte was, which encodes back to something else. Left
  // alone it would put a replacement character in a row and hash bytes nobody can reproduce.
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    return refuse(
      'not-transcribable',
      'the file is not valid UTF-8, so its bytes cannot be read as a recording'
    )
  }

  if (text.startsWith(BYTE_ORDER_MARK)) {
    return refuse(
      'not-transcribable',
      'the file begins with a byte-order mark, which belongs to no column and so could not be reproduced'
    )
  }

  // A CR would survive into no stored column, so it could never be reproduced. Refusing is
  // honest where stripping it would leave `content_sha256` describing bytes we discarded.
  if (text.includes('\r')) {
    return refuse(
      'not-transcribable',
      'the file uses CRLF line endings, which the stored round trip has no way to reproduce'
    )
  }

  const trailing_newline = text.endsWith('\n')
  const lines = text.split('\n')
  if (trailing_newline) lines.pop()

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return refuse('no-rows', 'the file is empty')
  }
  if (lines[0] === '') {
    // Not "empty": a file with a header and rows under a blank first line is a real recording,
    // and telling the sailor it is empty sends them looking for the wrong problem.
    return refuse(
      'no-date-column',
      `the first line is blank, so the file has no header and no ${DATE_COLUMN} column`
    )
  }

  const delimiter = sniffDelimiter(lines[0])
  const source_columns = lines[0].split(delimiter)

  const dateAt = source_columns.indexOf(DATE_COLUMN)
  if (dateAt === -1) {
    return refuse(
      'no-date-column',
      `the header has no ${DATE_COLUMN} column, so no row has a time: ${lines[0]}`
    )
  }
  // The stored round trip renders `date_verbatim` first (see the recipe in the schema
  // migration), so a Date anywhere else could be reassembled here and not from the database.
  if (dateAt !== 0) {
    return refuse(
      'not-transcribable',
      `the ${DATE_COLUMN} column is at position ${dateAt + 1}; the stored round trip renders it first`
    )
  }

  const missingPosition = [LONGITUDE_COLUMN, LATITUDE_COLUMN].filter(
    (column) => !source_columns.includes(column)
  )
  if (missingPosition.length > 0) {
    return refuse(
      'no-position-column',
      `the header has no ${missingPosition.join(' and no ')} column, so the rows are not a track`
    )
  }

  const slots: Slot[] = []
  const claimed = new Set<string>()
  for (const column of source_columns) {
    if (claimed.has(column)) {
      // Two columns of one name leave the second with nowhere to go that reassembles.
      return refuse(
        'not-transcribable',
        `the header names ${JSON.stringify(column)} twice, so one of the two columns cannot be stored`
      )
    }
    claimed.add(column)

    if (column === DATE_COLUMN) {
      slots.push({ kind: 'date' })
      continue
    }
    const channel = CHANNEL_BY_COLUMN.get(column)
    if (channel) {
      slots.push({ kind: 'channel', channel, numeric: !TEXT_CHANNELS.has(channel) })
    } else {
      slots.push({ kind: 'extra', column })
    }
  }

  const dataLines = lines.slice(1)
  if (dataLines.length === 0) {
    return refuse('no-rows', 'the file is a header with no rows, so there is nothing to record')
  }

  const cellsByRow: string[][] = []
  for (const [offset, line] of dataLines.entries()) {
    const cells = line.split(delimiter)
    if (cells.length !== source_columns.length) {
      return refuse(
        'not-transcribable',
        `row ${offset + 1} has ${cells.length} fields where the header has ${source_columns.length}`
      )
    }
    cellsByRow.push(cells)
  }

  const decimal_separator = sniffDecimalSeparator(slots, cellsByRow)

  const partsByRow: TimestampParts[] = []
  for (const [offset, cells] of cellsByRow.entries()) {
    const parts = timestampParts(cells[0])
    if (!parts) {
      return refuse(
        'date-unreadable',
        `row ${offset + 1} has a ${DATE_COLUMN} of ${JSON.stringify(cells[0])}, which is not a timestamp qtVlm writes`
      )
    }
    // Settled per row, before the file-level ordering: one row cannot disagree with itself, so
    // `31/31` is this row being unreadable and not the file's rows contradicting each other.
    if (parts.first > 12 && parts.second > 12) {
      return refuse(
        'date-unreadable',
        `row ${offset + 1} has a ${DATE_COLUMN} of ${JSON.stringify(cells[0])}, which is not a real date read either way round`
      )
    }
    partsByRow.push(parts)
  }

  let date_order: RecordingDateOrder
  let date_order_evidence: Transcription['date_order_evidence']
  if (options.dateOrder) {
    date_order = options.dateOrder
    date_order_evidence = 'supplied'
  } else {
    const decided = decideDateOrder(partsByRow)
    if ('contradiction' in decided) {
      return refuse('date-unreadable', decided.contradiction)
    }
    date_order = decided.order
    date_order_evidence = decided.proven ? 'proven' : 'assumed'
  }

  const rows: TranscriptionRow[] = []
  for (const [offset, cells] of cellsByRow.entries()) {
    const row_time = resolveTimestamp(partsByRow[offset], date_order)
    if (!row_time) {
      return refuse(
        'date-unreadable',
        `row ${offset + 1}'s ${DATE_COLUMN} of ${JSON.stringify(cells[0])} is not a real date read as ${date_order}`
      )
    }

    const channels: TranscriptionChannels = { ...NO_CHANNELS }
    let extras: RecordingRowExtras | null = null
    let unstorable: string | null = null

    slots.forEach((slot, index) => {
      const cell = cells[index]
      switch (slot.kind) {
        case 'date':
          return
        case 'channel': {
          // Empty means the instrument said nothing. Text is taken as written, spaces and
          // localised words included; a number is only re-pointed, never reformatted.
          if (cell === '') return
          if (!slot.numeric) {
            channels[slot.channel] = cell
            return
          }
          const value = cell.replace(decimal_separator, '.')
          if (!CANONICAL_NUMERIC.test(value) || NEGATIVE_ZERO.test(value)) {
            unstorable ??=
              `row ${offset + 1} has ${source_columns[index]} of ${JSON.stringify(cell)}, ` +
              'which is not a value Postgres numeric gives back unchanged'
            return
          }
          channels[slot.channel] = value
          return
        }
        case 'extra':
          // An absent key and an empty field are the same missing value, so an empty extra is
          // left out rather than stored as `''`. No numeric standard applies: an extra is text
          // in JSONB, so a word or a comma decimal is stored exactly as the file wrote it.
          if (cell === '') return
          // Null-prototype, because `extras['__proto__'] = value` on a plain object sets the
          // prototype instead of holding the value, and the column would be silently lost.
          extras ??= Object.create(null) as RecordingRowExtras
          extras[slot.column] = cell
          return
      }
    })

    if (unstorable) {
      return refuse('not-transcribable', unstorable)
    }

    rows.push({
      row_index: offset + 1,
      date_verbatim: cells[0],
      row_time,
      ...channels,
      extras,
    })
  }

  const times = rows.map((row) => row.row_time)
  const transcription: Transcription = {
    source_columns,
    date_order,
    trailing_newline,
    // Over the bytes themselves, so this is the hash of the object in Storage.
    content_sha256: createHash('sha256').update(bytes).digest('hex'),
    row_count: rows.length,
    // Lexicographic on a fixed-width stamp is chronological, and stays in the wall clock.
    first_row_time: times.reduce((a, b) => (b < a ? b : a)),
    last_row_time: times.reduce((a, b) => (b > a ? b : a)),
    rows,
    date_order_evidence,
    delimiter,
    decimal_separator,
  }

  // The promise, checked rather than asserted. Anything the transcription cannot reproduce —
  // a quoted field, a mixed decimal separator, a numeric form no rule here anticipated —
  // fails here rather than being stored as a faithful copy that is not one.
  if (reassembleTranscription(transcription) !== text) {
    return refuse(
      'not-transcribable',
      'the transcription does not reproduce the file byte for byte, so storing it would store a claim rather than a copy'
    )
  }

  return { ok: true, transcription }
}

/**
 * What one verbatim header name holds in one row.
 *
 * This is the only reader of the column mapping, so reassembly and the provenance figures
 * cannot come to different conclusions about which field a column landed in.
 */
export function recordedValue(row: TranscriptionRow, column: string): string | null {
  if (column === DATE_COLUMN) return row.date_verbatim

  const channel = CHANNEL_BY_COLUMN.get(column)
  if (channel) return row[channel]

  // `Object.hasOwn` rather than a lookup, so a column named `toString` reads the value the file
  // gave — or nothing — instead of a method inherited from a prototype the row never asked for.
  if (row.extras && Object.hasOwn(row.extras, column)) return row.extras[column]

  return null
}

/**
 * Render a Transcription back to the file it came from.
 *
 * This is the JavaScript half of the round trip; the SQL half is the recipe in
 * `supabase/migrations/20260910183000_create_race_archive_and_boat_setup.sql`, and the two agree
 * by producing the same bytes rather than by sharing code.
 */
export function reassembleTranscription(
  transcription: Transcription,
  options: ReassembleOptions = {}
): string {
  // The Transcription's own sniffed values, not `;` and `.`: a default here would render a
  // comma-decimal file with points and report success, and the caller would have a plausible
  // file whose hash does not match the one stored beside it.
  const delimiter = options.delimiter ?? transcription.delimiter
  const decimalSeparator = options.decimalSeparator ?? transcription.decimal_separator

  const render = (row: TranscriptionRow, column: string): string => {
    const value = recordedValue(row, column)
    if (value === null) return ''

    // Only a recognised measurement was re-pointed on the way in, so only one goes back. An
    // extra keeps whatever the file wrote, comma and all, because that is what was stored.
    const channel = CHANNEL_BY_COLUMN.get(column)
    const repoint = channel !== undefined && !TEXT_CHANNELS.has(channel)
    return repoint ? value.replace('.', decimalSeparator) : value
  }

  const lines = [transcription.source_columns.join(delimiter)]
  for (const row of transcription.rows) {
    lines.push(transcription.source_columns.map((column) => render(row, column)).join(delimiter))
  }

  return lines.join('\n') + (transcription.trailing_newline ? '\n' : '')
}

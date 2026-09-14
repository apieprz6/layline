/**
 * The qtVlm VDR parser, tested through its two exports.
 *
 * The archive's own thirteen recordings are not in this repo, so the byte-exact round trip
 * over them lives in `archive-round-trip.test.ts`. What is here runs everywhere: the
 * vendored third-party export (`docs/research/fixtures/qtvlm-vdr-french-locale.csv`), and
 * synthetic files for the four things no real file in hand exercises — an unknown column, a
 * silently ambiguous date, a missing position column, and a file with no rows.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseQtvlmRecording, reassembleTranscription } from '@/services/recordings/qtvlm'

const HEADER =
  'Date;Longitude;Latitude;COG;SOG;TWD;TWS;TWA;GWD;GWS;CTW;STW;POL;PRE;XTE;' +
  'TWA (calc);AWA (calc);AWS (calc);ALARM;OBSERVATIONS'

/** A third-party qtVlm export, vendored: semicolons, comma decimals, French alarm words. */
const frenchExport = readFileSync(
  join(process.cwd(), 'docs/research/fixtures/qtvlm-vdr-french-locale.csv'),
  'utf8'
)

const ROW =
  '06/03/2026 18:07:34;-87.6123783333;41.8845983333;226.9;1.0;67.0;1.6;-6.0;49.4;2.6;73.0;;' +
  '0.1;;;-6.0;356.3;2.6;None;'

function transcribed(text: string, options?: Parameters<typeof parseQtvlmRecording>[1]) {
  const outcome = parseQtvlmRecording(text, options)
  if (!outcome.ok) {
    throw new Error(`expected a Transcription, got ${outcome.reason}: ${outcome.message}`)
  }
  return outcome.transcription
}

function refused(source: string | Uint8Array) {
  const outcome = parseQtvlmRecording(source)
  if (outcome.ok) {
    throw new Error('expected a refusal, got a Transcription')
  }
  return outcome
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('a recorded row', () => {
  it('is transcribed field by field, with an empty field as null rather than as a number', () => {
    const { rows } = transcribed(`${HEADER}\n${ROW}\n`)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      row_index: 1,
      date_verbatim: '06/03/2026 18:07:34',
      row_time: '2026-06-03T18:07:34',
      longitude: '-87.6123783333',
      latitude: '41.8845983333',
      cog: '226.9',
      sog: '1.0',
      twd: '67.0',
      tws: '1.6',
      twa: '-6.0',
      gwd: '49.4',
      gws: '2.6',
      ctw: '73.0',
      // The paddlewheel was below its stall speed. Not zero, and not a sentinel.
      stw: null,
      pol: '0.1',
      pre: null,
      xte: null,
      rpm: null,
      twa_calc: '-6.0',
      awa_calc: '356.3',
      aws_calc: '2.6',
      // Stored as written. The no-alarm value is UI-localised, so mapping it to null is a
      // read-time interpretation and would cost the round trip its bytes.
      alarm: 'None',
      observations: null,
      extras: null,
    })
  })

  it('keeps a zero and a negative angle as the readings they are', () => {
    // The reason a sentinel is unusable rather than merely untidy: both of these are values a
    // working instrument reports, and neither can be told from -1 or 0 standing in for null.
    const row = ROW.replace(';67.0;', ';0;').replace(';-6.0;49.4', ';-1;49.4')
    const [transcribedRow] = transcribed(`${HEADER}\n${row}\n`).rows

    expect(transcribedRow.twd).toBe('0')
    expect(transcribedRow.twa).toBe('-1')
  })

  it('reads true wind angle from TWA and keeps TWA (calc) beside it, unmixed', () => {
    // qtVlm computes its own TWA at export time and the two disagree. `twa` is the instrument
    // figure; `twa_calc` is transcribed so nothing is dropped, and read by nothing (ADR 0008).
    const row = ROW.replace(';-6.0;356.3;', ';-11.4;356.3;')
    const [transcribedRow] = transcribed(`${HEADER}\n${row}\n`).rows

    expect(transcribedRow.twa).toBe('-6.0')
    expect(transcribedRow.twa_calc).toBe('-11.4')
  })
})

describe('the header', () => {
  it('is captured verbatim and in order, under the names the file uses', () => {
    const { source_columns } = transcribed(`${HEADER}\n${ROW}\n`)

    expect(source_columns).toEqual(HEADER.split(';'))
    // Not `twa_calc`. What the column set states is what the sailor's export said.
    expect(source_columns).toContain('TWA (calc)')
  })

  it('takes RPM inserted mid-header without a change here', () => {
    // A real second header variant from the archive: RPM logged, sitting between XTE and
    // TWA (calc), shifting every column after it.
    const header = HEADER.replace(';TWA (calc)', ';RPM;TWA (calc)')
    const row = ROW.replace(';-6.0;356.3', ';1450;-6.0;356.3')
    const { source_columns, rows } = transcribed(`${header}\n${row}\n`)

    expect(source_columns[15]).toBe('RPM')
    expect(rows[0].rpm).toBe('1450')
    // The shift did not smear the columns after it.
    expect(rows[0].twa_calc).toBe('-6.0')
    expect(rows[0].awa_calc).toBe('356.3')
    expect(rows[0].alarm).toBe('None')
  })

  it('puts a column it has no name for in extras, keyed as the file wrote it', () => {
    const header = `${HEADER};HEEL (deg)`
    const row = `${ROW};-4.2`
    const { source_columns, rows } = transcribed(`${header}\n${row}\n`)

    expect(source_columns).toContain('HEEL (deg)')
    expect(rows[0].extras).toEqual({ 'HEEL (deg)': '-4.2' })
  })

  it('tolerates the unknown column rather than refusing the file, and reproduces it', () => {
    const text = `${HEADER};HEEL (deg)\n${ROW};-4.2\n`

    expect(parseQtvlmRecording(text).ok).toBe(true)
    expect(reassembleTranscription(transcribed(text))).toBe(text)
  })

  it('leaves an empty extra out rather than recording it as an empty string', () => {
    const { rows } = transcribed(`${HEADER};HEEL (deg)\n${ROW};\n`)

    expect(rows[0].extras).toBeNull()
  })

  it('treats a column named after a property of every object as the extra it is', () => {
    // `constructor` is a truthy lookup on any plain object, so a naive column map would slot
    // this value into a field named after a function and lose it on the way to the database.
    const { extras } = transcribed(`${HEADER};constructor;__proto__\n${ROW};-4.2;7\n`).rows[0]

    // Written out key by key: `{ __proto__: '7' }` as a literal sets a prototype instead of
    // holding a value, which is the same trap the parser has to avoid.
    expect(Object.keys(extras ?? {})).toEqual(['constructor', '__proto__'])
    expect(extras?.['constructor']).toBe('-4.2')
    expect(extras?.['__proto__']).toBe('7')
  })

  it('reproduces a file whose columns are named after those properties', () => {
    const text = `${HEADER};constructor;__proto__\n${ROW};-4.2;7\n`

    expect(reassembleTranscription(transcribed(text))).toBe(text)
  })
})

describe('the delimiter and the decimal separator', () => {
  it('are sniffed independently, because a real export pairs semicolons with commas', () => {
    const { delimiter, decimal_separator } = transcribed(frenchExport)

    expect(delimiter).toBe(';')
    expect(decimal_separator).toBe(',')
  })

  it('leaves the transcribed value in the point form Postgres numeric takes', () => {
    const { rows } = transcribed(frenchExport)

    expect(rows[0].longitude).toBe('-1.7910683333')
    expect(rows[0].sog).toBe('4.8')
    // Re-pointing is the only edit made, so the digits and the scale are the file's own.
    expect(rows[0].latitude).toBe('46.4886666667')
  })

  it('reproduces a comma-decimal file byte for byte, without being told how again', () => {
    // A Transcription carries what was sniffed, so reassembly reads it from there rather than
    // falling back to a default that would put points in a comma-decimal file and report
    // success.
    const transcription = transcribed(frenchExport)
    const reassembled = reassembleTranscription(transcription)

    expect(sha256(reassembled)).toBe(transcription.content_sha256)
    expect(sha256(reassembled)).toBe(sha256(frenchExport))
  })

  it('is not decided by columns Layline has no name for', () => {
    // Four comma-written values in unrecognised columns against three point-written readings.
    // An extra is stored and reproduced verbatim, so it has no separator to be re-pointed with
    // and no business voting on one — and this file reassembles exactly as it arrived.
    const text =
      'Date;Longitude;Latitude;SOG;HEEL;RUDDER;TRIM;LEEWAY\n' +
      '06/03/2026 18:07:34;-87.6;41.8;1.0;-4,2;3,1;0,5;1,2\n'
    const transcription = transcribed(text)

    expect(transcription.decimal_separator).toBe('.')
    expect(reassembleTranscription(transcription)).toBe(text)
  })
})

describe('a value Postgres numeric would not give back unchanged', () => {
  // The hash is over the *stored* transcription, so a value the database would re-render or
  // refuse is the one way a byte round trip in memory could still be a false promise. Catching
  // it here is a clear refusal; leaving it produces a raw type error at upload time.

  it('is refused when a numeric column holds something that is not a number', () => {
    const outcome = refused(`${HEADER}\n${ROW.replace(';67.0;', ';N/A;')}\n`)

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/TWD/)
    expect(outcome.message).toMatch(/N\/A/)
  })

  it('is refused for a negative zero, which comes back as a positive one', () => {
    const outcome = refused(`${HEADER}\n${ROW.replace(';67.0;', ';-0.0;')}\n`)

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/TWD/)
  })

  it('is refused for a sign or a leading zero the database would drop', () => {
    expect(refused(`${HEADER}\n${ROW.replace(';67.0;', ';+67.0;')}\n`).reason).toBe(
      'not-transcribable'
    )
    expect(refused(`${HEADER}\n${ROW.replace(';67.0;', ';067.0;')}\n`).reason).toBe(
      'not-transcribable'
    )
  })

  it('is not held to that standard in a column Layline has no name for', () => {
    // An extra lands in JSONB as text, so `Aucune` or `1,2` or a word is stored as written.
    const { rows } = transcribed(`${HEADER};NOTE\n${ROW};not a number\n`)

    expect(rows[0].extras).toEqual({ NOTE: 'not a number' })
  })
})

describe('the file as bytes', () => {
  it('is hashed as the bytes it arrived as, not as a re-encoding of them', () => {
    const bytes = Buffer.from(`${HEADER}\n${ROW}\n`, 'utf8')
    const outcome = parseQtvlmRecording(bytes)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.transcription.content_sha256).toBe(
      createHash('sha256').update(bytes).digest('hex')
    )
  })

  it('is refused when it is not UTF-8, rather than being read with replacement characters', () => {
    // A Windows-1252 export: `obsé` as a single 0xE9 byte. Decoding it leniently would put
    // U+FFFD in the row and hash bytes that are not the file's.
    const outcome = refused(
      Buffer.concat([
        Buffer.from(`${HEADER}\n${ROW}`, 'utf8'),
        Buffer.from([0x6f, 0x62, 0x73, 0xe9]),
        Buffer.from('\n', 'utf8'),
      ])
    )

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/UTF-8/)
  })

  it('is refused for a byte-order mark, which no stored column could reproduce', () => {
    const outcome = refused(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${HEADER}\n${ROW}\n`, 'utf8')])
    )

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/byte-order mark/)
  })
})

describe('a whole vendor export', () => {
  it('is transcribed in full, dropping no row and no localised word', () => {
    const { row_count, rows, first_row_time, last_row_time } = transcribed(frenchExport)

    expect(row_count).toBe(192)
    expect(rows).toHaveLength(192)
    // The no-alarm word is French here, which is exactly why it is not mapped to null.
    expect(rows[0].alarm).toBe('Aucune')
    expect(first_row_time).toBe('2025-11-20T10:52:38')
    expect(last_row_time).toBe('2025-11-20T13:44:45')
  })
})

describe('the date', () => {
  it('proves day-first ordering from a day above twelve', () => {
    const row = ROW.replace('06/03/2026', '20/11/2025')
    const { date_order, date_order_evidence, rows } = transcribed(`${HEADER}\n${row}\n`)

    expect(date_order).toBe('DMY')
    expect(date_order_evidence).toBe('proven')
    expect(rows[0].row_time).toBe('2025-11-20T18:07:34')
  })

  it('assumes month-first when the file cannot say, and says that it assumed', () => {
    const { date_order, date_order_evidence, rows } = transcribed(`${HEADER}\n${ROW}\n`)

    expect(date_order).toBe('MDY')
    expect(date_order_evidence).toBe('assumed')
    // The file's own text is kept beside the reading, which is what makes the guess reversible.
    expect(rows[0].date_verbatim).toBe('06/03/2026 18:07:34')
    expect(rows[0].row_time).toBe('2026-06-03T18:07:34')
  })

  it('is re-read from the stored bytes when the assumption turns out wrong', () => {
    // The correction path the schema exists for: same file, other ordering, no re-upload.
    const { date_order, date_order_evidence, rows } = transcribed(`${HEADER}\n${ROW}\n`, {
      dateOrder: 'DMY',
    })

    expect(date_order).toBe('DMY')
    expect(date_order_evidence).toBe('supplied')
    expect(rows[0].date_verbatim).toBe('06/03/2026 18:07:34')
    expect(rows[0].row_time).toBe('2026-03-06T18:07:34')
  })

  it('is a naive wall clock, so an hour a timezone would move stays where it was written', () => {
    // 02:30 on the second Sunday in March is an hour that does not exist in US Central: a
    // local-time round trip through a Date silently reports 03:30 or 01:30. There is no
    // conversion here to get wrong.
    const row = ROW.replace('06/03/2026 18:07:34', '03/08/2026 02:30:00')
    const { rows } = transcribed(`${HEADER}\n${row}\n`)

    expect(rows[0].row_time).toBe('2026-03-08T02:30:00')
  })
})

describe('a file Layline will not record', () => {
  it('is refused for having no rows, with nothing transcribed', () => {
    const outcome = refused(`${HEADER}\n`)

    expect(outcome.reason).toBe('no-rows')
    expect(outcome.message).toMatch(/no rows/)
  })

  it('is refused for being empty', () => {
    expect(refused('').reason).toBe('no-rows')
  })

  it('is told that its first line is blank, rather than that it is empty', () => {
    // A file with a header and rows is not empty, whatever its first line is. Telling the
    // sailor otherwise sends them looking for a problem that is not there.
    const outcome = refused(`\n${HEADER}\n${ROW}\n`)

    expect(outcome.message).toMatch(/blank/)
    expect(outcome.message).not.toMatch(/empty/)
  })

  it('is refused for having no Date column', () => {
    const header = HEADER.replace('Date;', 'Time;')
    const outcome = refused(`${header}\n${ROW}\n`)

    expect(outcome.reason).toBe('no-date-column')
    expect(outcome.message).toMatch(/Date/)
  })

  it('is refused for having no position column', () => {
    const header = HEADER.replace('Longitude;', '')
    const row = ROW.replace('-87.6123783333;', '')
    const outcome = refused(`${header}\n${row}\n`)

    expect(outcome.reason).toBe('no-position-column')
    expect(outcome.message).toMatch(/Longitude/)
  })

  it('is refused for a Date column that holds something else', () => {
    const row = ROW.replace('06/03/2026 18:07:34', 'Wednesday evening')
    const outcome = refused(`${HEADER}\n${row}\n`)

    expect(outcome.reason).toBe('date-unreadable')
  })

  it('is refused for a date that no ordering makes real, and told which row', () => {
    const row = ROW.replace('06/03/2026', '31/31/2026')
    const outcome = refused(`${HEADER}\n${row}\n`)

    expect(outcome.reason).toBe('date-unreadable')
    expect(outcome.message).toMatch(/row 1/)
    // One row cannot disagree with itself, so this is not the file-level contradiction below.
    expect(outcome.message).not.toMatch(/some rows/)
  })

  it('is refused when its rows disagree about which ordering they use', () => {
    const dayFirst = ROW.replace('06/03/2026', '20/11/2026')
    const monthFirst = ROW.replace('06/03/2026', '11/20/2026')
    const outcome = refused(`${HEADER}\n${dayFirst}\n${monthFirst}\n`)

    expect(outcome.reason).toBe('date-unreadable')
    expect(outcome.message).toMatch(/day-first/)
  })

  it('is refused when a row has more fields than the header names', () => {
    const outcome = refused(`${HEADER}\n${ROW};stowaway\n`)

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/fields/)
  })

  it('is refused when it cannot be reproduced, rather than stored as a copy that is not one', () => {
    // Two decimal forms in one file: whichever separator is sniffed, one of them re-renders
    // as the other. No rule here anticipated this file, and that is the point — the parser
    // checks its own output against the bytes instead of trusting its rules to be complete.
    // The date carries no decimal point of its own, so this is a comma-decimal row and
    // nothing else.
    const commaRow = ROW.replace(/\./g, ',')
    const outcome = refused(`${HEADER}\n${commaRow}\n${commaRow}\n${ROW}\n`)

    expect(outcome.reason).toBe('not-transcribable')
    expect(outcome.message).toMatch(/byte for byte/)
  })
})

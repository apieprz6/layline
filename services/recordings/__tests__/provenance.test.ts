/**
 * The provenance figures a race page states about a recording.
 *
 * Every one of these is a function of rows that cannot change, which is why none of them is a
 * column (ADR 0009). The tests are written over the parser's own output rather than hand-built
 * rows, so a figure that disagrees with a real file fails here.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describeRecording } from '@/services/recordings/provenance'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import type { Transcription } from '@/types'

const HEADER = 'Date;Longitude;Latitude;COG;SOG;STW;ALARM;OBSERVATIONS'

/**
 * One row at a wall-clock time. Position, course and speed move the way a sailing boat's do,
 * so the only flat channels are the two the assertions are about: STW never reported at all,
 * and ALARM the same word throughout.
 */
function row(time: string, seq: number): string {
  const position = `-87.612378${3300 + seq};41.884598${3300 + seq}`
  return `06/03/2026 ${time};${position};${220 + seq}.9;1.${seq};;None;`
}

/** A file of rows at the given times, LF-terminated the way qtVlm writes one. */
function file(times: string[]): string {
  return [HEADER, ...times.map(row), ''].join('\n')
}

function transcribed(text: string): Transcription {
  const outcome = parseQtvlmRecording(text)
  if (!outcome.ok) {
    throw new Error(`expected a Transcription, got ${outcome.reason}: ${outcome.message}`)
  }
  return outcome.transcription
}

/**
 * Thirty-second sampling with a fifty-five-minute hole in the middle of it — the shape a real
 * recording has when the logger was interrupted.
 */
const UNEVEN = transcribed(
  file(['18:00:00', '18:00:30', '18:01:00', '18:56:12', '18:56:42'])
)

describe('what a recording is', () => {
  it('states the column set verbatim and the row count', () => {
    const provenance = describeRecording(UNEVEN)

    expect(provenance.column_set).toEqual(HEADER.split(';'))
    expect(provenance.row_count).toBe(5)
  })

  it('names the channels the boat never fed, under the header names the file used', () => {
    const provenance = describeRecording(UNEVEN)

    // No paddlewheel on this boat. Saying so is the difference between a dead channel and
    // calm water.
    expect(provenance.dead_channels).toEqual(['STW', 'OBSERVATIONS'])
  })

  it('names a channel that carried one value throughout, which is nearly as little', () => {
    const provenance = describeRecording(UNEVEN)

    expect(provenance.constant_channels).toEqual([{ column: 'ALARM', value: 'None' }])
  })

  it('does not count a dead channel as a constant one', () => {
    const provenance = describeRecording(UNEVEN)

    expect(provenance.constant_channels.map((c) => c.column)).not.toContain('STW')
  })
})

describe('how often a recording sampled', () => {
  it('takes the median from the intervals, so one hole does not become the cadence', () => {
    const provenance = describeRecording(UNEVEN)

    expect(provenance.median_cadence_seconds).toBe(30)
  })

  it('reports the hole separately, at its full size', () => {
    const provenance = describeRecording(UNEVEN)

    expect(provenance.largest_gap_seconds).toBe(3312)
    expect(provenance.span_seconds).toBe(3402)
  })

  it('has no cadence to report from a single row, rather than a default one', () => {
    const provenance = describeRecording(transcribed(file(['18:00:00'])))

    expect(provenance.median_cadence_seconds).toBeNull()
    expect(provenance.largest_gap_seconds).toBeNull()
    expect(provenance.span_seconds).toBe(0)
  })

  it('averages the middle two intervals when there is an even number of them', () => {
    const provenance = describeRecording(
      transcribed(file(['18:00:00', '18:00:30', '18:01:20', '18:02:30', '18:04:20']))
    )

    // Intervals of 30, 50, 70 and 110: the middle pair, not the mean of all four.
    expect(provenance.median_cadence_seconds).toBe(60)
  })

  it('is measured over the rows it is given, so a Race Window has its own cadence', () => {
    // The same recording, read inside a window that stops before the hole. Cadence is a
    // property of the rows in hand, which is why nothing here is stored.
    const provenance = describeRecording({
      source_columns: UNEVEN.source_columns,
      rows: UNEVEN.rows.slice(0, 3),
    })

    expect(provenance.row_count).toBe(3)
    expect(provenance.median_cadence_seconds).toBe(30)
    expect(provenance.largest_gap_seconds).toBe(30)
  })
})

describe('a real vendor export', () => {
  const frenchExport = readFileSync(
    join(process.cwd(), 'docs/research/fixtures/qtvlm-vdr-french-locale.csv'),
    'utf8'
  )

  it('is described from its own rows and not from an assumed shape', () => {
    const provenance = describeRecording(transcribed(frenchExport))

    expect(provenance.row_count).toBe(192)
    expect(provenance.median_cadence_seconds).toBe(60)
    expect(provenance.largest_gap_seconds).toBe(60)
    expect(provenance.span_seconds).toBe(10327)
    expect(provenance.dead_channels).toEqual(['OBSERVATIONS'])
  })
})

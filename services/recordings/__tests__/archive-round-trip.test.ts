/**
 * The round trip, over the recordings it is a promise about.
 *
 * LAY-103's central claim is that a Transcription reproduces the file it came from, byte for
 * byte, for the boat's own thirteen seasons-worth of qtVlm exports — and a claim like that is
 * only worth the files it was checked against. Synthetic rows prove the rules; these prove the
 * rules were the right ones.
 *
 * The recordings are the owner's sailing data and are not vendored into this repo, so this
 * suite finds them and skips loudly when it cannot. Point `LAYLINE_ARCHIVE_DIR` at a directory
 * of exports to run it anywhere; otherwise it looks for `Handsome-Pete/raw-regatta-recordings`
 * beside the checkout, which is where they sit on the owner's machine. Everything that has to
 * run in CI is in `qtvlm.test.ts` and `provenance.test.ts`, against the vendored third-party
 * export.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describeRecording } from '@/services/recordings/provenance'
import { parseQtvlmRecording, reassembleTranscription } from '@/services/recordings/qtvlm'
import type { Transcription, TranscriptionChannels } from '@/types'

/** Where the recordings are, or null. */
function findArchive(): string | null {
  const named = process.env.LAYLINE_ARCHIVE_DIR
  if (named) return existsSync(named) ? named : null

  // Up from the checkout — which may be a worktree several levels down — until the sibling
  // repository turns up or the root does.
  let at = process.cwd()
  for (;;) {
    const candidate = join(at, 'Handsome-Pete', 'raw-regatta-recordings')
    if (existsSync(candidate)) return candidate

    const up = dirname(at)
    if (up === at) return null
    at = up
  }
}

const archive = findArchive()
const filenames = archive
  ? readdirSync(archive)
      .filter((name) => name.endsWith('.csv'))
      .sort()
  : []

if (filenames.length === 0) {
  console.warn(
    'Skipping the archive round trip: no qtVlm exports found. Set LAYLINE_ARCHIVE_DIR to a ' +
      'directory of recordings, or check out Handsome-Pete/raw-regatta-recordings beside this repo.'
  )
}

/**
 * The text form Postgres `numeric` gives back. A value outside it would be re-rendered on the
 * way out of the database, and the round trip's bytes would go with it.
 */
const CANONICAL_NUMERIC = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/
const NEGATIVE_ZERO = /^-0(\.0*)?$/

/** The channels stored as `numeric`, which is every one that is not a word. */
const NUMERIC_CHANNELS: (keyof TranscriptionChannels)[] = [
  'longitude',
  'latitude',
  'cog',
  'sog',
  'twd',
  'tws',
  'twa',
  'gwd',
  'gws',
  'ctw',
  'stw',
  'pol',
  'pre',
  'xte',
  'rpm',
  'twa_calc',
  'awa_calc',
  'aws_calc',
]

function bytesOf(filename: string): Buffer {
  return readFileSync(join(archive as string, filename))
}

function transcribe(filename: string): { text: string; transcription: Transcription } {
  const text = bytesOf(filename).toString('utf8')
  const outcome = parseQtvlmRecording(text)
  if (!outcome.ok) {
    throw new Error(`${filename} was refused as ${outcome.reason}: ${outcome.message}`)
  }
  return { text, transcription: outcome.transcription }
}

const describeArchive = filenames.length > 0 ? describe : describe.skip

describeArchive('every recording in the archive', () => {
  it.each(filenames)('%s is reproduced byte for byte from its Transcription', (filename) => {
    const bytes = bytesOf(filename)
    const { text, transcription } = transcribe(filename)

    // Semicolons, LF, `date_verbatim` first, empty for a null — the same recipe the schema
    // migration writes in SQL, arrived at independently.
    const reassembled = Buffer.from(
      reassembleTranscription(transcription, {
        delimiter: transcription.delimiter,
        decimalSeparator: transcription.decimal_separator,
      }),
      'utf8'
    )

    expect(reassembled.equals(bytes)).toBe(true)
    expect(createHash('sha256').update(reassembled).digest('hex')).toBe(
      transcription.content_sha256
    )
    expect(transcription.content_sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(text.endsWith('\n')).toBe(transcription.trailing_newline)
  })

  it.each(filenames)('%s holds only values Postgres numeric gives back unchanged', (filename) => {
    // The hash is over the *stored* transcription, so a value the database would re-render is
    // the one way a passing round trip here could still be a false promise.
    const { transcription } = transcribe(filename)

    for (const row of transcription.rows) {
      for (const channel of NUMERIC_CHANNELS) {
        const value = row[channel]
        if (value === null) continue

        expect(value).toMatch(CANONICAL_NUMERIC)
        // `-0.0` is a real reading in a file and `0.0` on the way back out.
        expect(value).not.toMatch(NEGATIVE_ZERO)
      }
    }
  })

  it.each(filenames)('%s is read month-first, as its own filename says', (filename) => {
    const { transcription } = transcribe(filename)

    expect(transcription.date_order).toBe('MDY')
    expect(['proven', 'assumed']).toContain(transcription.date_order_evidence)
  })
})

describeArchive('how often the archive sampled', () => {
  it('is a different figure per recording, which is why no column holds it', () => {
    const medians = new Set(
      filenames.map(
        (filename) => describeRecording(transcribe(filename).transcription).median_cadence_seconds
      )
    )

    // One stored cadence would be wrong about at least one of these recordings.
    expect(medians.size).toBeGreaterThan(1)
    expect(medians).toContain(30)
  })

  it('includes a recording that sampled at 74 seconds with a 3,352-second hole in it', () => {
    // 06-20-26-chi-wauk: a long race logged on event triggers rather than a timer, and the
    // reason 30 seconds is never assumed. Its median inside a Race Window is 75.
    const chiWauk = filenames.find((name) => name.includes('chi-wauk'))
    if (!chiWauk) {
      console.warn('No chi-wauk recording in this archive; skipping its cadence check.')
      return
    }

    const provenance = describeRecording(transcribe(chiWauk).transcription)

    expect(provenance.median_cadence_seconds).toBe(74)
    expect(provenance.largest_gap_seconds).toBe(3352)
  })
})

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
import type { RecordingProvenance, Transcription } from '@/types'

/** Where the recordings are, or null. */
function findArchive(): string | null {
  const named = process.env.LAYLINE_ARCHIVE_DIR
  if (named) {
    // Someone who set this asked for the round trip to run. Skipping a typo'd path would report
    // all green for the one claim they were trying to check.
    if (!existsSync(named)) {
      throw new Error(`LAYLINE_ARCHIVE_DIR is set to ${named}, which does not exist`)
    }
    return named
  }

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

function bytesOf(filename: string): Buffer {
  return readFileSync(join(archive as string, filename))
}

/**
 * The bytes, not a string: this is the path an upload takes, so the hash is over what Storage
 * holds. A refusal throws, which is the assertion that every one of these files is storable —
 * including that no value in them is a form Postgres `numeric` would give back changed.
 */
function transcribe(filename: string): { bytes: Buffer; transcription: Transcription } {
  const bytes = bytesOf(filename)
  const outcome = parseQtvlmRecording(bytes)
  if (!outcome.ok) {
    throw new Error(`${filename} was refused as ${outcome.reason}: ${outcome.message}`)
  }
  return { bytes, transcription: outcome.transcription }
}

const describeArchive = filenames.length > 0 ? describe : describe.skip

describeArchive('every recording in the archive', () => {
  it.each(filenames)('%s is reproduced byte for byte from its Transcription', (filename) => {
    const { bytes, transcription } = transcribe(filename)

    // Semicolons, LF, `date_verbatim` first, empty for a null — the same recipe the schema
    // migration writes in SQL, arrived at independently.
    const reassembled = Buffer.from(reassembleTranscription(transcription), 'utf8')

    expect(reassembled.equals(bytes)).toBe(true)
    expect(createHash('sha256').update(reassembled).digest('hex')).toBe(
      transcription.content_sha256
    )
    expect(transcription.content_sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(transcription.trailing_newline).toBe(true)
  })

  it.each(filenames)('%s is transcribed to its last row', (filename) => {
    const { bytes, transcription } = transcribe(filename)

    // One row per line after the header, so nothing was skipped on the way in.
    const lines = bytes.toString('utf8').split('\n')
    expect(transcription.row_count).toBe(lines.length - 2)
    expect(transcription.rows[transcription.rows.length - 1].row_index).toBe(
      transcription.row_count
    )
  })

  it.each(filenames)('%s is read month-first, as its own filename says', (filename) => {
    const { transcription } = transcribe(filename)

    expect(transcription.date_order).toBe('MDY')
    expect(['proven', 'assumed']).toContain(transcription.date_order_evidence)
  })
})

describeArchive('how often the archive sampled', () => {
  const provenances: RecordingProvenance[] = filenames.map((filename) =>
    describeRecording(transcribe(filename).transcription)
  )

  it('is a different figure per recording, which is why no column holds it', () => {
    const medians = new Set(provenances.map((p) => p.median_cadence_seconds))

    // One stored cadence would be wrong about at least one of these recordings.
    expect(medians.size).toBeGreaterThan(1)
    expect(medians).toContain(30)
  })

  it('includes a recording that sampled well slower than 30 seconds', () => {
    // 06-20-26-chi-wauk is the one: 258 rows at a median of 74 seconds, logged on event
    // triggers rather than a timer. Asserted as a shape rather than a filename so the claim
    // still means something when the archive grows another season.
    const slowest = Math.max(...provenances.map((p) => p.median_cadence_seconds ?? 0))

    expect(slowest).toBeGreaterThan(60)
  })

  it('includes a recording with an hour-long hole in it', () => {
    // The same file: a 3,352-second gap where nothing was logged. A cadence taken as a mean
    // rather than a median would swallow this, and a race page would state a sampling rate
    // the boat never sampled at.
    const largest = Math.max(...provenances.map((p) => p.largest_gap_seconds ?? 0))

    expect(largest).toBeGreaterThan(3000)
  })

  it('never has a clock that went backwards, so none of these figures were salvaged', () => {
    // Thirteen seasons of Lake Michigan racing and no autumn fall-back mid-recording. Worth
    // stating: it means every median above came from intervals, not from a filtered subset.
    expect(provenances.map((p) => p.backwards_steps)).toEqual(filenames.map(() => 0))
  })
})

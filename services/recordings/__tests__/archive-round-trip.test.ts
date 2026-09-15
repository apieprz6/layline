/**
 * The round trip, over the recordings it is a promise about.
 *
 * LAY-103's central claim is that a Transcription reproduces the file it came from, byte for
 * byte, for the boat's own thirteen seasons-worth of qtVlm exports — and a claim like that is
 * only worth the files it was checked against. Synthetic rows prove the rules; these prove the
 * rules were the right ones.
 *
 * The recordings are the owner's sailing data and are not vendored into this repo, so this
 * suite finds them through `archive.ts` and skips loudly when it cannot. Everything that has to
 * run in CI is in `qtvlm.test.ts` and `provenance.test.ts`, against the vendored third-party
 * export.
 */

import { createHash } from 'node:crypto'

import {
  archiveFilenames as filenames,
  describeArchive,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { describeRecording } from '@/services/recordings/provenance'
import { reassembleTranscription } from '@/services/recordings/qtvlm'
import type { RecordingProvenance } from '@/types'

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

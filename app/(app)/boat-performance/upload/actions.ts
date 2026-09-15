'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import {
  BOAT_BUCKET,
  recordingObjectPath,
  tmpUploadObjectPath,
} from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'
import { raceChartSeries } from '@/services/recordings/chart-series'
import { recordingFindings } from '@/services/recordings/coverage'
import { describeRecording } from '@/services/recordings/provenance'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { raceWindowSeconds, refuseRaceWindow } from '@/services/recordings/race-window'
import { assessRowQuality } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  StageRecordingResult,
  SubmitRaceInput,
  SubmitRaceResult,
  Transcription,
} from '@/types'

/**
 * The two writes the upload wizard makes, and the order they happen in.
 *
 * `stageRecording` parses the file and parks its bytes under `tmp/`. `submitRace` moves those bytes
 * to their permanent path and *then* writes three tables in one transaction. That order is ADR 0013:
 * the permanent path contains the Recording's id, so the id is minted here rather than by a column
 * default, and a failure after the move leaves orphaned bytes — which a cleanup can sweep — instead
 * of a row pointing at a file that was never written, which nothing can repair because a
 * Transcription is immutable.
 *
 * **Nothing between the two touches the database.** A wizard abandoned at any step leaves exactly one
 * `tmp/` object and no row, which is what lets the sailor close the tab without consequence.
 *
 * Both are Server Actions and therefore public endpoints, so both re-check the Role from the
 * Profile. RLS refuses the same writes a second time; that is the authority, and these checks exist
 * to answer a non-admin with a sentence rather than a database error.
 */

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The upload could not be completed. Try again.'

const ONLY_ADMIN = 'Only an admin can upload a race.'

/**
 * The largest file this will read into memory.
 *
 * The archive's biggest export is 6,337 rows and about 1.4 MB, so this is roughly an order of
 * magnitude of headroom. It exists because the parse holds the whole file and its Transcription at
 * once, and an accidental upload of something enormous should be refused rather than paged.
 */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

/**
 * Parse a qtVlm export, park its bytes, and hand back what the charts need.
 *
 * The parse comes first, so an unparseable file is refused before anything is stored — one of ADR
 * 0009's only two hard refusals, and the reason it is worth spending the round trip on.
 *
 * What comes back is a projection, never a Transcription: the rows stay on the server. Six thousand
 * rows of 21 text channels would be several megabytes of JSON to send a browser that only ever draws
 * four channels and a track, and submit re-parses the file anyway.
 */
export async function stageRecording(formData: FormData): Promise<StageRecordingResult> {
  const account = await resolveAccount()

  if (!account || !canWrite(account)) {
    return { ok: false, message: ONLY_ADMIN }
  }

  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a qtVlm CSV export to upload.' }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That file is ${Math.round(file.size / 1024 / 1024)} MB. A qtVlm export of a race is a couple of megabytes, so this is almost certainly the wrong file.`,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const outcome = parseQtvlmRecording(bytes)

  // The refusal's own message names what is wrong with the file, which is more use than anything
  // this layer could say about it.
  if (!outcome.ok) return { ok: false, message: outcome.message }

  const transcription = outcome.transcription

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Race upload: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  const duplicates = await duplicateFilenames(supabase, transcription.content_sha256)

  const upload_id = randomUUID()
  const recording_id = randomUUID()
  const tmp_path = tmpUploadObjectPath(account.userId, upload_id, file.name)

  const { error: uploadError } = await supabase.storage
    .from(BOAT_BUCKET)
    .upload(tmp_path, bytes, {
      // The sailor's own bytes, verbatim. `upsert: false` because `upload_id` is fresh, so an
      // object already there would mean a collision worth hearing about.
      contentType: 'text/csv',
      upsert: false,
    })

  if (uploadError) {
    console.error('Race upload: staging to tmp/ failed:', uploadError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  const quality = assessRowQuality(transcription.rows)

  return {
    ok: true,
    staged: {
      upload_id,
      recording_id,
      filename: file.name,
      content_sha256: transcription.content_sha256,
      series: raceChartSeries(transcription, quality),
      findings: recordingFindings({
        provenance: describeRecording(transcription),
        quality,
        date_order_evidence: transcription.date_order_evidence,
        duplicate_filenames: duplicates,
      }),
    },
  }
}

/**
 * Write the Recording, its Transcription and the Race — after the bytes have moved.
 *
 * Everything is re-derived here from the bytes in `tmp/`. The window and the title are the only
 * things the client is trusted for, because they are the only things the sailor authored; the rows,
 * the times and the header come from a fresh parse of a file whose hash is checked first. A Server
 * Action is a public endpoint, and a Transcription is immutable, so "the bytes that were charted are
 * the bytes that get written" has to be a check rather than an assumption.
 */
export async function submitRace(input: SubmitRaceInput): Promise<SubmitRaceResult> {
  const account = await resolveAccount()

  if (!account || !canWrite(account)) {
    return { ok: false, message: ONLY_ADMIN }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Race upload: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  // Derived, never taken from the request: the path is a function of who is signed in and which
  // attempt this is, so a crafted `tmp_path` cannot reach another prefix.
  const tmpPath = tmpUploadObjectPath(account.userId, input.upload_id, input.filename)

  const { data: blob, error: downloadError } = await supabase.storage
    .from(BOAT_BUCKET)
    .download(tmpPath)

  if (downloadError || !blob) {
    console.error(
      'Race upload: the staged bytes are gone:',
      downloadError?.message ?? 'no object at the staged path'
    )
    return {
      ok: false,
      message: 'The uploaded file is no longer where it was put. Start the upload again.',
    }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')

  if (digest !== input.content_sha256) {
    console.error('Race upload: the staged bytes are not the bytes that were charted')
    return {
      ok: false,
      message:
        'The file in storage is not the one that was charted, so nothing has been saved. Start the ' +
        'upload again.',
    }
  }

  // The same bytes with the same options give the same Transcription — the parse takes nothing from
  // the environment and nothing from the clock — so re-parsing costs a second of CPU and buys not
  // having to trust a browser with 21 channels of a file it never sent.
  const outcome = parseQtvlmRecording(bytes)

  if (!outcome.ok) {
    console.error('Race upload: the staged file no longer parses:', outcome.message)
    return { ok: false, message: UNAVAILABLE }
  }

  const transcription = outcome.transcription
  const refusal = windowRefusal(transcription, input)

  if (refusal) return { ok: false, message: refusal }

  const duplicates = await duplicateFilenames(supabase, transcription.content_sha256)

  if (duplicates.length > 0) {
    // The wizard already asked, and this asks again for the same reason the Role is checked again: a
    // Server Action is a public endpoint, so a confirmation that only ever existed in a checkbox is
    // a confirmation anything else can skip.
    if (!input.duplicate_acknowledged) {
      return {
        ok: false,
        message:
          `These bytes are already in the archive as ${duplicates.join(', ')}. Say that this really ` +
          'is a second race from the same log, then save again.',
      }
    }

    // ADR 0009: a confirmation proceeds *and the fact that it proceeded is recorded*. The log is
    // where that lives for now — the archive keeps the hash, so the pair can always be found again.
    console.info(
      `Race upload: ${account.userId} confirmed ${input.filename} is a second race from the same ` +
        `log as ${duplicates.join(', ')} (sha256 ${transcription.content_sha256})`
    )
  }

  // The move, before the transaction. From here on a failure leaves bytes with no row, which is the
  // trade ADR 0013 makes deliberately: bytes can be swept, and an immutable Transcription that was
  // written against a file nobody kept cannot be.
  const permanentPath = recordingObjectPath(input.recording_id, input.filename)
  const { error: moveError } = await supabase.storage
    .from(BOAT_BUCKET)
    .move(tmpPath, permanentPath)

  if (moveError) {
    console.error('Race upload: moving the bytes out of tmp/ failed:', moveError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  const { data: raceId, error: rpcError } = await supabase.rpc('create_race_from_upload', {
    p_recording: {
      id: input.recording_id,
      filename: input.filename,
      content_sha256: transcription.content_sha256,
      source_columns: transcription.source_columns,
      date_order: transcription.date_order,
      trailing_newline: transcription.trailing_newline,
      row_count: transcription.row_count,
      first_row_time: transcription.first_row_time,
      last_row_time: transcription.last_row_time,
    },
    // The Transcription's own shape: every channel text, exactly as the file wrote it. The function
    // casts to NUMERIC on the way in, which is what makes the round trip byte for byte.
    p_rows: transcription.rows,
    p_race: {
      title: input.title,
      window_start: input.window_start,
      window_finish: input.window_finish,
    },
  })

  if (rpcError || typeof raceId !== 'string') {
    // The bytes are already at their permanent path and there is no row pointing at them. Logged
    // with the path so a sweep has something to go on.
    console.error(
      `Race upload: the transaction failed with bytes already at ${permanentPath}:`,
      rpcError?.message ?? 'no race id returned'
    )
    return {
      ok: false,
      message:
        'The race could not be saved and nothing was written to the archive. The file has already ' +
        'been moved out of its staging area, so choose it again to start over.',
    }
  }

  revalidatePath('/boat-performance')

  return { ok: true, race_id: raceId }
}

/**
 * Recordings already in the archive with these same bytes, by name.
 *
 * A duplicate hash warns and proceeds — one Recording can legitimately back a second Race, and
 * `recordings_content_sha256_idx` is deliberately not unique (ADR 0009, ADR 0010). Named files
 * rather than a count, because "the same as 08-22-26-glr.csv" is what makes it recognisable.
 *
 * A failed lookup comes back empty. Refusing would be wrong — the file is fine — and the alternative
 * to an empty answer is a sentence about the archive that this cannot stand behind.
 */
async function duplicateFilenames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contentSha256: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select('filename')
    .eq('content_sha256', contentSha256)
    .returns<{ filename: string }[]>()

  if (error) {
    console.error('Race upload: duplicate check failed:', error.message)
    return []
  }

  return (data ?? []).map((row) => row.filename)
}

/**
 * The window's two refusals, re-asked on the server against the file's own rows.
 *
 * The wizard already refuses both and the database refuses both again — `races_window_ordered` and
 * the deferred `races_window_intersects_rows` trigger. This middle one exists so the sailor gets the
 * sentence written for them in `race-window.ts` instead of a constraint name, and so a request that
 * did not come from the wizard is answered the same way.
 */
function windowRefusal(transcription: Transcription, input: SubmitRaceInput): string | null {
  let window: ReturnType<typeof raceWindowSeconds>

  try {
    window = raceWindowSeconds({
      window_start: input.window_start,
      window_finish: input.window_finish,
    })
  } catch {
    return 'Those are not two times in this recording’s own clock. Set the window again.'
  }

  const rowSeconds = transcription.rows.map((row) => wallClockSeconds(row.row_time))

  return refuseRaceWindow(window, rowSeconds)?.message ?? null
}

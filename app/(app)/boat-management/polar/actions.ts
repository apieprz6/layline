'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, boatSetupObjectPath } from '@/lib/storage/paths'
import { isCalendarDate } from '@/lib/utils/calendarDate'
import { createClient } from '@/lib/supabase/server'
import { parsePolarFile } from '@/services/boat/polarFile'
import { nextBoatSetupVersionNumber } from '@/services/boat/nextBoatSetupVersionNumber'
import { validatePolarPayload, type ValidPolarPayload } from '@/services/boat/polarPayload'
import { readBoatSetupUpload, type BoatSetupUpload } from '@/services/boat/readBoatSetupUpload'
import { polarSuppression } from '@/services/boat/polarSyntheticRows'
import type { PolarParseWarning, PolarUploadPreview } from '@/types'

/**
 * Uploading a **Polar** — the two-step confirm, and the write.
 *
 * Step one, `previewPolarUpload`, parses the dropped file and hands back the grid, everything
 * tolerated on the way in, and which angles are the file's own filler. Nothing is written and
 * nothing reaches Storage.
 *
 * Step two, `commitPolarVersion`, is given the same file again and re-parses it. The client's
 * copy of the grid is never trusted: a Server Action is a public endpoint, so the parse is the
 * gate and the gate is on the server, twice (ADR 0009). The file's own SHA-256 travels with the
 * confirm so that what is committed is provably the file that was shown.
 *
 * The order of the write is ADR 0013's, and it is the whole reason the version id is minted here
 * rather than by a DEFAULT: the bytes go to their permanent path
 * `boat-setup/polar/{version_id}/{filename}` **before** the transaction commits. A failure after
 * the upload leaves bytes nothing points at — which is exactly the trade the ADR chose, because
 * an orphaned object is invisible and sweepable while an orphaned row is a Version of the boat's
 * polar that no file backs.
 *
 * Reading the dropped file — its bytes, its text and its hash — is `readBoatSetupUpload`'s, shared
 * with the Crossover Chart, and so is the reasoning about why nothing checks its MIME type.
 */

export type PreviewPolarUploadResult =
  | { ok: true; preview: PolarUploadPreview }
  | { ok: false; message: string }

export type CommitPolarVersionResult =
  | { ok: true; version_id: string; version_number: number }
  | { ok: false; message: string }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The Polar could not be saved. Try again.'

const NOT_ADMIN = 'Only an admin can upload a Polar.'

const NO_FILE = 'Choose a polar file to upload.'

function readUpload(formData: FormData): Promise<BoatSetupUpload | { message: string }> {
  return readBoatSetupUpload(formData, 'file', {
    missing: NO_FILE,
    tooLarge: 'A polar is a few kilobytes;',
  })
}

/** Parse and validate, giving back either the grid or the sentence to show the admin. */
function readGrid(
  text: string
): { payload: ValidPolarPayload; warnings: PolarParseWarning[] } | { message: string } {
  const parsed = parsePolarFile(text)

  if (!parsed.ok) {
    const where = parsed.line === undefined ? '' : ` (line ${parsed.line})`
    return { message: `That file could not be read as a polar${where}: ${parsed.message}` }
  }

  const validated = validatePolarPayload(parsed.payload)

  // The parser's own rules are stricter than the schema's, so this is the belt to its braces:
  // it is what stands between the database and a payload assembled by anything else.
  if (!validated.ok) {
    console.error('Polar upload: parsed grid failed the payload schema:', validated.issues.join('; '))
    return { message: `That file parsed but is not a usable grid: ${validated.issues[0]}` }
  }

  return { payload: validated.payload, warnings: parsed.warnings }
}

/**
 * Step one: read the dropped file and show the admin what it says. Writes nothing.
 */
export async function previewPolarUpload(formData: FormData): Promise<PreviewPolarUploadResult> {
  const account = await resolveAccount()

  // The panel is only rendered for an admin, but that is a courtesy and not the check.
  if (!canWrite(account)) return { ok: false, message: NOT_ADMIN }

  const upload = await readUpload(formData)
  if ('message' in upload) return { ok: false, message: upload.message }

  const grid = readGrid(upload.text)
  if ('message' in grid) return { ok: false, message: grid.message }

  return {
    ok: true,
    preview: {
      filename: upload.filename,
      byte_length: upload.bytes.byteLength,
      content_sha256: upload.content_sha256,
      payload: grid.payload,
      warnings: grid.warnings,
      suppression: polarSuppression(grid.payload),
      next_version_number: await nextVersionNumber(),
    },
  }
}

/**
 * Step two: commit the file the admin confirmed as the next Version.
 *
 * Expects the file again, the calendar date it takes effect, an optional note, and the SHA-256
 * the preview showed.
 */
export async function commitPolarVersion(formData: FormData): Promise<CommitPolarVersionResult> {
  const account = await resolveAccount()

  if (!canWrite(account)) return { ok: false, message: NOT_ADMIN }

  const effectiveFrom = (formData.get('effective_from') ?? '').toString().trim()

  // A Version's own date, not the upload's: the sailor says when this polar took effect, and
  // there is no default that would not be a guess. `recorded_at` is when Layline was told.
  if (!isCalendarDate(effectiveFrom)) {
    return { ok: false, message: 'Say which date this Polar took effect.' }
  }

  // Trimmed, because the surrounding whitespace is an artefact of typing. A blank note becomes
  // no note at all, in the database as well as here.
  const note = (formData.get('note') ?? '').toString().trim()

  const upload = await readUpload(formData)
  if ('message' in upload) return { ok: false, message: upload.message }

  const confirmed = (formData.get('content_sha256') ?? '').toString().trim()

  // The confirm is of a particular file, and saying so is not optional: a confirm that carries
  // no hash has not been through a preview, and one that carries the wrong hash approved a grid
  // these bytes are not. Either way it goes back through the preview rather than through.
  if (confirmed !== upload.content_sha256) {
    return {
      ok: false,
      message:
        confirmed === ''
          ? 'Check the grid before saving it: this confirm carried no checksum for the file.'
          : 'The file changed after it was previewed. Drop it again and check the grid.',
    }
  }

  // Re-parsed on the server. The client sent a payload with the preview and it is not read here:
  // the file is the source, every time.
  const grid = readGrid(upload.text)
  if ('message' in grid) return { ok: false, message: grid.message }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Polar upload: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  // Minted here because the permanent path contains it and the bytes move before the commit.
  const versionId = randomUUID()

  let objectPath: string

  try {
    objectPath = boatSetupObjectPath('polar', versionId, upload.filename)
  } catch (thrown: unknown) {
    // `storageSafeFilename` refuses a name with nothing storable left in it — `..`, or a name
    // made entirely of characters a Storage key may not carry. A browser will not send one, but
    // a Server Action is a public endpoint and the filename is the caller's to choose.
    console.error(
      'Polar upload: the filename yields no Storage path:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return {
      ok: false,
      message: 'That file needs a name Layline can store it under. Rename it and drop it again.',
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(BOAT_BUCKET)
    .upload(objectPath, upload.bytes, {
      // The bytes verbatim. `upsert: false` because the path contains a fresh uuid, so an
      // existing object at it would mean something has gone very wrong.
      upsert: false,
      contentType: 'text/plain; charset=utf-8',
    })

  if (uploadError) {
    console.error('Polar upload: bytes were refused:', uploadError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  const { data: versionNumber, error: mintError } = await supabase.rpc(
    'mint_boat_setup_version',
    {
      p_version_id: versionId,
      p_kind: 'polar',
      p_effective_from: effectiveFrom,
      p_payload: grid.payload,
      p_note: note === '' ? null : note,
      // Verbatim, so nothing has to parse the Storage path to recover it.
      p_filename: upload.filename,
      p_content_sha256: upload.content_sha256,
    }
  )

  if (mintError || typeof versionNumber !== 'number') {
    // The bytes are already at their permanent path and are left there: ADR 0013 takes orphaned
    // bytes over orphaned rows, and deleting them here would risk deleting the file of a Version
    // that did commit and whose response was lost.
    console.error('Polar upload: the Version was not written:', mintError?.message ?? 'no version number')
    return { ok: false, message: UNAVAILABLE }
  }

  revalidatePath('/boat-management/polar')
  // The Boat management list states which Version is in force, so it is stale now too.
  revalidatePath('/boat-management')

  return { ok: true, version_id: versionId, version_number: versionNumber }
}

/** What the next Version would be numbered, for the confirm button to say. Advisory only. */
function nextVersionNumber(): Promise<number> {
  return nextBoatSetupVersionNumber({ kind: 'polar', label: 'Polar' })
}

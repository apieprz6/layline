'use server'

import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, recordingObjectPath } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'
import type { DeleteRaceResult } from '@/types'

/**
 * Deleting a race: one statement, then the bytes.
 *
 * The delete is expressed against the **Recording** and not against the Race, because the foreign
 * key runs the other way — the Race is the child — so `DELETE FROM recordings WHERE id = $1` takes
 * the Race, both annotation tables, the sail join rows and every Recording Row in one statement.
 * That is correct precisely because `races.recording_id` is `UNIQUE`: there is no second Race left
 * pointing at a Recording that has gone.
 *
 * The transaction commits **first** and the object is removed **second** (ADR 0013). It is the
 * mirror image of the upload, and for the same reason: bytes with no row are invisible, harmless and
 * sweepable, while a row with no bytes is a race that lists, opens, renders its coverage and then
 * fails whenever anything asks for its source file — and its Transcription is immutable, so there is
 * no repairing it.
 *
 * There is no undo, and there is no soft delete either. A Transcription is immutable and a Race is
 * the sailor's own Testimony over it; re-creating one means re-uploading the file and re-typing every
 * annotation. The confirmation on the screen is the only guard, which is proportionate for a
 * single-admin tool.
 */

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The race could not be deleted. Try again.'

const ONLY_ADMIN = 'Only an admin can delete a race.'

/** Both a race that never existed and a race this account may not read. Deliberately one answer. */
const NO_SUCH_RACE = 'That race is not in the archive.'

export async function deleteRace(raceId: string): Promise<DeleteRaceResult> {
  const account = await resolveAccount()

  // A Server Action is a public endpoint, so the Role is asked for again here. RLS refuses the same
  // delete a second time and is the authority; this is what turns the refusal into a sentence.
  if (!account || !canWrite(account)) {
    return { ok: false, message: ONLY_ADMIN }
  }

  // Asked before the query rather than left to the database: `id=eq.not-a-uuid` is a 22P02 that
  // would read here as a fault in the archive for what is only a stale link.
  if (!isUuid(raceId)) {
    return { ok: false, message: NO_SUCH_RACE }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Race delete: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  // The Recording's id and its verbatim filename, which are the two things the derived Storage path
  // is made of. Read before the delete, because after it there is nothing left to read them from.
  const { data: race, error: readError } = await supabase
    .from('races')
    .select('id, recordings!inner(id, filename)')
    .eq('id', raceId)
    .maybeSingle<{ id: string; recordings: { id: string; filename: string } }>()

  if (readError) {
    console.error('Race delete: read failed:', readError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  if (!race) return { ok: false, message: NO_SUCH_RACE }

  const recordingId = race.recordings.id

  const { data: deleted, error: deleteError } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId)
    // The deleted rows come back, which is the only way to tell a commit from a refusal: RLS filters
    // a DELETE rather than raising on it, so an account without the write policy gets a perfectly
    // successful response that removed nothing at all.
    .select('id')

  if (deleteError) {
    console.error('Race delete: the transaction failed:', deleteError.message)
    return { ok: false, message: UNAVAILABLE }
  }

  if (!deleted || deleted.length === 0) {
    // Nothing was deleted and nothing complained: the row-level policy declined it.
    return { ok: false, message: ONLY_ADMIN }
  }

  const path = recordingObjectPath(recordingId, race.recordings.filename)

  // Past the commit. From here a failure leaves orphaned bytes, which is the trade ADR 0013 makes.
  const { data: removed, error: removeError } = await supabase.storage
    .from(BOAT_BUCKET)
    .remove([path])

  revalidatePath('/boat-performance')

  if (removeError || !removed || removed.length === 0) {
    // Logged with the path so a sweep has something to go on. Not an error to the sailor: the race
    // is gone, which is what they asked for.
    console.error(
      `Race delete: the row is gone and ${path} is still there:`,
      removeError?.message ?? 'no object was removed'
    )
    return { ok: true, bytes_removed: false }
  }

  return { ok: true, bytes_removed: true }
}

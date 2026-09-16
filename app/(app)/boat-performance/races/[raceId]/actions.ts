'use server'

import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, recordingObjectPath } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'
import { refuseAnnotations } from '@/services/races/annotations'
import { readRecordingRowTimes } from '@/services/races/recording-rows'
import { chartDefinitionNumbers, raceWindowRefusal } from '@/services/races/write-checks'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { AmendRaceInput, AmendRaceResult, DeleteRaceResult } from '@/types'

/**
 * Deleting a race: one statement, then the bytes.
 *
 * The delete is expressed against the **Recording** and not against the Race, because the foreign
 * key runs the other way — the Race is the child — so `DELETE FROM recordings WHERE id = $1` takes
 * the Race, both annotation tables and every Recording Row in one statement. That is correct
 * precisely because `races.recording_id` is `UNIQUE`: there is no second Race left pointing at a
 * Recording that has gone.
 *
 * It stops there. A Sail Configuration names a Sail Definition of a Crossover Chart Version
 * (ADR 0023) with `ON DELETE RESTRICT`, so the cascade cannot reach the chart's vocabulary: the words
 * a deleted race was stated in are still the words every other race is stated in.
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

/** The same two for the amendment, in its own words: what failed is what the sailor was doing. */
const UNAVAILABLE_AMEND_RACE =
  'The amendment could not be saved, and nothing about this race was changed. Try again.'

const ONLY_ADMIN_AMEND_RACE = 'Only an admin can amend a race.'

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

/**
 * The whole amendment: the title, the window, the five Boat Setup answers and both lists of Testimony.
 *
 * One action because it is one save (ADR 0010 Amendment 1). The flow it serves is the upload flow with
 * its File step absent, and the sections in it are a set rather than a sequence — so there is no order
 * to commit them in, and a sailor who moved the start two minutes later and took off the sail change
 * that is now on the wrong side of it has corrected *one* thing. Two calls could half-apply that, and a
 * half-applied correction is a race that never happened.
 *
 * Both annotation lists always travel whole and always replace what is stored. That is the only shape
 * that lets an entry be taken off at all, and it is why `readRaceAmendment` refuses to hand the flow a
 * list it could not read: an empty list from a failed read, saved, is deleted Testimony.
 *
 * What this cannot reach: the Recording, its rows, and its bytes. There is no parameter here for any of
 * them, `amend_race` names neither table, and nothing in this function touches Storage. The
 * Transcription is what the file said; an amendment is what the sailor said about it (ADR 0010).
 *
 * Nothing is recomputed afterwards either. Row Quality, Coverage and Gap Seconds are derived at read
 * (ADR 0009), so a moved window re-derives all three the next time the race is opened, from rows that
 * never moved and from timestamps this never rewrites.
 *
 * The two window refusals are asked here by `raceWindowRefusal` — the same function the upload action
 * asks, over the recording's own row times — so the rule cannot be laxer through this door. The
 * database refuses both again and is the authority.
 */
export async function amendRace(input: AmendRaceInput): Promise<AmendRaceResult> {
  const account = await resolveAccount()

  // Asked again here, as everywhere: a Server Action is a public endpoint, and the flow's decision not
  // to show a Save is not a decision about who may call this.
  if (!account || !canWrite(account)) {
    return { ok: false, message: ONLY_ADMIN_AMEND_RACE }
  }

  if (!isUuid(input.race_id)) {
    return { ok: false, message: NO_SUCH_RACE }
  }

  // Every pointer is optional and every one that is present must be a uuid, checked before the call
  // because a malformed one is a 22P02 out of a cast inside the function.
  const ids = [
    input.polar_version_id,
    input.crossover_chart_version_id,
    input.rig_tune_version_id,
    input.instrument_calibration_version_id,
    input.rig_tune_band_id,
  ]

  if (ids.some((id) => id !== null && !isUuid(id))) {
    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Race amend: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  // The Recording's id and row count: the two things the window check needs, and the only two things
  // about a recording this action reads at all.
  const { data: race, error: readError } = await supabase
    .from('races')
    .select('id, recordings!inner(id, row_count)')
    .eq('id', input.race_id)
    .maybeSingle<{ id: string; recordings: { id: string; row_count: number } }>()

  if (readError) {
    console.error('Race amend: read failed:', readError.message)
    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  if (!race) return { ok: false, message: NO_SUCH_RACE }

  const rowTimes = await readRecordingRowTimes(
    supabase,
    race.recordings.id,
    race.recordings.row_count
  )

  // A window cannot be checked against rows nobody could read, and an unchecked window is how a race
  // ends up scored over a stretch of recording holding nothing.
  if (!rowTimes) return { ok: false, message: UNAVAILABLE_AMEND_RACE }

  let rowSeconds: number[]

  try {
    rowSeconds = rowTimes.map((time) => wallClockSeconds(time))
  } catch (thrown: unknown) {
    // A stored stamp the wall clock refuses, which is a fault in the archive rather than in the
    // amendment — but it still leaves the window uncheckable, so it is still a refusal.
    console.error(
      'Race amend: a recorded time is not a naive wall-clock stamp:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  const refusal = raceWindowRefusal(input, rowSeconds)

  // The failure a sailor is expected to meet and fix: move a handle, save again. Word for word the
  // sentence they would have met uploading, because it is the same function saying it.
  if (refusal) return { ok: false, message: refusal }

  // Asked whenever a chart Version is named and not only when a sail names it: the pointer is itself a
  // foreign key inside the transaction, and a race that records no sails still carries it.
  const vocabulary = await chartDefinitionNumbers(supabase, input.crossover_chart_version_id)

  if (vocabulary.state === 'unknown') {
    // Said about the Version rather than about the sails, which would otherwise be refused one at a
    // time for not being in a vocabulary that could not be found at all.
    return {
      ok: false,
      message:
        'That Crossover Chart Version is not one this archive holds. Choose the chart again on the ' +
        'Sails section, then save.',
    }
  }

  // A failed read says nothing about the pointer either way, so it is only fatal where a sail depends
  // on it. A race that names no sails is a legal race, and the flow told the sailor as much.
  if (vocabulary.state === 'unreadable' && input.sails.length > 0) {
    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  const annotationRefusal = refuseAnnotations(
    input.sails,
    input.sea_state,
    vocabulary.state === 'known' ? vocabulary.numbers : null
  )

  if (annotationRefusal) {
    return { ok: false, message: annotationRefusal }
  }

  const { error: rpcError } = await supabase.rpc('amend_race', {
    p_race_id: input.race_id,
    p_race: {
      title: input.title,
      window_start: input.window_start,
      window_finish: input.window_finish,
    },
    // All five written out rather than spread, so this list is the one `amend_race_boat_setup` checks
    // for and a field renamed on the input cannot quietly go missing from the payload — which would
    // read there as "the sailor set this one back to not recorded".
    p_setup: {
      polar_version_id: input.polar_version_id,
      crossover_chart_version_id: input.crossover_chart_version_id,
      rig_tune_version_id: input.rig_tune_version_id,
      instrument_calibration_version_id: input.instrument_calibration_version_id,
      rig_tune_band_id: input.rig_tune_band_id,
    },
    // Testimony as the sailor now tells it, whole. Two empty lists are a legal race whose page says
    // neither kind was recorded (ADR 0010), so nothing here substitutes anything for either.
    p_sails: input.sails,
    p_sea_state: input.sea_state,
  })

  if (rpcError) {
    console.error('Race amend: the transaction failed:', rpcError.message)

    // The one refusal worth its own sentence, and the one the function's own lock answers with.
    if (rpcError.code === '42501') {
      return { ok: false, message: ONLY_ADMIN_AMEND_RACE }
    }

    return { ok: false, message: UNAVAILABLE_AMEND_RACE }
  }

  // Both pages, because both show something an amendment can change: the race's own shows all of it,
  // and the list states the title and the window.
  revalidatePath(`/boat-performance/races/${input.race_id}`)
  revalidatePath('/boat-performance')

  return { ok: true }
}

'use server'

import { revalidatePath } from 'next/cache'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { canWrite } from '@/lib/account/canWrite'
import { createClient } from '@/lib/supabase/server'
import { buildRigTuneVersionInput } from '@/lib/boat/rigTune'
import type { RigTuneDraft, RigTuneProblem } from '@/types'

/**
 * Minting a Rig Tune Version — the whole band table, in one act.
 *
 * There is no per-band save and no partial save (ADR 0007): a rig is set from a table of
 * bands read together, so half a table is not a tune anybody could set a boat to. The three
 * writes a Version needs — the Version row, its bands, the artifact's current pointer — go
 * through `mint_rig_tune_version`, because supabase-js has no transaction to wrap them in.
 */

export type SaveRigTuneResult =
  | { ok: true }
  | { ok: false; message: string; problems: RigTuneProblem[] }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The tune could not be saved. Try again.'

/** What they are told when it is theirs, and the problems say where. */
const HAS_PROBLEMS = 'This tune is not ready to save.'

function refuse(message: string, problems: RigTuneProblem[] = []): SaveRigTuneResult {
  return { ok: false, message, problems }
}

/**
 * A Server Action is a public endpoint, so the admin check is made here from the **Profile**
 * — the editor not rendering for a viewer is a courtesy, not the check. RLS refuses the same
 * write a third time, which is why a refused mint is reported rather than assumed impossible.
 *
 * Refusals are returned rather than thrown, so the editor can put each one beside the band
 * that caused it and keep everything that was typed.
 */
export async function saveRigTuneVersion(draft: RigTuneDraft): Promise<SaveRigTuneResult> {
  const account = await resolveAccount()

  if (!canWrite(account)) {
    return refuse('Only an admin can record a Rig Tune.')
  }

  // Validated before anything is written, and validated whole: contiguity is a property of
  // the table, not of any one band, so there is nothing worth sending until it holds.
  const built = buildRigTuneVersionInput(draft)

  if (!built.ok) {
    return refuse(HAS_PROBLEMS, built.problems)
  }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Rig Tune: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return refuse(UNAVAILABLE)
  }

  // No artifact id is passed: the function locks the one `rig_tune` row itself and allocates
  // `version_number` under that lock, so nothing here can name a Version or an artifact the
  // caller chose. `created_by` comes from the JWT for the same reason.
  const { error } = await supabase.rpc('mint_rig_tune_version', {
    p_effective_from: built.input.effective_from,
    p_note: built.input.note,
    p_bands: built.input.bands,
  })

  if (error) {
    console.error('Rig Tune: mint failed:', error.message)
    return refuse(UNAVAILABLE)
  }

  revalidatePath('/boat-management/rig-tune')
  // The list the sailor came from names the Version in force on its Rig Tune row, so it is
  // now showing a superseded one.
  revalidatePath('/boat-management')
  return { ok: true }
}

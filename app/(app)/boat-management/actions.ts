'use server'

import { revalidatePath } from 'next/cache'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { canWrite } from '@/lib/account/canWrite'
import { createClient } from '@/lib/supabase/server'

/**
 * Editing the boat's identity — its name and its model.
 *
 * The Boat management header *is* the boat's identity, so this is the one write on
 * that screen. It lives here rather than in Settings because no signed-out screen
 * may name the boat, and identity therefore cannot live in the chrome.
 */

export type SaveBoatIdentityResult = { ok: true } | { ok: false; message: string }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The boat could not be saved. Try again.'

/**
 * A Server Action is a public endpoint. The admin check is made here, on the server,
 * from the **Profile** — the client not rendering a pencil for a viewer is a
 * courtesy, not the check. RLS refuses the same write a second time, which is why a
 * rejected update is reported rather than assumed impossible.
 *
 * The refusal is returned rather than thrown, so the editor can put it beside the
 * fields that caused it and keep what was typed.
 */
export async function saveBoatIdentity(formData: FormData): Promise<SaveBoatIdentityResult> {
  const account = await resolveAccount()

  if (!canWrite(account)) {
    return { ok: false, message: 'Only an admin can edit the boat.' }
  }

  // Trimmed because the surrounding whitespace is an artefact of typing rather than
  // anything the sailor means; the characters between are stored exactly as given.
  const name = (formData.get('name') ?? '').toString().trim()
  const model = (formData.get('model') ?? '').toString().trim()

  // Blanking either one is refused rather than stored. A boat with no name is not a
  // record of a boat, and this screen's whole header would have nothing to render —
  // an empty string here is the same fabrication as a zero standing in for a
  // missing reading.
  if (!name) return { ok: false, message: 'The boat needs a name.' }
  if (!model) return { ok: false, message: 'The boat needs a model.' }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Boat identity: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  // The row to write is read here, never taken from the form: `boats_singleton`
  // means there is exactly one row anybody could mean, so an id in the request
  // would only be an id the caller chose.
  const { data: boat, error: boatError } = await supabase
    .from('boats')
    .select('id')
    .maybeSingle<{ id: string }>()

  if (boatError || !boat) {
    console.error('Boat identity: no boat row to write to:', boatError?.message ?? 'no row')
    return { ok: false, message: UNAVAILABLE }
  }

  const { error } = await supabase.from('boats').update({ name, model }).eq('id', boat.id)

  if (error) {
    console.error('Boat identity: update failed:', error.message)
    return { ok: false, message: UNAVAILABLE }
  }

  revalidatePath('/boat-management')
  return { ok: true }
}

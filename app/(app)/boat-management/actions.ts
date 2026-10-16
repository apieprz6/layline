'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { canWrite } from '@/lib/account/canWrite'
import {
  MAX_BOAT_ICON_BYTES,
  boatIconTooLarge,
  sniffBoatIconType,
  type BoatIconType,
} from '@/lib/boat/icon'
import { BOAT_BUCKET, boatIconObjectPath } from '@/lib/storage/paths'
import { createClient } from '@/lib/supabase/server'

/**
 * Editing the boat's identity — its name, its model and its icon.
 *
 * The Boat management header *is* the boat's identity, so this is the one write on
 * that screen. It lives here rather than in Settings because no signed-out screen
 * may name the boat. The signed-in header shows what is saved here (ADR 0015, as
 * amended by LAY-180), which is why a save revalidates the whole layout.
 */

export type SaveBoatIdentityResult = { ok: true } | { ok: false; message: string }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The boat could not be saved. Try again.'

/** A new icon, read and checked, ready to store. */
interface IconUpload {
  path: string
  bytes: Uint8Array
  type: BoatIconType
}

/**
 * What the save does to the icon: nothing, replace it, or remove it. Staged on the client and
 * committed here with the name and model, so a save is all of it or none of it.
 */
type IconChange = { kind: 'keep' } | { kind: 'replace'; upload: IconUpload } | { kind: 'remove' }

/**
 * Read the icon fields off the form, or the sentence to show the admin.
 *
 * The bytes decide the type — `file.type` is whatever the browser, or a caller who is not a
 * browser, chose to say. Nothing is resized or re-encoded: what is stored is what was dropped.
 */
async function readIconChange(formData: FormData): Promise<IconChange | { message: string }> {
  const file = formData.get('icon')

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BOAT_ICON_BYTES) {
      return { message: boatIconTooLarge(file.size) }
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniffBoatIconType(bytes)

    if (type === null) return { message: 'An icon has to be a PNG, JPEG or WebP image.' }

    let path: string
    try {
      path = boatIconObjectPath(randomUUID(), file.name)
    } catch {
      // A name with nothing storable left in it. A browser will not send one; a caller might.
      return { message: 'That image needs a name Layline can store it under. Rename it and try again.' }
    }

    return { kind: 'replace', upload: { path, bytes, type } }
  }

  if (formData.get('removeIcon') === 'true') return { kind: 'remove' }

  return { kind: 'keep' }
}

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

  const icon = await readIconChange(formData)
  if ('message' in icon) return { ok: false, message: icon.message }

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
    .select('id, icon_path')
    .maybeSingle<{ id: string; icon_path: string | null }>()

  if (boatError || !boat) {
    console.error('Boat identity: no boat row to write to:', boatError?.message ?? 'no row')
    return { ok: false, message: UNAVAILABLE }
  }

  const bucket: BoatBucket = supabase.storage.from(BOAT_BUCKET)

  // The new bytes first, then the row that points at them, then the old bytes away: at no point
  // does the row name an object that is not there. The key is fresh per upload, so this never
  // writes over the icon the row still names, and `upsert` stays off to say so.
  if (icon.kind === 'replace') {
    const { error: uploadError } = await bucket.upload(icon.upload.path, icon.upload.bytes, {
      upsert: false,
      contentType: icon.upload.type,
    })

    if (uploadError) {
      console.error('Boat identity: icon bytes were refused:', uploadError.message)
      return { ok: false, message: UNAVAILABLE }
    }
  }

  const { error } = await supabase
    .from('boats')
    .update({ name, model, ...iconColumns(icon) })
    .eq('id', boat.id)

  if (error) {
    console.error('Boat identity: update failed:', error.message)
    // The new bytes are taken back, so the bucket holds only the icon the row still names.
    if (icon.kind === 'replace') await deleteIconObject(bucket, icon.upload.path)
    return { ok: false, message: UNAVAILABLE }
  }

  // Exactly one current icon: whatever the row named before a replace or a remove goes.
  if (icon.kind !== 'keep' && boat.icon_path !== null) {
    await deleteIconObject(bucket, boat.icon_path)
  }

  // The layout and not only this screen: the header on every signed-in screen names the boat.
  revalidatePath('/', 'layout')
  return { ok: true }
}

type BoatBucket = ReturnType<Awaited<ReturnType<typeof createClient>>['storage']['from']>

/** The two icon columns as the change leaves them; nothing at all when the icon is kept. */
function iconColumns(
  icon: IconChange
): { icon_path: string | null; icon_updated_at: string | null } | Record<string, never> {
  switch (icon.kind) {
    case 'replace':
      return { icon_path: icon.upload.path, icon_updated_at: new Date().toISOString() }
    case 'remove':
      return { icon_path: null, icon_updated_at: null }
    case 'keep':
      return {}
  }
}

/**
 * Delete an icon object from Storage, logging rather than failing: by the time this runs the row
 * is already right, and an orphaned object is the cheaper kind of wrong.
 */
async function deleteIconObject(bucket: BoatBucket, path: string): Promise<void> {
  const { error } = await bucket.remove([path])
  if (error) console.error('Boat identity: could not delete an icon object:', error.message)
}

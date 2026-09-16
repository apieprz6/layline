'use server'

import { resolveAccount } from '@/lib/account/resolveAccount'
import { createClient } from '@/lib/supabase/server'
import type { ThemePreference, UserPreferences } from '@/types'

/**
 * The two halves of the theme preference that outlive the browser.
 *
 * `localStorage` is the store's own memory and answers first paint (the blocking
 * script in `app/layout.tsx`), so these exist for one reason only: a preference
 * chosen on the phone should be there on the laptop, and should survive clearing
 * the browser. A **Guest** never reaches the database and loses nothing by it —
 * `localStorage` is the whole of their preference.
 *
 * Server Actions rather than a route: the repo's other authenticated writes are
 * Server Actions, and `/api/preferences` was deleted in LAY-125 precisely because
 * its `PUT` upserted a `profiles` row and so became a second profile-creation path
 * competing with ADR 0017's trigger. Nothing here creates a row — an `update` that
 * matches nothing is reported as a failure, because a missing **Profile** means
 * that trigger has broken and inventing one here would hide it.
 */

/** Whether the write landed. There is nothing on screen to tell, so nothing to say. */
type SaveResult = { ok: boolean }

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'solar' || value === 'nightvision'
}

/**
 * The theme preference stored on the signed-in sailor's **Profile**, or `null`.
 *
 * `null` covers every way of not having one, and they are deliberately not
 * distinguished: a **Guest**, a sailor who has never chosen, an unreadable value,
 * a failed read. The caller's answer is the same in all four — keep using
 * `localStorage` — and there is no screen that would say anything different.
 */
export async function readThemePreference(): Promise<ThemePreference | null> {
  const account = await resolveAccount()
  if (!account) return null

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Theme preference: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('user_id', account.userId)
    .maybeSingle<{ preferences: Partial<UserPreferences> | null }>()

  if (error) {
    console.error('Theme preference: read failed:', error.message)
    return null
  }

  const stored = profile?.preferences?.theme

  // Not narrowed to the three values for safety — the column is JSONB and a hand
  // edit or a newer version of the app can put anything in it. An unreadable
  // preference is reported as no preference, never mapped onto `auto`, which is a
  // choice a sailor can make and so cannot double as "we could not tell".
  return isThemePreference(stored) ? stored : null
}

/**
 * Stores the sailor's theme preference on their own **Profile**.
 *
 * Authorization is "signed in", not `canWrite`: that predicate governs the boat,
 * which only an admin edits (ADR 0019). This is the sailor's own row, which the
 * own-row `UPDATE` policy has always allowed, and `role` stays unwritable either
 * way — a trigger refuses it for any caller holding the `authenticated` JWT role.
 */
export async function saveThemePreference(preference: ThemePreference): Promise<SaveResult> {
  // A Server Action is a public endpoint, so the three values are checked here and
  // not only in the picker that offers them. Ahead of authenticating, because a
  // value that is not a preference is not a request worth spending a round trip on.
  if (!isThemePreference(preference)) {
    console.error('Theme preference: refused a value that is not a preference')
    return { ok: false }
  }

  const account = await resolveAccount()
  if (!account) return { ok: false }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Theme preference: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false }
  }

  // Read before write, because `preferences` is one JSONB column shared with the
  // buoy settings of ADR 0001 and an `update` rewrites the whole of it. Sending
  // `{ theme }` alone would overwrite what the sailor set elsewhere — the one thing
  // AGENTS.md says never to do. Two statements rather than a `jsonb_set` are
  // acceptable here: the only writer of a sailor's own row is that sailor, in one
  // tab at a time, choosing a theme by hand.
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('user_id', account.userId)
    .maybeSingle<{ preferences: Partial<UserPreferences> | null }>()

  if (readError) {
    console.error('Theme preference: read before write failed:', readError.message)
    return { ok: false }
  }

  // A trigger creates the **Profile** in the same transaction as the account and a
  // backfill covered the rest (ADR 0017), so no row means that promise has broken.
  // Reported rather than repaired by an upsert here, which is the path LAY-125
  // closed. RLS hiding the row is indistinguishable from its absence, and the
  // answer — do not write, say so — is the same for both.
  if (!profile) {
    console.error(
      `Theme preference: no Profile for ${account.userId} — the trigger from ADR 0017 should guarantee one`
    )
    return { ok: false }
  }

  const { error: writeError } = await supabase
    .from('profiles')
    .update({ preferences: { ...(profile.preferences ?? {}), theme: preference } })
    .eq('user_id', account.userId)

  if (writeError) {
    console.error('Theme preference: write failed:', writeError.message)
    return { ok: false }
  }

  return { ok: true }
}

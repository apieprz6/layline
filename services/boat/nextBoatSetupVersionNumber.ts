import { createClient } from '@/lib/supabase/server'
import type { BoatSetupKind } from '@/types'

/**
 * What the next Version of one artifact would be numbered, for a confirm button to say.
 *
 * **Advisory, and only ever that.** The real number is computed inside
 * `mint_boat_setup_version`'s transaction, where `UNIQUE (artifact_id, version_number)` settles a
 * race between two admins confirming at once. This is what the button says before that happens, so
 * every failure here falls back to 1 — the number an empty archive would give anyway — and says why
 * in the log rather than to the admin, whose upload is not in doubt.
 *
 * One function for every kind because the numbering is the shared table's, not the artifact's:
 * `boat_setup_versions` holds all four kinds (ADR 0011) and the question is the same one for each
 * of them with a different `kind` in the filter. `label` names the artifact in the log line, because
 * "could not read the current version number" is only useful if it says which archive it was
 * counting.
 */
export async function nextBoatSetupVersionNumber(options: {
  kind: BoatSetupKind
  label: string
}): Promise<number> {
  const { kind, label } = options

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('boat_setup_versions')
      .select('version_number')
      .eq('kind', kind)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle<{ version_number: number }>()

    if (error) {
      console.error(`${label} upload: could not read the current version number:`, error.message)
      return 1
    }

    return (data?.version_number ?? 0) + 1
  } catch (thrown: unknown) {
    console.error(
      `${label} upload: Supabase client unavailable while numbering:`,
      thrown instanceof Error ? thrown.message : thrown
    )
    return 1
  }
}

import { createClient } from '@/lib/supabase/server'
import { BOAT_SETUP_ORDER } from '@/lib/boat/artifacts'
import type { Boat, BoatSetup, BoatSetupRow, CurrentBoatSetupVersion } from '@/types'

/**
 * Reading the boat and its four **Boat Setup** artifacts, for the Boat management
 * screen.
 *
 * Every signed-in sailor reads all of this — RLS gives `boats`,
 * `boat_setup_artifacts` and `boat_setup_versions` a SELECT policy for
 * `authenticated` with no Role test, because Role governs writes only (ADR 0019).
 * So this needs no Account passed in: what a viewer may read is what an admin may
 * read, and the anon key with no session simply returns nothing.
 */

/**
 * `boat_setup_artifacts.current_version_id` → `boat_setup_versions.id`.
 *
 * Named rather than left to PostgREST, because two foreign keys join these tables
 * — this one, and `boat_setup_versions.artifact_id` pointing back — so an unnamed
 * embed is ambiguous and fails. The name is the migration's
 * (`20260910183000_create_race_archive_and_boat_setup.sql`), and
 * `__tests__/supabase/race-archive-migration.test.ts` holds the two together.
 */
export const CURRENT_VERSION_FK = 'boat_setup_artifacts_current_version_fkey'

const ARTIFACTS_SELECT =
  `kind, current:boat_setup_versions!${CURRENT_VERSION_FK}(version_number, effective_from)`

/** A row exactly as PostgREST returns it: `current` is a to-one embed, or `null`. */
type ArtifactRow = Pick<BoatSetupRow, 'kind'> & { current: CurrentBoatSetupVersion | null }

/**
 * The boat and its four artifacts, or `null` when the boat cannot be read.
 *
 * `null` is deliberately all-or-nothing. Half a page would have to name the boat
 * or invent a name for it, and the screen's whole header is the boat's identity —
 * so a failed read is reported to the sailor as a failed read, not as a boat with
 * a blank name.
 */
export async function readBoatSetup(): Promise<BoatSetup | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    // A checkout with no `.env.local`, or a preview deployment never given the
    // keys. Nobody is signed in on such a deployment either, so this path is
    // reached only by a test or a misconfiguration.
    console.error(
      'Boat Setup: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data: boat, error: boatError } = await supabase
    .from('boats')
    .select('id, name, model, created_at, updated_at')
    .maybeSingle<Boat>()

  if (boatError) {
    console.error('Boat Setup: boats read failed:', boatError.message)
    return null
  }

  // `boats_singleton` guarantees one row and the migration seeds it, so no row
  // means either RLS hid it — the two are indistinguishable through
  // `maybeSingle()` — or the migration has not run. Neither is a boat to name.
  if (!boat) {
    console.error('Boat Setup: no boat row is readable')
    return null
  }

  const { data: rows, error: artifactsError } = await supabase
    .from('boat_setup_artifacts')
    .select(ARTIFACTS_SELECT)
    .eq('boat_id', boat.id)
    .returns<ArtifactRow[]>()

  if (artifactsError) {
    console.error('Boat Setup: artifacts read failed:', artifactsError.message)
    return null
  }

  const byKind = new Map((rows ?? []).map((row) => [row.kind, row.current]))

  // The list is built from the vocabulary, not from the rows: four artifacts exist
  // forever (`boat_setup_artifacts`' UNIQUE (boat_id, kind), seeded by the
  // migration), so a kind with no row is a broken invariant and not a state. The
  // screen keeps its shape and says *not recorded*, which is true of an artifact
  // that has no row either, while the log carries the breakage.
  const missing = BOAT_SETUP_ORDER.filter((kind) => !byKind.has(kind))
  if (missing.length > 0) {
    console.error(`Boat Setup: no artifact row for ${missing.join(', ')} — the migration seeds four`)
  }

  return {
    boat,
    artifacts: BOAT_SETUP_ORDER.map((kind) => ({
      kind,
      current: byKind.get(kind) ?? null,
    })),
  }
}

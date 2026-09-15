import { createClient } from '@/lib/supabase/server'
import type { Boat, RigTuneBand, RigTunePage, RigTuneVersionRecord } from '@/types'

/**
 * Reading the Rig Tune artifact — every Version, with every Wind Band — for its screen.
 *
 * Every Version, not just the one in force: a Race freezes a pointer at the Version the boat
 * was set to, and that pointer is worthless if nobody can open what it points at (ADR 0007).
 * Like `readBoatSetup`, this needs no Account passed in: RLS gives every signed-in account
 * SELECT on all three tables, because Role governs writes only (ADR 0019).
 */

/**
 * `boat_setup_versions.(artifact_id, kind)` → `boat_setup_artifacts.(id, kind)`.
 *
 * Named because two foreign keys join these tables — this one, and the artifact's current
 * pointer back — so an unnamed embed is ambiguous and PostgREST fails it. The name is the
 * migration's; `__tests__/supabase/race-archive-migration.test.ts` holds the two together.
 */
export const VERSIONS_FK = 'boat_setup_versions_artifact_id_kind_fkey'

const BAND_COLUMNS = 'id, version_id, kind, low_kt, high_kt, is_base, label, note, gaps_stale, shrouds'

const ARTIFACT_SELECT = `id, current_version_id, versions:boat_setup_versions!${VERSIONS_FK}(
    id, version_number, effective_from, recorded_at, note, created_by,
    bands:rig_tune_bands(${BAND_COLUMNS})
)`

/** A Version row as PostgREST returns it, with its bands embedded and unordered. */
type VersionRow = Omit<RigTuneVersionRecord, 'bands'> & { bands: RigTuneBand[] | null }

type ArtifactRow = {
  id: string
  current_version_id: string | null
  versions: VersionRow[] | null
}

/**
 * The artifact and its Versions, or `null` when any part of it cannot be read.
 *
 * All-or-nothing like `readBoatSetup`: the screen's header is the boat's identity, and a Rig
 * Tune with some of its bands missing is not a rig anybody should set a boat to.
 */
export async function readRigTune(): Promise<RigTunePage | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Rig Tune: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data: boat, error: boatError } = await supabase
    .from('boats')
    .select('id, name, model, created_at, updated_at')
    .maybeSingle<Boat>()

  if (boatError) {
    console.error('Rig Tune: boats read failed:', boatError.message)
    return null
  }

  if (!boat) {
    console.error('Rig Tune: no boat row is readable')
    return null
  }

  const { data: artifact, error: artifactError } = await supabase
    .from('boat_setup_artifacts')
    .select(ARTIFACT_SELECT)
    .eq('boat_id', boat.id)
    .eq('kind', 'rig_tune')
    .maybeSingle<ArtifactRow>()

  if (artifactError) {
    console.error('Rig Tune: artifact read failed:', artifactError.message)
    return null
  }

  if (!artifact) {
    // Four artifact rows exist forever (the migration seeds them), so this is a broken
    // invariant rather than an empty state, and there is no artifact id to write against.
    console.error('Rig Tune: no rig_tune artifact row is readable')
    return null
  }

  return {
    boat,
    artifact_id: artifact.id,
    current_version_id: artifact.current_version_id,
    versions: (artifact.versions ?? [])
      .map((version) => ({
        ...version,
        // Ascending by `low_kt`, which is the order a band table is read in: the wind
        // rises down the page. Sorted here rather than asked of PostgREST, which makes
        // no ordering promise without an ORDER BY.
        bands: [...(version.bands ?? [])].sort((a, b) => a.low_kt - b.low_kt),
      }))
      // Newest first: the Version in force is what the screen opens on, and the history
      // below it reads backwards from there.
      .sort((a, b) => b.version_number - a.version_number),
  }
}

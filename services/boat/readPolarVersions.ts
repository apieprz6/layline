import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'
import { validatePolarPayload } from '@/services/boat/polarPayload'
import type {
  PolarScreen,
  PolarVersionDetail,
  PolarVersionList,
  PolarVersionSummary,
} from '@/types'

/**
 * Reading the **Polar**'s Versions — all of them for the list, and one of them with its grid.
 *
 * Every signed-in sailor reads all of this. `boat_setup_versions` has a SELECT policy for
 * `authenticated` with no Role test, because Role governs writes only (ADR 0019), so nothing
 * here takes an Account: what a viewer may read is what an admin may read.
 *
 * Every Version stays readable forever, including the ones the pointer has moved past. A polar
 * that was in force for a season is what the races of that season were sailed against, so
 * superseding it is not the same as retiring it.
 */

/** Columns a list row needs. Deliberately not `payload`: nine grids to render one list. */
const SUMMARY_COLUMNS =
  'id, version_number, effective_from, recorded_at, note, filename, content_sha256'

type VersionRow = Omit<PolarVersionSummary, 'is_current'>
type DetailRow = VersionRow & { payload: unknown }

/** The artifact row: one per kind, forever, holding the pointer. */
interface ArtifactRow {
  id: string
  current_version_id: string | null
}

async function client(): Promise<Awaited<ReturnType<typeof createClient>> | null> {
  try {
    return await createClient()
  } catch (thrown: unknown) {
    // A checkout with no `.env.local`, or a preview deployment never given the keys.
    console.error(
      'Polar: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}

/** The Polar artifact, or `null` when it cannot be read. */
async function readArtifact(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ArtifactRow | null> {
  const { data, error } = await supabase
    .from('boat_setup_artifacts')
    .select('id, current_version_id')
    .eq('kind', 'polar')
    .maybeSingle<ArtifactRow>()

  if (error) {
    console.error('Polar: artifact read failed:', error.message)
    return null
  }

  // The migration seeds four artifacts, so no row means RLS hid it or the migration has not
  // run — indistinguishable through `maybeSingle()`, and neither is a state to render around.
  if (!data) {
    console.error('Polar: no artifact row is readable — the migration seeds four')
    return null
  }

  return data
}

/**
 * Every Polar Version, newest first, or `null` when the read failed.
 *
 * `null` is not an empty archive. An empty archive is `versions: []`, which is the state the app
 * ships in and which the screen says *not recorded* to; a failed read is reported as one.
 */
export async function readPolarVersions(): Promise<PolarVersionList | null> {
  const supabase = await client()
  if (!supabase) return null

  const artifact = await readArtifact(supabase)
  if (!artifact) return null

  return summaries(supabase, artifact)
}

async function summaries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artifact: ArtifactRow
): Promise<PolarVersionList | null> {
  const { data, error } = await supabase
    .from('boat_setup_versions')
    .select(SUMMARY_COLUMNS)
    .eq('artifact_id', artifact.id)
    .order('version_number', { ascending: false })
    .returns<VersionRow[]>()

  if (error) {
    console.error('Polar: versions read failed:', error.message)
    return null
  }

  return {
    current_version_id: artifact.current_version_id,
    versions: (data ?? []).map((row) => ({
      ...row,
      is_current: row.id === artifact.current_version_id,
    })),
  }
}

/**
 * One Polar Version with its grid, or `null` when there is no such Version to read.
 *
 * The payload is validated on the way out as well as on the way in. A JSONB column holds
 * whatever it was given, and a grid whose rows are not the width of its own wind speed axis
 * would render as a table with holes in it — so it is reported as unreadable instead, which is
 * true and fixable, rather than displayed as a polar with gaps, which is neither.
 */
export async function readPolarVersion(versionId: string): Promise<PolarVersionDetail | null> {
  // Asked before the database is: `id=eq.not-a-uuid` is a 22P02 *error*, which would be reported
  // and logged as a read that failed rather than as the Version that does not exist.
  if (!isUuid(versionId)) return null

  const supabase = await client()
  if (!supabase) return null

  const artifact = await readArtifact(supabase)
  if (!artifact) return null

  return detail(supabase, artifact, versionId)
}

/**
 * The list and the grid in force together, for the screen that shows both.
 *
 * One artifact read, not two: `readPolarVersions` and `readPolarVersion` each begin by finding the
 * artifact, and a page calling both in turn asks four questions to answer two. The pointer comes
 * from the artifact row anyway, so the grid it names can be fetched alongside the list rather than
 * after it.
 *
 * `null` for the same reason `readPolarVersions` returns it — the list could not be read. A
 * readable list whose `current` is `null` is different and ordinary: an empty archive, or a
 * pointer at a Version whose stored payload is not a grid.
 */
export async function readPolarScreen(): Promise<PolarScreen | null> {
  const supabase = await client()
  if (!supabase) return null

  const artifact = await readArtifact(supabase)
  if (!artifact) return null

  const [list, current] = await Promise.all([
    summaries(supabase, artifact),
    artifact.current_version_id === null
      ? null
      : detail(supabase, artifact, artifact.current_version_id),
  ])

  if (!list) return null

  return { list, current }
}

async function detail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artifact: ArtifactRow,
  versionId: string
): Promise<PolarVersionDetail | null> {
  const { data, error } = await supabase
    .from('boat_setup_versions')
    .select(`${SUMMARY_COLUMNS}, payload`)
    .eq('artifact_id', artifact.id)
    .eq('id', versionId)
    .maybeSingle<DetailRow>()

  if (error) {
    console.error('Polar: version read failed:', error.message)
    return null
  }

  // No row: a stale link, a mistyped id, or an id belonging to another artifact's Version. All
  // three are the same answer to the sailor — there is no such Polar Version.
  if (!data) return null

  const validated = validatePolarPayload(data.payload)

  if (!validated.ok) {
    console.error(
      `Polar: v${data.version_number} (${data.id}) holds a payload that is not a grid:`,
      validated.issues.join('; ')
    )
    return null
  }

  const { payload: _stored, ...summary } = data

  return {
    ...summary,
    is_current: data.id === artifact.current_version_id,
    payload: validated.payload,
  }
}

/**
 * Reading the Versions of a **file-backed** Boat Setup artifact — all of them for the list, and one
 * of them with its payload.
 *
 * One reader for both file-backed kinds. ADR 0011 puts every Version in one table with a JSONB
 * payload and says what a second artifact kind costs: an enum value, a branch in the payload CHECK,
 * and a Zod schema. Not a second reader — the three queries below are identical for a Polar and a
 * Crossover Chart, because everything that differs between them is inside the payload, and the only
 * thing this module does with a payload is hand it to the schema that owns it.
 *
 * Every signed-in sailor reads all of this. `boat_setup_versions` has a SELECT policy for
 * `authenticated` with no Role test, because Role governs writes only (ADR 0019), so nothing here
 * takes an Account: what a viewer may read is what an admin may read.
 *
 * Every Version stays readable forever, including the ones the pointer has moved past. A polar that
 * was in force for a season is what the races of that season were sailed against, so superseding it
 * is not the same as retiring it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils/uuid'
import type {
  FileBackedBoatSetupKind,
  FileBackedScreen,
  FileBackedVersionDetail,
  FileBackedVersionDetailList,
  FileBackedVersionList,
  FileBackedVersionWithPayload,
  FileBackedVersionSummary,
} from '@/types'

/** Columns a list row needs. Deliberately not `payload`: nine grids to render one list. */
const SUMMARY_COLUMNS =
  'id, version_number, effective_from, recorded_at, note, filename, content_sha256'

type VersionRow = Omit<FileBackedVersionSummary, 'is_current'>
type DetailRow = VersionRow & { payload: unknown }

/** The artifact row: one per kind, forever, holding the pointer. */
interface ArtifactRow {
  id: string
  current_version_id: string | null
}

type Supabase = SupabaseClient

/** Whatever validates this kind's payload — `validatePolarPayload` and its siblings all fit. */
type PayloadValidator<Payload> = (
  payload: unknown
) => { ok: true; payload: Payload } | { ok: false; issues: string[] }

export interface FileBackedVersionReaderOptions<Payload> {
  kind: FileBackedBoatSetupKind
  /** How this artifact names itself in a log line: `Polar`, `Crossover Chart`. */
  label: string
  /** What its payload is, for the log line that says a stored one is not it: `a grid`, `a chart`. */
  payloadIs: string
  /**
   * Structure only. A payload that fails this is reported as unreadable, so what is asked here must
   * be what the payload has to be to be drawn at all — never a policy that may tighten later, which
   * would make a Version already in the archive vanish. The Crossover Chart hands over
   * `validateCrossoverChartStructure` and keeps its sail-naming rule on the write path for exactly
   * that reason.
   */
  validate: PayloadValidator<Payload>
}

/**
 * Each read takes the client to read as. Omit it and the read builds the cookie client, as every
 * screen wants; the MCP server passes the one it built from its bearer token.
 */
export interface FileBackedVersionReader<Payload> {
  /**
   * Every Version, newest first, or `null` when the read failed.
   *
   * `null` is not an empty archive. An empty archive is `versions: []`, which is the state the app
   * ships in and which the screen says *not recorded* to; a failed read is reported as one.
   */
  readVersions(client?: SupabaseClient): Promise<FileBackedVersionList | null>
  /** One Version with its payload, or `null` when there is no such Version to read. */
  readVersion(
    versionId: string,
    client?: SupabaseClient
  ): Promise<FileBackedVersionDetail<Payload> | null>
  /** The list and the payload in force together, for the screen that shows both. */
  readScreen(client?: SupabaseClient): Promise<FileBackedScreen<Payload> | null>
  /**
   * Every Version with its payload, newest first, or `null` when the read failed — for a reader
   * that states each Version's contents, as the MCP server's `boat_setup` does.
   *
   * A Version whose stored payload the schema refuses stays in the list with `payload: null`, as
   * the screen still lists it: unreadable is a fact about that Version, not a failed read.
   */
  readVersionsWithPayloads(client?: SupabaseClient): Promise<FileBackedVersionDetailList<Payload> | null>
}

export function fileBackedVersionReader<Payload>(
  options: FileBackedVersionReaderOptions<Payload>
): FileBackedVersionReader<Payload> {
  const { kind, label, payloadIs, validate } = options

  /** The caller's client where it gave one — the MCP server's, say — and the cookie one if not. */
  async function resolveClient(client: Supabase | undefined): Promise<Supabase | null> {
    try {
      return client ?? (await createClient())
    } catch (thrown: unknown) {
      // A checkout with no `.env.local`, or a preview deployment never given the keys.
      console.error(
        `${label}: Supabase client unavailable:`,
        thrown instanceof Error ? thrown.message : thrown
      )
      return null
    }
  }

  /** This artifact's row, or `null` when it cannot be read. */
  async function readArtifact(supabase: Supabase): Promise<ArtifactRow | null> {
    const { data, error } = await supabase
      .from('boat_setup_artifacts')
      .select('id, current_version_id')
      .eq('kind', kind)
      .maybeSingle<ArtifactRow>()

    if (error) {
      console.error(`${label}: artifact read failed:`, error.message)
      return null
    }

    // The migration seeds four artifacts, so no row means RLS hid it or the migration has not
    // run — indistinguishable through `maybeSingle()`, and neither is a state to render around.
    if (!data) {
      console.error(`${label}: no artifact row is readable — the migration seeds four`)
      return null
    }

    return data
  }

  async function summaries(
    supabase: Supabase,
    artifact: ArtifactRow
  ): Promise<FileBackedVersionList | null> {
    const { data, error } = await supabase
      .from('boat_setup_versions')
      .select(SUMMARY_COLUMNS)
      .eq('artifact_id', artifact.id)
      .order('version_number', { ascending: false })
      .returns<VersionRow[]>()

    if (error) {
      console.error(`${label}: versions read failed:`, error.message)
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
   * The payload is validated on the way out as well as on the way in. A JSONB column holds whatever
   * it was given, and a grid whose rows are not the width of its own wind speed axis would render as
   * a table with holes in it — so it is reported as unreadable instead, which is true and fixable,
   * rather than displayed as a chart with gaps, which is neither.
   */
  async function detail(
    supabase: Supabase,
    artifact: ArtifactRow,
    versionId: string
  ): Promise<FileBackedVersionDetail<Payload> | null> {
    const { data, error } = await supabase
      .from('boat_setup_versions')
      .select(`${SUMMARY_COLUMNS}, payload`)
      .eq('artifact_id', artifact.id)
      .eq('id', versionId)
      .maybeSingle<DetailRow>()

    if (error) {
      console.error(`${label}: version read failed:`, error.message)
      return null
    }

    // No row: a stale link, a mistyped id, or an id belonging to another artifact's Version. All
    // three are the same answer to the sailor — there is no such Version of this artifact.
    if (!data) return null

    const version = withPayload(artifact, data)
    return version.payload === null ? null : { ...version, payload: version.payload }
  }

  /** A stored row as a Version, its payload `null` when the schema refuses it, which is logged. */
  function withPayload(
    artifact: ArtifactRow,
    row: DetailRow
  ): FileBackedVersionWithPayload<Payload> {
    const { payload: stored, ...summary } = row
    const validated = validate(stored)

    if (!validated.ok) {
      console.error(
        `${label}: v${row.version_number} (${row.id}) holds a payload that is not ${payloadIs}:`,
        validated.issues.join('; ')
      )
    }

    return {
      ...summary,
      is_current: row.id === artifact.current_version_id,
      payload: validated.ok ? validated.payload : null,
    }
  }

  return {
    async readVersions(client?: Supabase): Promise<FileBackedVersionList | null> {
      const supabase = await resolveClient(client)
      if (!supabase) return null

      const artifact = await readArtifact(supabase)
      if (!artifact) return null

      return summaries(supabase, artifact)
    },

    async readVersion(
      versionId: string,
      client?: Supabase
    ): Promise<FileBackedVersionDetail<Payload> | null> {
      // Asked before the database is: `id=eq.not-a-uuid` is a 22P02 *error*, which would be
      // reported and logged as a read that failed rather than as the Version that does not exist.
      if (!isUuid(versionId)) return null

      const supabase = await resolveClient(client)
      if (!supabase) return null

      const artifact = await readArtifact(supabase)
      if (!artifact) return null

      return detail(supabase, artifact, versionId)
    },

    /**
     * One artifact read, not two: `readVersions` and `readVersion` each begin by finding the
     * artifact, and a page calling both in turn asks four questions to answer two. The pointer comes
     * from the artifact row anyway, so the payload it names can be fetched alongside the list rather
     * than after it.
     *
     * `null` for the same reason `readVersions` returns it — the list could not be read. A readable
     * list whose `current` is `null` is different and ordinary: an empty archive, or a pointer at a
     * Version whose stored payload the schema refuses.
     */
    async readScreen(client?: Supabase): Promise<FileBackedScreen<Payload> | null> {
      const supabase = await resolveClient(client)
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
    },

    async readVersionsWithPayloads(
      client?: Supabase
    ): Promise<FileBackedVersionDetailList<Payload> | null> {
      const supabase = await resolveClient(client)
      if (!supabase) return null

      const artifact = await readArtifact(supabase)
      if (!artifact) return null

      const { data, error } = await supabase
        .from('boat_setup_versions')
        .select(`${SUMMARY_COLUMNS}, payload`)
        .eq('artifact_id', artifact.id)
        .order('version_number', { ascending: false })
        .returns<DetailRow[]>()

      if (error) {
        console.error(`${label}: versions read failed:`, error.message)
        return null
      }

      return {
        current_version_id: artifact.current_version_id,
        versions: (data ?? []).map((row) => withPayload(artifact, row)),
      }
    },
  }
}

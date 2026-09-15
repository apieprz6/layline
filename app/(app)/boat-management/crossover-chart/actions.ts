'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { BOAT_BUCKET, boatSetupObjectPath } from '@/lib/storage/paths'
import { isCalendarDate } from '@/lib/utils/calendarDate'
import { createClient } from '@/lib/supabase/server'
import {
  CROSSOVER_DEFINITIONS_FORMAT,
  parseCrossoverDefinitionsFile,
} from '@/services/boat/crossoverDefinitionsFile'
import { CROSSOVER_GRID_FORMAT, parseCrossoverGridFile } from '@/services/boat/crossoverGridFile'
import {
  crossoverDefinitionUsage,
  validateCrossoverChartPayload,
  type ValidCrossoverChartPayload,
} from '@/services/boat/crossoverPayload'
import { readBoatSetupUpload, type BoatSetupUpload } from '@/services/boat/readBoatSetupUpload'
import type {
  CrossoverChartUploadPreview,
  CrossoverDefinitionsParseWarning,
  CrossoverGridParseWarning,
} from '@/types'

/**
 * Uploading a **Crossover Chart** — the two-step confirm, and the write.
 *
 * **Two files, one action, one Version.** The chart arrives as a `.sailselect` grid of sail numbers
 * and the definitions file that says what those numbers mean, and they are deliberately not
 * independently versioned: two halves with separate version histories would let a Race freeze a
 * pairing that never existed aboard the boat — a grid from March against definitions from June, with
 * sail 7 meaning two different things (ADR 0012). So there is no state here in which one half is
 * accepted and the other is not. Either both files parse and join into one payload, or nothing is
 * written.
 *
 * Step one, `previewCrossoverChartUpload`, parses both dropped files and hands back the joined
 * payload, everything tolerated on the way in, and how much of the chart each definition accounts
 * for. Nothing is written and nothing reaches Storage.
 *
 * Step two, `commitCrossoverChartVersion`, is given the same two files again and re-parses them. The
 * client's copy of the chart is never trusted: a Server Action is a public endpoint, so the parse is
 * the gate and the gate is on the server, twice (ADR 0009). Both files' own SHA-256s travel with the
 * confirm so that what is committed is provably the pair that was shown.
 *
 * The order of the write is ADR 0013's, and it is the whole reason the version id is minted here
 * rather than by a DEFAULT: the bytes go to their permanent paths under
 * `boat-setup/crossover_chart/{version_id}/` **before** the transaction commits. A failure after an
 * upload leaves bytes nothing points at — which is exactly the trade the ADR chose, because an
 * orphaned object is invisible and sweepable while an orphaned row is a Version of the boat's chart
 * that no file backs.
 *
 * The row's `filename` and `content_sha256` are the grid's — the artifact's namesake, and the file
 * whose header token `source` records. The definitions file's own name and hash have no columns to
 * live in and so live in the payload, beside the definitions themselves (ADR 0022).
 */

export type PreviewCrossoverChartUploadResult =
  | { ok: true; preview: CrossoverChartUploadPreview }
  | { ok: false; message: string }

export type CommitCrossoverChartVersionResult =
  | { ok: true; version_id: string; version_number: number }
  | { ok: false; message: string }

/** What the sailor is told when the reason is ours and not theirs. */
const UNAVAILABLE = 'The Crossover Chart could not be saved. Try again.'

const NOT_ADMIN = 'Only an admin can upload a Crossover Chart.'

const NO_GRID = 'Choose a sail chart file (.sailselect) to upload.'

const NO_DEFINITIONS = 'Choose the sail definitions file (.saildesc) that goes with it.'

/** The form keys the panel posts both halves under. */
const GRID_FIELD = 'grid'
const DEFINITIONS_FIELD = 'definitions'

function readGridUpload(formData: FormData): Promise<BoatSetupUpload | { message: string }> {
  return readBoatSetupUpload(formData, GRID_FIELD, {
    missing: NO_GRID,
    tooLarge: 'A sail chart is a couple of kilobytes;',
  })
}

function readDefinitionsUpload(formData: FormData): Promise<BoatSetupUpload | { message: string }> {
  return readBoatSetupUpload(formData, DEFINITIONS_FIELD, {
    missing: NO_DEFINITIONS,
    tooLarge: 'A sail definitions file is a few lines;',
  })
}

interface ReadChart {
  payload: ValidCrossoverChartPayload
  grid_warnings: CrossoverGridParseWarning[]
  definitions_warnings: CrossoverDefinitionsParseWarning[]
}

/**
 * Parse both files, join them, and validate the join — or give back the sentence to show the admin.
 *
 * The join is where the two halves stop being two files. `source` is assembled here because this is
 * the only place that knows both of them: which format each was read as, what the grid's header token
 * said, and what the definitions file was called and hashed to.
 */
function readChart(grid: BoatSetupUpload, definitions: BoatSetupUpload): ReadChart | { message: string } {
  const parsedGrid = parseCrossoverGridFile(grid.text)

  if (!parsedGrid.ok) {
    const where = parsedGrid.line === undefined ? '' : ` (line ${parsedGrid.line})`
    return {
      message: `${grid.filename} could not be read as a sail chart${where}: ${parsedGrid.message}`,
    }
  }

  const parsedDefinitions = parseCrossoverDefinitionsFile(definitions.text)

  if (!parsedDefinitions.ok) {
    const where = parsedDefinitions.line === undefined ? '' : ` (line ${parsedDefinitions.line})`
    return {
      message: `${definitions.filename} could not be read as sail definitions${where}: ${parsedDefinitions.message}`,
    }
  }

  const validated = validateCrossoverChartPayload({
    twa_axis: parsedGrid.grid.twa_axis,
    tws_axis: parsedGrid.grid.tws_axis,
    cells: parsedGrid.grid.cells,
    sail_definitions: parsedDefinitions.definitions,
    source: {
      format: CROSSOVER_GRID_FORMAT,
      header_token: parsedGrid.grid.header_token,
      definitions: {
        format: CROSSOVER_DEFINITIONS_FORMAT,
        filename: definitions.filename,
        content_sha256: definitions.content_sha256,
      },
    },
  })

  // Neither parser has seen the other's file, so this is where the two halves are held to each
  // other: every cell must resolve to a definition, and no superseded sail name may get in. It is
  // also the belt to the parsers' braces — what stands between the database and a payload assembled
  // by anything else.
  if (!validated.ok) {
    console.error(
      'Crossover Chart upload: the joined chart failed the payload schema:',
      validated.issues.join('; ')
    )
    return {
      message: `Those two files parsed but do not make a usable chart: ${validated.issues[0]}`,
    }
  }

  return {
    payload: validated.payload,
    grid_warnings: parsedGrid.warnings,
    definitions_warnings: parsedDefinitions.warnings,
  }
}

/** Step one: read both dropped files and show the admin what they say. Writes nothing. */
export async function previewCrossoverChartUpload(
  formData: FormData
): Promise<PreviewCrossoverChartUploadResult> {
  const account = await resolveAccount()

  // The panel is only rendered for an admin, but that is a courtesy and not the check.
  if (!canWrite(account)) return { ok: false, message: NOT_ADMIN }

  const grid = await readGridUpload(formData)
  if ('message' in grid) return { ok: false, message: grid.message }

  const definitions = await readDefinitionsUpload(formData)
  if ('message' in definitions) return { ok: false, message: definitions.message }

  const chart = readChart(grid, definitions)
  if ('message' in chart) return { ok: false, message: chart.message }

  return {
    ok: true,
    preview: {
      grid: {
        filename: grid.filename,
        byte_length: grid.bytes.byteLength,
        content_sha256: grid.content_sha256,
      },
      definitions: {
        filename: definitions.filename,
        byte_length: definitions.bytes.byteLength,
        content_sha256: definitions.content_sha256,
      },
      payload: chart.payload,
      grid_warnings: chart.grid_warnings,
      definitions_warnings: chart.definitions_warnings,
      usage: crossoverDefinitionUsage(chart.payload),
      next_version_number: await nextVersionNumber(),
    },
  }
}

/**
 * Step two: commit the pair the admin confirmed as the next Version.
 *
 * Expects both files again, the calendar date they take effect, an optional note, and the two
 * SHA-256s the preview showed.
 */
export async function commitCrossoverChartVersion(
  formData: FormData
): Promise<CommitCrossoverChartVersionResult> {
  const account = await resolveAccount()

  if (!canWrite(account)) return { ok: false, message: NOT_ADMIN }

  const effectiveFrom = (formData.get('effective_from') ?? '').toString().trim()

  // A Version's own date, not the upload's: the sailor says when this chart took effect, and there
  // is no default that would not be a guess. `recorded_at` is when Layline was told.
  if (!isCalendarDate(effectiveFrom)) {
    return { ok: false, message: 'Say which date this Crossover Chart took effect.' }
  }

  // Trimmed, because the surrounding whitespace is an artefact of typing. A blank note becomes no
  // note at all, in the database as well as here.
  const note = (formData.get('note') ?? '').toString().trim()

  const grid = await readGridUpload(formData)
  if ('message' in grid) return { ok: false, message: grid.message }

  const definitions = await readDefinitionsUpload(formData)
  if ('message' in definitions) return { ok: false, message: definitions.message }

  // The confirm is of two particular files, and saying so is not optional: a confirm that carries no
  // hash has not been through a preview, and one that carries the wrong hash approved a chart these
  // bytes are not. Either way it goes back through the preview rather than through. Both halves are
  // checked, because a swapped definitions file changes what every cell means.
  const unchanged = checkUnchanged(formData, grid, definitions)
  if (unchanged !== null) return { ok: false, message: unchanged }

  // Re-parsed on the server. The client sent a payload with the preview and it is not read here: the
  // files are the source, every time.
  const chart = readChart(grid, definitions)
  if ('message' in chart) return { ok: false, message: chart.message }

  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Crossover Chart upload: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return { ok: false, message: UNAVAILABLE }
  }

  // Minted here because the permanent paths contain it and the bytes move before the commit.
  const versionId = randomUUID()

  let gridPath: string
  let definitionsPath: string

  try {
    gridPath = boatSetupObjectPath('crossover_chart', versionId, grid.filename)
    definitionsPath = boatSetupObjectPath('crossover_chart', versionId, definitions.filename)
  } catch (thrown: unknown) {
    // `storageSafeFilename` refuses a name with nothing storable left in it — `..`, or a name made
    // entirely of characters a Storage key may not carry. A browser will not send one, but a Server
    // Action is a public endpoint and the filenames are the caller's to choose.
    console.error(
      'Crossover Chart upload: a filename yields no Storage path:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return {
      ok: false,
      message: 'Both files need names Layline can store them under. Rename them and drop them again.',
    }
  }

  // Two files under one prefix, so two names that must differ. A chart and its definitions given the
  // same name would have the second overwrite the first — refused rather than silently stored,
  // because the bytes we hand back later have to be the bytes we were given.
  if (gridPath === definitionsPath) {
    return {
      ok: false,
      message: `Both files are named ${grid.filename}. Give them different names so each can be stored.`,
    }
  }

  for (const object of [
    { path: gridPath, upload: grid, what: 'the sail chart' },
    { path: definitionsPath, upload: definitions, what: 'the sail definitions' },
  ]) {
    const { error: uploadError } = await supabase.storage
      .from(BOAT_BUCKET)
      .upload(object.path, object.upload.bytes, {
        // The bytes verbatim. `upsert: false` because the path contains a fresh uuid, so an existing
        // object at it would mean something has gone very wrong.
        upsert: false,
        contentType: 'text/plain; charset=utf-8',
      })

    if (uploadError) {
      // The first file may already be up. It is left there: ADR 0013 takes orphaned bytes over
      // orphaned rows, and no Version points at either object yet.
      console.error(
        `Crossover Chart upload: the bytes of ${object.what} were refused:`,
        uploadError.message
      )
      return { ok: false, message: UNAVAILABLE }
    }
  }

  const { data: versionNumber, error: mintError } = await supabase.rpc('mint_boat_setup_version', {
    p_version_id: versionId,
    p_kind: 'crossover_chart',
    p_effective_from: effectiveFrom,
    p_payload: chart.payload,
    p_note: note === '' ? null : note,
    // The grid's, verbatim: it is the file the artifact is named for, and nothing has to parse the
    // Storage path to recover it. The definitions half's are in the payload.
    p_filename: grid.filename,
    p_content_sha256: grid.content_sha256,
  })

  if (mintError || typeof versionNumber !== 'number') {
    // The bytes are already at their permanent paths and are left there: ADR 0013 takes orphaned
    // bytes over orphaned rows, and deleting them here would risk deleting the files of a Version
    // that did commit and whose response was lost.
    console.error(
      'Crossover Chart upload: the Version was not written:',
      mintError?.message ?? 'no version number'
    )
    return { ok: false, message: UNAVAILABLE }
  }

  revalidatePath('/boat-management/crossover-chart')
  // The Boat management list states which Version is in force, so it is stale now too.
  revalidatePath('/boat-management')

  return { ok: true, version_id: versionId, version_number: versionNumber }
}

/** `null` when both files are the ones the preview showed, or the sentence to show instead. */
function checkUnchanged(
  formData: FormData,
  grid: BoatSetupUpload,
  definitions: BoatSetupUpload
): string | null {
  const gridConfirmed = (formData.get('grid_content_sha256') ?? '').toString().trim()
  const definitionsConfirmed = (formData.get('definitions_content_sha256') ?? '').toString().trim()

  if (gridConfirmed === '' || definitionsConfirmed === '') {
    return 'Check the chart before saving it: this confirm carried no checksum for the files.'
  }

  if (gridConfirmed !== grid.content_sha256) {
    return `${grid.filename} changed after it was previewed. Drop both files again and check the chart.`
  }

  if (definitionsConfirmed !== definitions.content_sha256) {
    return `${definitions.filename} changed after it was previewed. Drop both files again and check the chart.`
  }

  return null
}

/**
 * What the next Version would be numbered, for the confirm button to say.
 *
 * Advisory: the real number is computed inside `mint_boat_setup_version`'s transaction, where
 * `UNIQUE (artifact_id, version_number)` settles a race. Falls back to 1, which is what an empty
 * archive would give anyway.
 */
async function nextVersionNumber(): Promise<number> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('boat_setup_versions')
      .select('version_number')
      .eq('kind', 'crossover_chart')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle<{ version_number: number }>()

    if (error) {
      console.error(
        'Crossover Chart upload: could not read the current version number:',
        error.message
      )
      return 1
    }

    return (data?.version_number ?? 0) + 1
  } catch (thrown: unknown) {
    console.error(
      'Crossover Chart upload: Supabase client unavailable while numbering:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return 1
  }
}

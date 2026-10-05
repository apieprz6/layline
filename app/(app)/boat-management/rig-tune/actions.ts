'use server'

import { revalidatePath } from 'next/cache'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { canWrite } from '@/lib/account/canWrite'
import { createClient } from '@/lib/supabase/server'
import {
  buildRigTuneCorrectionInput,
  buildRigTuneVersionInput,
  formatBandRange,
} from '@/lib/boat/rigTune'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import type { RigTuneDraft, RigTuneProblem } from '@/types'

/**
 * Minting a Rig Tune Version — the whole band table, in one act — and correcting one in place.
 *
 * There is no per-band save and no partial save (ADR 0007): a rig is set from a table of
 * bands read together, so half a table is not a tune anybody could set a boat to. The three
 * writes a Version needs — the Version row, its bands, the artifact's current pointer — go
 * through `mint_rig_tune_version`, because supabase-js has no transaction to wrap them in,
 * and a correction's writes go through `correct_rig_tune_version` for the same reason
 * (ADR 0031). `rig_tune_bands` refuses a band written any other way.
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

/** The server client, or null — logged — when there is no Supabase to write to. */
async function openClient(what: string): Promise<Awaited<ReturnType<typeof createClient>> | null> {
  try {
    return await createClient()
  } catch (thrown: unknown) {
    console.error(
      `${what}: Supabase client unavailable:`,
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
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

  const supabase = await openClient('Rig Tune')
  if (supabase === null) return refuse(UNAVAILABLE)

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

/** A Version as the correction reads it: enough to find its neighbours and its own bands. */
type VersionRow = {
  id: string
  version_number: number
  effective_from: string
  bands: { id: string; low_kt: number; high_kt: number | null }[] | null
}

/** A Race set to a band the correction would remove. */
type RaceOnBand = { title: string | null; window_start: string; rig_tune_band_id: string }

/**
 * Correcting a Rig Tune Version in place, for a recording mistake (ADR 0031): a band never
 * entered, a figure mistyped, the wrong date. A rig that actually changed is a new Version.
 *
 * The draft is validated exactly as a new Version's is, then checked against what is stored,
 * because two refusals need the neighbours and the Races in view and are worth saying in the
 * sailor's terms rather than as the database's: a date that crosses a neighbouring Version's,
 * and a band removed while a Race still names it. Neither is taken on trust from the form —
 * the Versions, their bands and the Races are read here, and `correct_rig_tune_version`
 * refuses both again.
 *
 * Every Race keeps its pointers. A kept band is the same row afterwards, so a Race set to it
 * still is, even if its edges moved; the Race page's band note says when its logged wind now
 * falls outside them.
 */
export async function correctRigTuneVersion(
  versionId: string,
  draft: RigTuneDraft
): Promise<SaveRigTuneResult> {
  const account = await resolveAccount()

  if (!canWrite(account)) {
    return refuse('Only an admin can correct a Rig Tune.')
  }

  const built = buildRigTuneCorrectionInput(draft)

  if (!built.ok) {
    return refuse(HAS_PROBLEMS, built.problems)
  }

  const supabase = await openClient('Rig Tune correction')
  if (supabase === null) return refuse(UNAVAILABLE)

  const { data: versions, error: versionsError } = await supabase
    .from('boat_setup_versions')
    .select('id, version_number, effective_from, bands:rig_tune_bands(id, low_kt, high_kt)')
    .eq('kind', 'rig_tune')

  if (versionsError || !versions) {
    console.error('Rig Tune correction: Versions read failed:', versionsError?.message ?? 'no rows')
    return refuse(UNAVAILABLE)
  }

  const rows = versions as VersionRow[]
  const version = rows.find((row) => row.id === versionId)

  if (version === undefined) {
    console.error('Rig Tune correction: no rig_tune Version', versionId)
    return refuse(UNAVAILABLE)
  }

  const crossed = crossedNeighbour(rows, version, built.input.effective_from)
  if (crossed !== null) {
    return refuse(HAS_PROBLEMS, [{ band_key: null, message: crossed }])
  }

  const recorded = version.bands ?? []
  const kept = new Set(built.input.bands.flatMap((band) => (band.id === null ? [] : [band.id])))

  // A recorded band's key is its row id, so a crafted draft could name another Version's
  // band. Refused here as well as in the function, without saying more than that it failed.
  if ([...kept].some((id) => !recorded.some((band) => band.id === id))) {
    console.error('Rig Tune correction: a band id is not one of', versionId, 'bands')
    return refuse(UNAVAILABLE)
  }

  const removed = recorded.filter((band) => !kept.has(band.id))

  if (removed.length > 0) {
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('title, window_start, rig_tune_band_id')
      .in(
        'rig_tune_band_id',
        removed.map((band) => band.id)
      )

    if (racesError || !races) {
      console.error('Rig Tune correction: Races read failed:', racesError?.message ?? 'no rows')
      return refuse(UNAVAILABLE)
    }

    const blocked = removed.flatMap((band) => {
      const sailed = (races as RaceOnBand[]).filter((race) => race.rig_tune_band_id === band.id)
      return sailed.length === 0 ? [] : [{ band_key: null, message: removalRefusal(band, sailed) }]
    })

    if (blocked.length > 0) return refuse(HAS_PROBLEMS, blocked)
  }

  // Never the current pointer and never a Race's: the function writes this Version's row and
  // its bands, in one transaction, and nothing else.
  const { error } = await supabase.rpc('correct_rig_tune_version', {
    p_version_id: versionId,
    p_effective_from: built.input.effective_from,
    p_note: built.input.note,
    p_bands: built.input.bands,
  })

  if (error) {
    console.error('Rig Tune correction: correction failed:', error.message)
    return refuse(UNAVAILABLE)
  }

  revalidatePath('/boat-management/rig-tune')
  // The Boat Setup list states the Version in force by its effective date.
  revalidatePath('/boat-management')
  // Every Race page renders the band it was set to, and the amend wizard offers the bands;
  // both are now showing the table as it was.
  revalidatePath('/boat-performance/races/[raceId]', 'layout')
  return { ok: true }
}

/**
 * Why the corrected date is out of order, or null when it is not.
 *
 * Which Version is in force on a date is answered by date (`versionInForceOn`), so a Version
 * dated before the one it followed would make that answer depend on which is asked about
 * first. Equal to a neighbour is allowed: two Versions on one day is a retune on the day.
 */
function crossedNeighbour(rows: VersionRow[], version: VersionRow, date: string): string | null {
  const previous = rows
    .filter((row) => row.version_number < version.version_number)
    .sort((a, b) => b.version_number - a.version_number)[0]
  const next = rows
    .filter((row) => row.version_number > version.version_number)
    .sort((a, b) => a.version_number - b.version_number)[0]

  // `YYYY-MM-DD` orders as text, which is why nothing here builds a Date.
  if (previous !== undefined && date < previous.effective_from) {
    return `v${previous.version_number} took effect on ${formatCalendarDate(previous.effective_from)}, so v${version.version_number} cannot take effect before it.`
  }

  if (next !== undefined && date > next.effective_from) {
    return `v${next.version_number} took effect on ${formatCalendarDate(next.effective_from)}, so v${version.version_number} cannot take effect after it.`
  }

  return null
}

/** The refusal for removing a band some Races were set to, naming each of them. */
function removalRefusal(
  band: { low_kt: number; high_kt: number | null },
  races: RaceOnBand[]
): string {
  const named = races.map((race) => {
    // The Race Window's own wall clock, so its date is the first ten characters as recorded.
    const day = formatCalendarDate(race.window_start.slice(0, 10))
    return race.title === null ? `an untitled race (${day})` : `${race.title} (${day})`
  })

  const one = named.length === 1
  const list = one ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`

  return `The ${formatBandRange(band.low_kt, band.high_kt)} band cannot be removed: ${list} ${
    one ? 'was' : 'were'
  } sailed set to it. Amend ${one ? 'that Race' : 'those Races'} onto another band first.`
}

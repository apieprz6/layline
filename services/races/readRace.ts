import { createClient } from '@/lib/supabase/server'
import { loggedTwsMean, windBandFinding } from '@/services/races/boat-setup'
import { coverageRowsFrom, raceCoverage, windowFindings } from '@/services/recordings/coverage'
import { raceWindowSeconds } from '@/services/recordings/race-window'
import { assessRowQuality, withinRaceWindow } from '@/services/recordings/row-quality'
import type { QualityAssessableRow } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type {
  BoatSetupVersionRef,
  RaceAnnotations,
  RaceBoatSetup,
  RaceDetail,
  SeaState,
  WindBandRef,
} from '@/types'

/**
 * One race, with everything its page states about itself.
 *
 * Coverage and Row Quality are computed here, at read, and stored nowhere (ADR 0009). That is what
 * lets the Dropout gates move without a migration, and it is why this reads the **whole**
 * Transcription rather than only the rows inside the window: a dropout beginning before the start
 * still froze the first rows of the race, and clipping first is what hid one archive recording's 146
 * frozen rows.
 *
 * Reading everything is also why this pages. A race is at most a few thousand rows, but PostgREST
 * caps a response at 1,000 by default, and a silently truncated Transcription would produce a
 * coverage figure that looked fine and described a third of the race — so the row count is checked
 * against the Recording's own, and a disagreement refuses the page rather than illustrating it.
 */

/**
 * The eight fields Row Quality and coverage read, and nothing else. A Transcription is 21 channels
 * wide and none of the other thirteen is consulted by either.
 *
 * The four measurements are cast to `text` in the request, so what arrives is the NUMERIC output
 * Postgres holds — which is the file's own bytes, by the round trip `qtvlm.ts` guarantees. Left as
 * JSON numbers they would arrive as JavaScript doubles, and a Dropout is found by comparing a row
 * to the one above it verbatim.
 */
const ROWS_SELECT =
  'row_index, row_time, latitude::text, longitude::text, cog::text, sog::text, stw::text, ctw::text, ' +
  // The ninth, and not one Row Quality reads: it is here for the mean wind the Wind Band is compared
  // against, which is derived at read and stored nowhere (ADR 0009).
  'tws::text'

/** PostgREST's own default ceiling on a response, which is what makes paging necessary at all. */
const PAGE_ROWS = 1000

const RACE_SELECT =
  'id, title, window_start, window_finish, ' +
  'polar_version_id, crossover_chart_version_id, rig_tune_version_id, ' +
  'instrument_calibration_version_id, rig_tune_band_id, ' +
  'recordings!inner(id, filename, first_row_time, last_row_time, source_columns, row_count)'

interface RaceRow {
  id: string
  title: string | null
  window_start: string
  window_finish: string
  /**
   * The four Version pointers and the Wind Band, each null where that answer was not recorded.
   *
   * Read as the ids the Race holds and resolved below by id — never by date and never through an
   * artifact's current pointer, which is what would rename an archived race's setup the next time the
   * page was opened (ADR 0012).
   */
  polar_version_id: string | null
  /** Null means the Race records no Crossover Chart Version, and so holds no Sail Configurations. */
  crossover_chart_version_id: string | null
  rig_tune_version_id: string | null
  instrument_calibration_version_id: string | null
  rig_tune_band_id: string | null
  recordings: {
    id: string
    filename: string
    first_row_time: string
    last_row_time: string
    source_columns: string[]
    row_count: number
  }
}

/** One row of the Transcription as this module reads it: Row Quality's eight, and TWS beside them. */
type RaceRowWithWind = QualityAssessableRow & { tws: string | null }

/** A Boat Setup Version as `boat_setup_versions` holds it, for the four pointers to resolve against. */
interface BoatSetupVersionRow {
  id: string
  kind: string
  version_number: number
  effective_from: string
}

interface WindBandRow {
  id: string
  low_kt: number
  high_kt: number | null
  is_base: boolean
  label: string | null
}

/** One Sail Configuration: the Definition number it names, the note beside it, or only the note. */
interface SailEntryRow {
  at: string
  definition_number: number | null
  note: string | null
}

/** One Sail Definition of the Version the Race points at, which is where the words come from. */
interface DefinitionRow {
  number: number
  label: string
}

interface SeaStateEntryRow {
  at: string
  sea_state: SeaState
}

/**
 * A cast column, as the cast promises it: text, or absent.
 *
 * A number here means the `::text` in `ROWS_SELECT` stopped being honoured, which would turn every
 * verbatim comparison into a comparison of doubles quietly. Throwing makes that a failed page with
 * a line in the log instead of Row Quality that is subtly wrong forever.
 */
function recordedText(value: unknown, column: string, rowIndex: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value

  throw new TypeError(
    `${column} of row ${rowIndex} came back as ${typeof value}; the ::text cast in ROWS_SELECT is ` +
      'what keeps a recorded value comparable verbatim'
  )
}

/**
 * The whole Transcription, a page at a time, or null when it could not be read in full.
 *
 * Ordered by `row_index`, which is file order and half the primary key, so the pages join back into
 * the file rather than into whatever order the planner liked.
 */
async function readTranscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordingId: string,
  rowCount: number
): Promise<RaceRowWithWind[] | null> {
  const rows: RaceRowWithWind[] = []

  // `row_count` is a fact about the file written once and immutable, so this bound is the file's
  // own and cannot loop away on a moving target.
  while (rows.length < rowCount) {
    const { data, error } = await supabase
      .from('recording_rows')
      .select(ROWS_SELECT)
      .eq('recording_id', recordingId)
      .order('row_index', { ascending: true })
      .range(rows.length, rows.length + PAGE_ROWS - 1)
      .returns<Record<string, unknown>[]>()

    if (error) {
      console.error('Race: Transcription read failed:', error.message)
      return null
    }

    if (!data || data.length === 0) break

    try {
      for (const row of data) {
        const rowIndex = Number(row.row_index)
        rows.push({
          row_index: rowIndex,
          row_time: String(row.row_time),
          latitude: recordedText(row.latitude, 'latitude', rowIndex),
          longitude: recordedText(row.longitude, 'longitude', rowIndex),
          cog: recordedText(row.cog, 'cog', rowIndex),
          sog: recordedText(row.sog, 'sog', rowIndex),
          stw: recordedText(row.stw, 'stw', rowIndex),
          ctw: recordedText(row.ctw, 'ctw', rowIndex),
          tws: recordedText(row.tws, 'tws', rowIndex),
        })
      }
    } catch (thrown: unknown) {
      // The cast stopped being honoured, which is a deployment fault and not a bad race. Caught
      // here so it is one line in the log and a not-found page, rather than an exception thrown
      // through a Server Component.
      console.error(
        'Race: a recorded value did not arrive as text:',
        thrown instanceof Error ? thrown.message : thrown
      )
      return null
    }
  }

  if (rows.length !== rowCount) {
    // Either the read was truncated or the Transcription is short of what the Recording claims.
    // Both make every figure on the page a claim about rows nobody has, so neither is illustrated.
    console.error(
      `Race: read ${rows.length} rows of a Transcription the Recording says is ${rowCount}`
    )
    return null
  }

  return rows
}

/**
 * The two annotation lists, earliest first, or null when either could not be read.
 *
 * Null rather than empty, and that distinction is the whole of this function's care: an empty list
 * means the sailor did not record that kind, and the page says so in words (ADR 0010). A failed read
 * rendered as an empty list would put those words on a race that *was* annotated — Layline stating
 * that the sailor said nothing, which is the one thing a page about Testimony must never do.
 *
 * A Sail Configuration names a Sail Definition *number*, and the words belong to the Crossover Chart
 * Version the Race points at (ADR 0023). So the labels are read from that Version's own
 * `crossover_sail_definitions` rows in a second request rather than embedded through the composite
 * foreign key: PostgREST will not follow a two-column key, and the alternative — resolving through
 * the artifact's current pointer — is exactly the read-time resolution ADR 0012 forbids.
 */
async function readAnnotations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raceId: string,
  chartVersionId: string | null
): Promise<RaceAnnotations | null> {
  const [sails, seaState] = await Promise.all([
    supabase
      .from('race_sail_entries')
      .select('at, definition_number, note')
      .eq('race_id', raceId)
      .order('at', { ascending: true })
      .returns<SailEntryRow[]>(),
    supabase
      .from('race_sea_state_entries')
      .select('at, sea_state')
      .eq('race_id', raceId)
      .order('at', { ascending: true })
      .returns<SeaStateEntryRow[]>(),
  ])

  if (sails.error || seaState.error) {
    console.error(
      'Race: annotation read failed:',
      sails.error?.message ?? seaState.error?.message ?? 'no rows and no error'
    )
    return null
  }

  const entries = sails.data ?? []
  const labels = new Map<number, string>()

  // Asked for only when something actually names a Definition. A Race with no chart Version can hold
  // no Configurations at all, and a race remembered entirely in notes needs no vocabulary.
  if (chartVersionId !== null && entries.some((entry) => entry.definition_number !== null)) {
    const { data, error } = await supabase
      .from('crossover_sail_definitions')
      .select('number, label')
      .eq('version_id', chartVersionId)
      .returns<DefinitionRow[]>()

    if (error) {
      console.error('Race: Sail Definition read failed:', error.message)
      return null
    }

    for (const definition of data ?? []) labels.set(definition.number, definition.label)
  }

  const resolved = entries.map((entry) => ({
    at: entry.at,
    definition_number: entry.definition_number,
    label: entry.definition_number === null ? null : labels.get(entry.definition_number) ?? null,
    note: entry.note,
  }))

  // A Definition the Version does not define cannot exist — that is what the composite key
  // `(crossover_chart_version_id, definition_number)` is for — so a missing label means this read
  // saw less than the whole of it. Rendering the number bare would be the page inventing a sail name
  // out of an integer, so the page states nothing instead.
  if (resolved.some((entry) => entry.definition_number !== null && entry.label === null)) {
    console.error(
      `Race: a Sail Configuration names a Definition Version ${chartVersionId} did not return`
    )
    return null
  }

  return {
    sails: resolved,
    sea_state: (seaState.data ?? []).map((entry) => ({
      at: entry.at,
      sea_state: entry.sea_state,
    })),
  }
}

/**
 * The Boat Setup the race was sailed under: four Version pointers and the Wind Band, resolved by id.
 *
 * By id, and only by id. Resolving any of these by date, or through the artifact's `current_version_id`,
 * would make an archived race's Boat Setup change under it whenever the boat gets a new Polar — which is
 * the whole of what ADR 0012 forbids and the reason these are columns on `races` rather than a lookup.
 *
 * Null per pointer means *not recorded* and reads as those words on the page. It is an ordinary answer:
 * the oldest races in this archive predate every Boat Setup artifact the boat has, and nothing backdates
 * v1 onto them (ADR 0008).
 *
 * Two reads rather than an embed, for the same reason `readAnnotations` does two: every one of these
 * pointers is half of a composite key with a constant `kind` tag column, and PostgREST will not follow a
 * two-column key.
 *
 * Null *in place of the whole thing* is a failed read, and takes the page with it — the same
 * all-or-nothing the Transcription and the annotations get. A page that quietly said "Polar not
 * recorded" because a read failed would be Layline making a claim about the boat.
 */
async function readBoatSetup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  race: RaceRow,
  loggedTws: number | null
): Promise<RaceBoatSetup | null> {
  const pointers = [
    race.polar_version_id,
    race.crossover_chart_version_id,
    race.rig_tune_version_id,
    race.instrument_calibration_version_id,
  ]
  const wanted = [...new Set(pointers.filter((id): id is string => id !== null))]

  const versions = new Map<string, BoatSetupVersionRow>()

  if (wanted.length > 0) {
    const { data, error } = await supabase
      .from('boat_setup_versions')
      .select('id, kind, version_number, effective_from')
      .in('id', wanted)
      .returns<BoatSetupVersionRow[]>()

    if (error) {
      console.error('Race: Boat Setup Version read failed:', error.message)
      return null
    }

    for (const version of data ?? []) versions.set(version.id, version)

    // Every one of these pointers is a foreign key with `ON DELETE RESTRICT`, so a Version a Race names
    // cannot have gone. One missing means this read saw less than the whole of it, and a page that then
    // said "not recorded" would be stating the opposite of what the Race holds. Named rather than
    // counted, because what matters is that *these* ids came back.
    const missing = wanted.filter((id) => !versions.has(id))

    if (missing.length > 0) {
      console.error(`Race: Boat Setup Version(s) this Race names did not come back: ${missing}`)
      return null
    }
  }

  let band: WindBandRef | null = null

  if (race.rig_tune_band_id !== null) {
    const { data, error } = await supabase
      .from('rig_tune_bands')
      .select('id, low_kt, high_kt, is_base, label')
      .eq('id', race.rig_tune_band_id)
      .maybeSingle<WindBandRow>()

    if (error || !data) {
      console.error(
        'Race: Wind Band read failed:',
        error?.message ?? 'the band this Race names did not come back'
      )
      return null
    }

    band = {
      band_id: data.id,
      low_kt: data.low_kt,
      high_kt: data.high_kt,
      is_base: data.is_base,
      label: data.label,
    }
  }

  const ref = (id: string | null): BoatSetupVersionRef | null => {
    if (id === null) return null
    const version = versions.get(id)
    if (version === undefined) return null
    return {
      version_id: version.id,
      version_number: version.version_number,
      effective_from: version.effective_from,
    }
  }

  return {
    polar: ref(race.polar_version_id),
    crossover_chart: ref(race.crossover_chart_version_id),
    rig_tune: ref(race.rig_tune_version_id),
    instrument_calibration: ref(race.instrument_calibration_version_id),
    band,
    logged_tws_mean: loggedTws,
  }
}

/**
 * One race, or null when it cannot be read whole.
 *
 * All-or-nothing for the same reason `readBoatSetup` is: half this page would have to state a
 * coverage figure over rows it does not have, and a coverage figure is the one thing the page exists
 * to say. A missing race and an unreadable one both come back null — RLS makes them
 * indistinguishable anyway — and the page renders a not-found rather than an empty race.
 */
export async function readRace(raceId: string): Promise<RaceDetail | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Race: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  const { data: race, error } = await supabase
    .from('races')
    .select(RACE_SELECT)
    .eq('id', raceId)
    .maybeSingle<RaceRow>()

  if (error) {
    console.error('Race: read failed:', error.message)
    return null
  }

  // No row and a row RLS hid are the same answer through `maybeSingle()`, and both are "there is no
  // race here for you", which is what the page says.
  if (!race) return null

  const rows = await readTranscription(supabase, race.recordings.id, race.recordings.row_count)
  if (!rows) return null

  // All-or-nothing, like the Transcription: a page that could not read the Testimony would otherwise
  // state that none was given.
  const annotations = await readAnnotations(supabase, race.id, race.crossover_chart_version_id)
  if (!annotations) return null

  try {
    // Assessed over the whole Transcription, then filtered — in that order, always (ADR 0009).
    const whole = assessRowQuality(rows)
    const window = raceWindowSeconds(race)
    const coverage = raceCoverage(coverageRowsFrom(whole), window)
    const inWindow = withinRaceWindow(whole, race)

    // The mean wind the recording logged over the window, derived here and stored nowhere. The wizard's
    // Review step derives the same figure the same way from the same rows, so the sentence a sailor read
    // while choosing the band is the sentence its page now states.
    const loggedTws = loggedTwsMean(
      rows.map((row) => ({
        at: wallClockSeconds(row.row_time),
        tws: row.tws === null ? null : Number(row.tws),
      })),
      window
    )

    // All-or-nothing like the other two: the pointers are what the page's Boat Setup section is.
    const boatSetup = await readBoatSetup(supabase, race, loggedTws)
    if (!boatSetup) return null

    // A band that disagrees with the logged wind is a note beside the other findings and never a
    // refusal. The band is what the rig was actually set to, and a race sailed on the wrong band for the
    // day is a thing that happened — ADR 0009 keeps refusals to two, and this is neither of them.
    const bandNote = windBandFinding(boatSetup.band, boatSetup.logged_tws_mean)

    return {
      id: race.id,
      title: race.title,
      window_start: race.window_start,
      window_finish: race.window_finish,
      recording: {
        id: race.recordings.id,
        filename: race.recordings.filename,
        first_row_time: race.recordings.first_row_time,
        last_row_time: race.recordings.last_row_time,
        source_columns: race.recordings.source_columns,
      },
      coverage,
      quality: inWindow,
      findings: [
        ...windowFindings(coverage, inWindow),
        ...(bandNote === null ? [] : [bandNote]),
      ],
      annotations,
      boat_setup: boatSetup,
    }
  } catch (thrown: unknown) {
    // A stamp the wall clock refuses: a fractional second, or an offset, in a column Layline only
    // ever writes whole naive seconds to.
    console.error(
      'Race: a recorded time is not a naive wall-clock stamp:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }
}

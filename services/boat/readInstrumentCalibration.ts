import { createClient } from '@/lib/supabase/server'
import type {
  CalibrationEvent,
  InstrumentCalibrationRecord,
  InstrumentCalibrationVersion,
} from '@/types'

/**
 * Reading the **Instrument Calibration** artifact whole: every Version ever minted,
 * and every **Calibration Event** ever written down.
 *
 * Three reads and no projection. The **Calibration Log** is assembled from these two
 * lists by `lib/boat/calibrationLog.ts`, and nothing here stores, caches or
 * denormalises any part of it — the Log is a view over what is already recorded, so
 * there is nothing for a read to write.
 *
 * Every signed-in sailor reads all of it: `boat_setup_versions` and
 * `calibration_events` both have a SELECT policy for `authenticated` with no Role
 * test, because Role governs writes only (ADR 0019). So this takes no Account.
 */

/** Every column of a Version, named rather than `*`, so the row shape is the type's. */
const VERSION_COLUMNS =
  'id, artifact_id, kind, version_number, effective_from, recorded_at, note, created_by, filename, content_sha256, payload'

const EVENT_COLUMNS =
  'id, artifact_id, kind, occurred_on, type, channels, note, created_by, created_at, updated_at'

/**
 * The artifact and everything recorded against it, or `null` when it cannot be read.
 *
 * `null` is all-or-nothing on purpose, as it is for `readBoatSetup`: a Log missing
 * the half of itself that failed to load would read as a complete history with
 * entries silently absent, which is worse than saying the read failed.
 */
export async function readInstrumentCalibration(): Promise<InstrumentCalibrationRecord | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Instrument Calibration: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  // `boat_setup_artifacts` is UNIQUE (boat_id, kind) and there is exactly one boat
  // (`boats_singleton`), so the kind alone identifies the row. No boat_id filter, for
  // the same reason `saveBoatIdentity` takes no id from its caller.
  const { data: artifact, error: artifactError } = await supabase
    .from('boat_setup_artifacts')
    .select('id, current_version_id')
    .eq('kind', 'instrument_calibration')
    .maybeSingle<{ id: string; current_version_id: string | null }>()

  if (artifactError) {
    console.error('Instrument Calibration: artifact read failed:', artifactError.message)
    return null
  }

  // The migration seeds four artifact rows, so no row means either RLS hid it — the
  // two are indistinguishable through `maybeSingle()` — or the migration has not run.
  if (!artifact) {
    console.error('Instrument Calibration: no artifact row is readable')
    return null
  }

  const { data: versions, error: versionsError } = await supabase
    .from('boat_setup_versions')
    .select(VERSION_COLUMNS)
    .eq('artifact_id', artifact.id)
    .order('version_number', { ascending: true })
    .returns<InstrumentCalibrationVersion[]>()

  if (versionsError) {
    console.error('Instrument Calibration: versions read failed:', versionsError.message)
    return null
  }

  const { data: events, error: eventsError } = await supabase
    .from('calibration_events')
    .select(EVENT_COLUMNS)
    .eq('artifact_id', artifact.id)
    .order('occurred_on', { ascending: true })
    .returns<CalibrationEvent[]>()

  if (eventsError) {
    console.error('Instrument Calibration: events read failed:', eventsError.message)
    return null
  }

  return {
    artifactId: artifact.id,
    currentVersionId: artifact.current_version_id,
    versions: versions ?? [],
    events: events ?? [],
  }
}

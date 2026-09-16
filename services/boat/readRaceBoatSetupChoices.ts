import { createClient } from '@/lib/supabase/server'
import type { BoatSetupVersionRef, RaceBoatSetupChoices, RigTuneChoice, WindBandRef } from '@/types'

/**
 * Every Polar, Rig Tune and Instrument Calibration Version a Race could name, with each Rig Tune
 * Version's own Wind Bands.
 *
 * The companion to `readCrossoverChartChoices`, and deliberately the same shape: every Version comes
 * back rather than only the one in force, and the caller decides which to offer. The archive is
 * hand-entered backwards, so most races recorded here were sailed under a Polar the boat has since
 * replaced, and a race sailed under v1 has to be able to name v1. Which Version a given recording
 * defaults to is `versionInForceOn`'s answer, from the recording's own start time (ADR 0012).
 *
 * The chart is not among the three. LAY-130 already reads it, with its sail vocabulary attached,
 * because a Sail Configuration points into it — reading it twice would give the wizard two lists that
 * could disagree.
 *
 * The bands are read as rows and kept with the Version they belong to, because that is what the
 * `(rig_tune_version_id, rig_tune_band_id)` composite key on `races` points at: a picker built from
 * them cannot offer a band the key would then refuse, which is what keeps a band from migrating
 * across Versions (ADR 0007).
 *
 * Read by every signed-in sailor: both tables have a SELECT policy for `authenticated` with no Role
 * test, because Role governs writes only (ADR 0019).
 */

interface VersionRow {
  id: string
  kind: string
  version_number: number
  effective_from: string
}

interface BandRow {
  id: string
  version_id: string
  low_kt: number
  high_kt: number | null
  is_base: boolean
  label: string | null
}

/** The three kinds this reader answers for. The chart is LAY-130's, and files are nobody's here. */
const KINDS = ['polar', 'rig_tune', 'instrument_calibration'] as const

const ref = (row: VersionRow): BoatSetupVersionRef => ({
  version_id: row.id,
  version_number: row.version_number,
  effective_from: row.effective_from,
})

/**
 * Null is "this read failed", and is not the same answer as three empty lists — which is what a boat
 * with no Boat Setup artifacts yet legitimately has, and is why every pointer is nullable.
 */
export async function readRaceBoatSetupChoices(): Promise<RaceBoatSetupChoices | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Boat Setup choices: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  // `kind` is the constant tag column every Version carries, so all three artifacts' Versions come
  // back in one read without touching the artifact rows (ADR 0011).
  //
  // The band bounds are read as numbers rather than through a `::text` cast, matching `readRigTune`:
  // a bound is a knot figure the picker compares and prints, not a transcribed value whose precision
  // has to survive a round trip.
  const [versions, bands] = await Promise.all([
    supabase
      .from('boat_setup_versions')
      .select('id, kind, version_number, effective_from')
      .in('kind', KINDS)
      .order('version_number', { ascending: false })
      .returns<VersionRow[]>(),
    supabase
      .from('rig_tune_bands')
      .select('id, version_id, low_kt, high_kt, is_base, label')
      .order('low_kt', { ascending: true })
      .returns<BandRow[]>(),
  ])

  if (versions.error || bands.error) {
    console.error(
      'Boat Setup choices: read failed:',
      versions.error?.message ?? bands.error?.message ?? 'no rows and no error'
    )
    return null
  }

  const byVersion = new Map<string, WindBandRef[]>()
  for (const row of bands.data ?? []) {
    const band: WindBandRef = {
      band_id: row.id,
      low_kt: row.low_kt,
      high_kt: row.high_kt,
      is_base: row.is_base,
      label: row.label,
    }
    const held = byVersion.get(row.version_id)
    if (held) held.push(band)
    else byVersion.set(row.version_id, [band])
  }

  const rows = versions.data ?? []
  const rigTunes: RigTuneChoice[] = []

  for (const row of rows) {
    if (row.kind !== 'rig_tune') continue
    const held = byVersion.get(row.id)
    // A Rig Tune Version with no bands cannot be minted — `mint_rig_tune_version` refuses one,
    // because a tune with no Base Tune is not a tune (ADR 0007) — so an empty list here means this
    // read saw less than the whole of it, and a band picker built from it would offer nothing while
    // looking as though the Version has no bands.
    if (held === undefined || held.length === 0) {
      console.error('Boat Setup choices: a Rig Tune Version came back with no Wind Bands')
      return null
    }
    rigTunes.push({ ...ref(row), bands: held })
  }

  return {
    polar: rows.filter((row) => row.kind === 'polar').map(ref),
    rig_tune: rigTunes,
    instrument_calibration: rows
      .filter((row) => row.kind === 'instrument_calibration')
      .map(ref),
  }
}

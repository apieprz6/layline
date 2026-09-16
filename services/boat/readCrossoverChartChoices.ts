import { createClient } from '@/lib/supabase/server'
import type { CrossoverChartChoice, CrossoverSailDefinitionRow } from '@/types'

/**
 * Every Crossover Chart Version, with the vocabulary each of them defines.
 *
 * This is the whole of what the upload wizard's sails step has to work with, because ADR 0023 left
 * Layline one sail vocabulary and it belongs to the chart: a Sail Configuration names a Sail
 * Definition of the Version the Race points at, and there is no inventory beside it to fall back on.
 *
 * Every Version comes back, not only the one in force, and the *caller* decides which to offer. The
 * archive is hand-entered, so most races annotated here were sailed under a chart the boat has since
 * replaced — and a race sailed under v1 has to be able to name v1's sails in v1's own words. Which
 * Version a given recording defaults to is `chartInForceOn`'s answer, from the recording's own start
 * time.
 *
 * The Definitions are read as rows rather than out of each Version's payload. Both hold the same
 * pairs, written from the same parse in the same transaction, but the rows are what
 * `race_sail_entries` points at — so a picker built from them cannot offer a Definition that the
 * composite key would then refuse.
 *
 * Read by every signed-in sailor: both tables have a SELECT policy for `authenticated` with no Role
 * test, because Role governs writes only (ADR 0019).
 */

interface VersionRow {
  id: string
  version_number: number
  effective_from: string
}

/** Empty is not the same answer as null, and neither is a chart. */
export async function readCrossoverChartChoices(): Promise<CrossoverChartChoice[] | null> {
  let supabase: Awaited<ReturnType<typeof createClient>>

  try {
    supabase = await createClient()
  } catch (thrown: unknown) {
    console.error(
      'Crossover Chart: Supabase client unavailable:',
      thrown instanceof Error ? thrown.message : thrown
    )
    return null
  }

  // `kind` is the constant tag column every Version carries, so the Versions of one artifact are
  // selectable without reading the artifact row first (ADR 0011).
  const [versions, definitions] = await Promise.all([
    supabase
      .from('boat_setup_versions')
      .select('id, version_number, effective_from')
      .eq('kind', 'crossover_chart')
      .order('version_number', { ascending: false })
      .returns<VersionRow[]>(),
    supabase
      .from('crossover_sail_definitions')
      .select('version_id, number, label')
      .order('number', { ascending: true })
      .returns<Pick<CrossoverSailDefinitionRow, 'version_id' | 'number' | 'label'>[]>(),
  ])

  if (versions.error || definitions.error) {
    console.error(
      'Crossover Chart: choices read failed:',
      versions.error?.message ?? definitions.error?.message ?? 'no rows and no error'
    )
    return null
  }

  const byVersion = new Map<string, CrossoverChartChoice['definitions']>()
  for (const row of definitions.data ?? []) {
    const held = byVersion.get(row.version_id)
    if (held) held.push({ number: row.number, label: row.label })
    else byVersion.set(row.version_id, [{ number: row.number, label: row.label }])
  }

  // A Version with no Definitions cannot be minted — `mint_boat_setup_version` refuses one, because a
  // chart whose cells resolve against nothing is not a chart — so an empty list here means this read
  // saw less than the whole of it, and offering that Version would offer a picker with no chips in it.
  const whole = (versions.data ?? []).filter((version) => byVersion.has(version.id))

  if (whole.length !== (versions.data ?? []).length) {
    console.error(
      'Crossover Chart: a Version came back with no Sail Definitions, which minting refuses'
    )
    return null
  }

  return whole.map((version) => ({
    version_id: version.id,
    version_number: version.version_number,
    effective_from: version.effective_from,
    definitions: byVersion.get(version.id) ?? [],
  }))
}

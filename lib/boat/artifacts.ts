import type { BoatSetupKind } from '@/types'

/**
 * The four **Boat Setup** artifacts as the app reads them: their order, their
 * names, and where each one's detail lives.
 *
 * Pure and React-free, so the screen and anything that later derives from a kind
 * cannot disagree about which four there are or what they are called.
 */

/**
 * Reading order: Polar, Crossover Chart, Rig Tune, Instrument Calibration.
 *
 * A property of the vocabulary rather than of the table — `boat_setup_kind`'s
 * enum order happens to match today, but PostgREST promises no ordering without an
 * ORDER BY and an enum is reordered by a migration.
 */
export const BOAT_SETUP_ORDER = [
  'polar',
  'crossover_chart',
  'rig_tune',
  'instrument_calibration',
] as const satisfies readonly BoatSetupKind[]

/** What the sailor sees. The CONTEXT.md spelling exactly, capitals included. */
export const BOAT_SETUP_LABEL: Record<BoatSetupKind, string> = {
  polar: 'Polar',
  crossover_chart: 'Crossover Chart',
  rig_tune: 'Rig Tune',
  instrument_calibration: 'Instrument Calibration',
}

/**
 * The route segment an artifact's detail lives at. Kebab-case rather than the
 * enum's snake_case, because it is a URL a sailor may read and share.
 *
 * The Rig Tune's screen exists (LAY-107). The other three arrive with the upload and
 * form flows in LAY-106 and LAY-108, so nothing links to those until then.
 */
const BOAT_SETUP_SLUG: Record<BoatSetupKind, string> = {
  polar: 'polar',
  crossover_chart: 'crossover-chart',
  rig_tune: 'rig-tune',
  instrument_calibration: 'instrument-calibration',
}

export function boatSetupHref(kind: BoatSetupKind): string {
  return `/boat-management/${BOAT_SETUP_SLUG[kind]}`
}

/** The kinds whose detail screen is built. A row leading to a 404 is worse than an inert one. */
const BUILT: readonly BoatSetupKind[] = ['rig_tune']

/**
 * Whether an artifact with **no Version** is still worth opening.
 *
 * Only for someone who may write, and only where the screen exists: a Rig Tune is a form,
 * so its screen is where an unrecorded artifact stops being unrecorded. Leaving the row
 * inert until a Version exists would leave the first Version with nowhere to be typed.
 * For a viewer it stays inert, because there is genuinely nothing to read.
 */
export function opensUnrecorded(kind: BoatSetupKind, canWrite: boolean): boolean {
  return canWrite && BUILT.includes(kind)
}

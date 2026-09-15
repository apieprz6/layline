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
 * None of the four routes exists yet — they arrive with the upload and form flows in
 * LAY-106 to LAY-108. Nothing links to one until then either: a row is only made a
 * link once it has a Version to open, and on an empty archive there are none.
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

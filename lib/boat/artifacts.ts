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
 * The four routes arrive with the upload and form flows in LAY-106 to LAY-108;
 * `BOAT_SETUP_DETAIL_BUILT` says which are here.
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

/**
 * The kinds whose detail screen exists. Add a kind here when its route lands.
 *
 * LAY-104 gated the list's link on a Version being recorded, on the reasoning that a
 * row leading to an empty screen is a row dressed as a control. That was right while
 * no detail screen existed and wrong the moment one did: **recording the first Version
 * is something the detail screen is for**, so a link gated on a current pointer leaves
 * an empty archive — which is the state this app ships in — with no way to fill itself.
 *
 * So the gate is the screen, not the pointer. A kind absent from here is still inert
 * text, because that row genuinely leads nowhere.
 */
const BOAT_SETUP_DETAIL_BUILT: readonly BoatSetupKind[] = ['instrument_calibration']

export function hasDetailScreen(kind: BoatSetupKind): boolean {
  return BOAT_SETUP_DETAIL_BUILT.includes(kind)
}

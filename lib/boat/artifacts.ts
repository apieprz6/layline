import type { BoatSetupKind, FileBackedBoatSetupKind } from '@/types'

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
 */
const BOAT_SETUP_SLUG: Record<BoatSetupKind, string> = {
  polar: 'polar',
  crossover_chart: 'crossover-chart',
  rig_tune: 'rig-tune',
  instrument_calibration: 'instrument-calibration',
}

/**
 * The kinds whose detail screen exists. The Polar's arrived with LAY-106; the
 * Crossover Chart's and the two hand-entered forms follow in LAY-107 and LAY-108.
 *
 * Read by the list to decide whether a row may be a link at all, so nothing on the
 * screen leads anywhere that is not built. It disappears when the fourth one lands.
 */
export const BOAT_SETUP_DETAIL_BUILT = ['polar'] as const satisfies readonly BoatSetupKind[]

export function hasDetailScreen(kind: BoatSetupKind): boolean {
  return (BOAT_SETUP_DETAIL_BUILT as readonly BoatSetupKind[]).includes(kind)
}

export function boatSetupHref(kind: BoatSetupKind): string {
  return `/boat-management/${BOAT_SETUP_SLUG[kind]}`
}

/** One Version's own screen, which every Version has whether or not it is the one in force. */
export function boatSetupVersionHref(kind: BoatSetupKind, versionId: string): string {
  return `${boatSetupHref(kind)}/${versionId}`
}

/**
 * Where a Version's original bytes are downloaded from. Only the two file-backed kinds have
 * bytes at all, which is why the type says so.
 */
export function boatSetupDownloadHref(
  kind: FileBackedBoatSetupKind,
  versionId: string
): string {
  return `/api/boat-setup/${BOAT_SETUP_SLUG[kind]}/${versionId}/download`
}

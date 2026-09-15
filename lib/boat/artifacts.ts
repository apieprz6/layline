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
 *
 * All four answer. There is no longer a list of which ones do: the Polar (LAY-106), the
 * Rig Tune (LAY-107), the Instrument Calibration (LAY-108) and now the Crossover Chart
 * (LAY-109) each have a screen, so a gate would only ever say "yes".
 *
 * The gate that stood here was never the *pointer*, and this is worth keeping said.
 * LAY-104 gated the Boat Setup list's link on a Version being recorded, on the
 * reasoning that a row leading to an empty screen is a row dressed as a control. That
 * was right while no detail screen existed and wrong the moment one did: **recording
 * the first Version is something the detail screen is for**, so a link gated on a
 * current pointer leaves an empty archive — which is the state this app ships in —
 * with no way to fill itself.
 *
 * Nor is it the *role*: a viewer opening the Rig Tune with nothing recorded reads why
 * there is nothing to read (ADR 0019 governs writes only), which is an answer about the
 * boat and worth a screen.
 */
export const BOAT_SETUP_SLUG: Record<BoatSetupKind, string> = {
  polar: 'polar',
  crossover_chart: 'crossover-chart',
  rig_tune: 'rig-tune',
  instrument_calibration: 'instrument-calibration',
}

export function boatSetupHref(kind: BoatSetupKind): string {
  return `/boat-management/${BOAT_SETUP_SLUG[kind]}`
}

/** One Version's own screen, which every Version has whether or not it is the one in force. */
export function boatSetupVersionHref(kind: BoatSetupKind, versionId: string): string {
  return `${boatSetupHref(kind)}/${versionId}`
}

/**
 * Which file of a Version to download, for the one kind whose Version is backed by two.
 *
 * A Crossover Chart absorbs its Sail Definitions (ADR 0012), so one Version has two source files
 * under one Storage prefix. `definitions` asks for the second; absent asks for the file the
 * artifact is named for, which is the only file every other file-backed kind has.
 */
export type BoatSetupFileSelector = 'definitions'

/**
 * Where a Version's original bytes are downloaded from. Only the two file-backed kinds have
 * bytes at all, which is why the type says so.
 */
export function boatSetupDownloadHref(
  kind: FileBackedBoatSetupKind,
  versionId: string,
  file?: BoatSetupFileSelector
): string {
  const href = `/api/boat-setup/${BOAT_SETUP_SLUG[kind]}/${versionId}/download`

  return file === undefined ? href : `${href}?file=${file}`
}

/**
 * Reading the **Polar**'s Versions.
 *
 * The queries live in `readFileBackedVersions`, which both file-backed kinds share — a Polar and a
 * Crossover Chart differ only inside the payload, and the only thing the reader does with a payload
 * is hand it to the schema that owns it. What is here is the Polar's own three answers to that
 * reader: which kind, what to call itself in a log line, and which schema decides whether a stored
 * payload is still a grid.
 */

import { validatePolarPayload } from '@/services/boat/polarPayload'
import { fileBackedVersionReader } from '@/services/boat/readFileBackedVersions'
import type { PolarScreen, PolarVersionDetail, PolarVersionList } from '@/types'

const polar = fileBackedVersionReader({
  kind: 'polar',
  label: 'Polar',
  payloadIs: 'a grid',
  validate: validatePolarPayload,
})

/**
 * Every Polar Version, newest first, or `null` when the read failed.
 *
 * `null` is not an empty archive. An empty archive is `versions: []`, which is the state the app
 * ships in and which the screen says *not recorded* to; a failed read is reported as one.
 */
export function readPolarVersions(): Promise<PolarVersionList | null> {
  return polar.readVersions()
}

/** One Polar Version with its grid, or `null` when there is no such Version to read. */
export function readPolarVersion(versionId: string): Promise<PolarVersionDetail | null> {
  return polar.readVersion(versionId)
}

/** The list and the grid in force together, for the screen that shows both. */
export function readPolarScreen(): Promise<PolarScreen | null> {
  return polar.readScreen()
}

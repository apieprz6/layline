/**
 * Storage paths for the `boat` bucket.
 *
 * This module is the *only* implementation of the path convention fixed by
 * supabase/migrations/20260909190000_create_boat_storage_bucket.sql:
 *
 *   recordings/{recording_id}/{filename}         one qtVlm VDR export, as one Recording
 *   boat-setup/{kind}/{version_id}/{filename}    one file-backed Boat Setup Version
 *   tmp/{user_id}/{upload_id}/{filename}         an upload wizard not yet submitted
 *
 * There is deliberately no SQL equivalent. Paths are derived from an id plus the stored
 * `filename` and never stored, so a second implementation would be a second thing to drift
 * — which is what "derive, don't store" exists to avoid. Anything that needs a path in the
 * database goes through here on the way in and out.
 *
 * Nothing ever parses a path to recover a filename: the verbatim original is a column on
 * the row, which is why sanitising here loses nothing.
 */

import type { FileBackedBoatSetupKind } from '@/types'

/** The single private bucket, created by the storage migration. */
export const BOAT_BUCKET = 'boat'

/**
 * storage-api's own object-key charset. Everything outside it is replaced rather than
 * rejected, because the sailor's filename is data and a rejected upload would be a
 * refusal Layline has no reason to make.
 *
 * `\w` is ASCII-only, so `régate.csv` becomes `r_gate.csv`.
 */
const STORAGE_KEY_SAFE = /[^\w!\-.*'() &$@=;:+,?]/g

/** Reject an id that would put a hole or an extra segment in the path. */
function assertPathSegment(value: string, what: string): void {
  if (value === '' || value.trim() === '') {
    throw new TypeError(`${what} is required to derive a Storage path`)
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new TypeError(`${what} may not contain a path separator: ${JSON.stringify(value)}`)
  }
}

/**
 * The sailor's filename, sanitised only as far as a Storage key requires.
 *
 * Throws when there is nothing left to name — an empty or all-separator filename is a bug
 * upstream, and silently inventing a name would hide it.
 */
export function storageSafeFilename(filename: string): string {
  // Basename first: a filename should never carry a directory, and one that does would
  // otherwise be sanitised into a path segment that climbs out of its prefix.
  const basename = filename.split(/[/\\]/).pop() ?? ''
  const safe = basename.replace(STORAGE_KEY_SAFE, '_').trim()

  if (safe === '' || safe === '.' || safe === '..') {
    throw new TypeError(`filename has no usable name: ${JSON.stringify(filename)}`)
  }

  return safe
}

/** `recordings/{recording_id}/{filename}` — keyed on the Recording, never on the Race. */
export function recordingObjectPath(recordingId: string, filename: string): string {
  assertPathSegment(recordingId, 'recording id')
  return `recordings/${recordingId}/${storageSafeFilename(filename)}`
}

/**
 * `boat-setup/{kind}/{version_id}/{filename}` — `{kind}` is the `boat_setup_kind` label
 * verbatim, so there is no mapping to get wrong.
 *
 * Only the two file-backed kinds have a path. A Rig Tune and an Instrument Calibration are
 * entered by hand and reach Storage never; asking for one is the mockup's
 * `Wayward_Wind.rig` mistake, so it is refused at runtime as well as in the type.
 */
export function boatSetupObjectPath(
  kind: FileBackedBoatSetupKind,
  versionId: string,
  filename: string
): string {
  if (kind !== 'polar' && kind !== 'crossover_chart') {
    throw new TypeError(`a ${kind} Version is entered by hand and has no Storage path`)
  }
  assertPathSegment(versionId, 'version id')
  return `boat-setup/${kind}/${versionId}/${storageSafeFilename(filename)}`
}

/**
 * `tmp/{user_id}/{upload_id}/{filename}` — where bytes land before wizard submit, so an
 * abandoned wizard leaves a cleanable object and never a half-built race (ADR 0013).
 *
 * Both ids are there for cleanup attribution, not enforcement: the write policy is
 * admin-only and reads neither.
 */
export function tmpUploadObjectPath(
  userId: string,
  uploadId: string,
  filename: string
): string {
  assertPathSegment(userId, 'user id')
  assertPathSegment(uploadId, 'upload id')
  return `tmp/${userId}/${uploadId}/${storageSafeFilename(filename)}`
}

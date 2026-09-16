/**
 * Which Boat Setup Version was current on a given day.
 *
 * A Race freezes the four Versions it was sailed under, and every one of them defaults to whatever
 * was current at the recording's start (ADR 0012). So the answer is needed once — filling the
 * wizard's pickers in, and again when a sailor amends one — and never at read: a Polar minted next
 * winter must not silently become the Polar last summer's race was sailed under.
 *
 * Client-safe on purpose. The Review step needs this the moment the sailor lands on it, and the
 * default it chooses has to be visible and changeable there rather than decided on a server the
 * sailor cannot argue with.
 */

import type { BoatSetupVersionRef } from '@/types'

/** A calendar day, optionally with a naive time after it. No offset, ever. */
const NAIVE_DAY = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/

/**
 * The Version in force on a day: the latest that had taken effect by then, or null.
 *
 * Null is a real answer and the reason this returns one. A recording from before the boat's first
 * Version of that kind was sailed under no Version Layline knows of, and backdating v1 onto it would
 * assert an artifact the boat did not have yet — so the pointer stays null, which reads *not
 * recorded*. ADR 0008: a missing value is stored as missing, never as a plausible one.
 *
 * `on` is the recording's own start time, in its own naive frame — a stamp or a bare `YYYY-MM-DD`,
 * since only the day matters here. A stamp carrying an offset is refused rather than resolved: a `Z`
 * means somebody converted it, and the day it lands on may no longer be the day the boat sailed.
 *
 * Ties go to the higher Version number. Two Versions effective on one day is the sailor correcting an
 * artifact the same day they entered it, and the correction is the later Version.
 *
 * Generic in the Version, and it hands the caller's own object back: a `RigTuneChoice` goes in and
 * comes out with its bands, which is what lets the band picker open on the defaulted Version's own
 * table without a second lookup.
 */
export function versionInForceOn<T extends BoatSetupVersionRef>(
  versions: readonly T[],
  on: string
): T | null {
  const match = NAIVE_DAY.exec(on)
  if (!match) {
    throw new TypeError(`not a day in the recording's own clock: ${JSON.stringify(on)}`)
  }
  const day = match[1]

  let inForce: T | null = null
  for (const version of versions) {
    // Both are `YYYY-MM-DD`, so string order is calendar order.
    if (version.effective_from > day) continue
    if (
      inForce === null ||
      version.effective_from > inForce.effective_from ||
      (version.effective_from === inForce.effective_from &&
        version.version_number > inForce.version_number)
    ) {
      inForce = version
    }
  }

  return inForce
}

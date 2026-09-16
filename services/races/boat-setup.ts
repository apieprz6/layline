import { formatBandRange } from '@/lib/boat/rigTune'
import type { RaceWindowSeconds } from '@/services/recordings/race-window'
import type { RaceFinding, RigTuneChoice, WindBandRef } from '@/types'

/**
 * What a recorded Wind Band means beside the wind a recording actually logged.
 *
 * Pure and React-free, because three callers need the same answers and must not disagree: the wizard's
 * Review step states the finding before the race is filed, the race page states it after, and the edit
 * panel decides what happens to a band when the Rig Tune pointer moves.
 *
 * Nothing here corrects anything. The band is Testimony — the rig was set the way the sailor says it
 * was — and a band that disagrees with the logged breeze is usually a boat tuned for the forecast that
 * did not arrive. So the disagreement is a `note`, which by ADR 0009's counting is stated and never in
 * the way, and no figure derived here is ever written to a column.
 */

/**
 * One row's contribution to the mean wind: when it was logged, and what it said.
 *
 * Two very different reads produce this — the wizard has parallel arrays of seconds and knots, the
 * race page has `row_time` stamps and `tws::text` — so the windowing rule lives here once rather than
 * once per caller.
 */
export interface WindLoggedRow {
  /** Absolute seconds in the recording's own naive frame. */
  at: number
  /** Knots of true wind, or null where the file logged none. */
  tws: number | null
}

/** A tenth of a knot, which is finer than any Wind Band edge a tuning guide is written in. */
const TENTHS = 10

/**
 * The mean TWS the recording logged across the Race Window, in knots, or null.
 *
 * Null is *the file logged no wind here* — never zero, which would be a reading of calm the instrument
 * never gave (ADR 0008). Rows outside the window are dropped because a recording usually runs long at
 * both ends, and the mean over the delivery out and back is not the mean over the race. Both bounds
 * count as inside, matching `withinRaceWindow`, so the figure describes the same rows the coverage
 * figures beside it do.
 *
 * Rounded to a tenth of a knot here rather than at the screen, so the figure a page states and the
 * figure `windBandFinding` compares are the same number: a page can never read "averaged 12.0 kt"
 * beside a claim that 12.0 fell outside the 8–12 kt band.
 */
export function loggedTwsMean(
  rows: readonly WindLoggedRow[],
  // The window the charts and `raceWindowSeconds` already speak in, both ends inclusive — imported
  // rather than restated, so there is one definition of what a Race Window is in seconds.
  window: RaceWindowSeconds
): number | null {
  let total = 0
  let counted = 0

  for (const row of rows) {
    if (row.tws === null) continue
    if (row.at < window.start || row.at > window.finish) continue
    total += row.tws
    counted += 1
  }

  if (counted === 0) return null

  return Math.round((total / counted) * TENTHS) / TENTHS
}

/**
 * Whether a Wind Band covers a wind speed.
 *
 * Inclusive at both ends, on purpose. Contiguous bands share an edge — `checkBandTable` requires
 * `below.high_kt === above.low_kt` — so a mean landing exactly on a boundary belongs to the band above
 * and the band below alike, and calling that a mismatch would be an accusation produced by an
 * arithmetic tie. A null `high_kt` is the open-ended top band, which covers whatever the day brings.
 */
export function bandContains(band: WindBandRef, knots: number): boolean {
  if (knots < band.low_kt) return false
  return band.high_kt === null || knots <= band.high_kt
}

/**
 * The one note a recorded band can raise: it disagrees with the wind the file logged.
 *
 * Null in all three of the cases that are not a disagreement — no band recorded, no wind logged, or the
 * two agreeing — because the page has a Boat Setup section that already says which of those it is, and
 * a finding restating "not recorded" would read as a fault.
 *
 * A `note`, never a refusal and never a confirmation (ADR 0009). It does not block filing a race and it
 * does not block amending one: the sailor is being told what their own two records say, and the tuning
 * they chose is not made wrong by the breeze that showed up.
 */
export function windBandFinding(band: WindBandRef | null, knots: number | null): RaceFinding | null {
  if (band === null || knots === null) return null
  if (bandContains(band, knots)) return null

  const range = formatBandRange(band.low_kt, band.high_kt)
  // The sailor's own word for the band first, with the numbers in brackets: they chose it by the name
  // in the tuning guide, and a finding written only in knots would send them to look it up.
  const named = band.label === null ? `the ${range} band` : `the ${band.label} band (${range})`

  return {
    severity: 'note',
    message: `Recorded in ${named}; logged wind averaged ${knots} kt.`,
  }
}

/**
 * The band a Race still records once its Rig Tune pointer is `version`.
 *
 * The band id back when `version` defines it, and null when it does not — which is every case where the
 * pointer moved to another Version or was cleared, because bands do not migrate: a re-tune is new rows,
 * with new ids (ADR 0007). The composite key `races (rig_tune_version_id, rig_tune_band_id)` and
 * `band_requires_rig_tune` refuse both mismatches outright, so this is not the enforcement — it is what
 * keeps a form from ever submitting a pair the database would then have to refuse.
 */
export function bandKeptFor(version: RigTuneChoice | null, bandId: string | null): string | null {
  if (version === null || bandId === null) return null

  return version.bands.some((band) => band.band_id === bandId) ? bandId : null
}

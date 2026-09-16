/**
 * Which Boat Setup Version was current on a day — the one rule all four pointers default by.
 *
 * `chartInForceOn` proved this for the Crossover Chart (ADR 0023) and this suite is that same
 * behaviour asked of the shared function, so the Polar, the Rig Tune and the Instrument Calibration
 * default the way the chart already did rather than each growing their own near-miss.
 *
 * The interesting cases are all refusals to guess: a recording from before the boat's first Version
 * of a kind resolves to nothing, and a Version minted later is never in force over an earlier race.
 */

import { versionInForceOn } from '@/services/boat/versionInForce'
import type { BoatSetupVersionRef } from '@/types'

const version = (version_number: number, effective_from: string): BoatSetupVersionRef => ({
  version_id: `v${version_number}`,
  version_number,
  effective_from,
})

const VERSIONS = [version(2, '2026-06-01'), version(1, '2026-05-01'), version(3, '2026-10-01')]

describe('the Boat Setup Version in force on a day', () => {
  it('is the latest Version that had taken effect by then', () => {
    expect(versionInForceOn(VERSIONS, '2026-07-22 18:00:00')?.version_number).toBe(2)
  })

  it('counts a Version effective on the day itself as in force', () => {
    expect(versionInForceOn(VERSIONS, '2026-06-01 09:00:00')?.version_number).toBe(2)
  })

  it('is never the newest Version, which is the whole point of freezing a pointer', () => {
    // v3 exists. A June race was not sailed under it, and resolving to it would rewrite what the
    // race was sailed under every time somebody adds a Version (ADR 0012).
    expect(versionInForceOn(VERSIONS, '2026-06-30 19:00:00')?.version_number).toBe(2)
  })

  it('resolves to nothing for a recording from before the first Version of its kind', () => {
    // The nine archive races that predate any Boat Setup artifact. Backdating v1 onto them would be
    // Layline asserting a Polar the boat did not have yet, so the pointer stays null: not recorded.
    expect(versionInForceOn(VERSIONS, '2026-04-30 19:00:00')).toBeNull()
  })

  it('resolves to nothing when the boat has no Versions of that kind at all', () => {
    expect(versionInForceOn([], '2026-07-22 18:00:00')).toBeNull()
  })

  it('takes the higher Version number when two took effect on one day', () => {
    const sameDay = [version(4, '2026-05-01'), version(1, '2026-05-01')]

    expect(versionInForceOn(sameDay, '2026-05-02 12:00:00')?.version_number).toBe(4)
  })

  it('reads a naive stamp and a bare calendar date the same way', () => {
    expect(versionInForceOn(VERSIONS, '2026-07-22')?.version_id).toBe('v2')
    expect(versionInForceOn(VERSIONS, '2026-07-22T18:00:00')?.version_id).toBe('v2')
  })

  it('refuses a stamp carrying an offset, rather than resolving one', () => {
    expect(() => versionInForceOn(VERSIONS, '2026-07-22T18:00:00Z')).toThrow(/clock|offset/i)
  })

  it('hands back the caller’s own object, so a richer Version keeps its extra fields', () => {
    // What lets one function serve both a bare `BoatSetupVersionRef` list and a `RigTuneChoice`
    // list, whose bands are the reason the Review step asked at all.
    const withBands = [{ ...version(1, '2026-05-01'), bands: [{ band_id: 'b1' }] }]

    expect(versionInForceOn(withBands, '2026-06-01')).toBe(withBands[0])
  })

  it('leaves the given list in the order it was given', () => {
    versionInForceOn(VERSIONS, '2026-07-22 18:00:00')
    expect(VERSIONS.map((each) => each.version_number)).toEqual([2, 1, 3])
  })
})

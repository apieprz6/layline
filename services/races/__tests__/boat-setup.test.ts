/**
 * The three questions a recorded Wind Band raises, and the one answer none of them is: an error.
 *
 * A Race records the band the rig was actually set to. Layline's job is to state it beside the wind
 * the file logged and stop there — the sailor may well have tuned for the forecast rather than the
 * breeze that arrived, and that is Testimony, not a mistake (ADR 0008). So the disagreement is a
 * `note`, which by ADR 0009's counting can never stand in the way of a save.
 *
 * The other two are about the composite key `races (rig_tune_version_id, rig_tune_band_id)`. Bands do
 * not migrate between Rig Tune Versions — a re-tune means new rows — so moving the Version pointer has
 * to let go of a band that belonged to the old one. The database refuses that pair either way; this
 * module is what keeps a form from ever offering it.
 */

import {
  bandContains,
  bandKeptFor,
  loggedTwsMean,
  windBandFinding,
} from '@/services/races/boat-setup'
import type { RigTuneChoice, WindBandRef } from '@/types'

const band = (over: Partial<WindBandRef> = {}): WindBandRef => ({
  band_id: 'b-middle',
  low_kt: 8,
  high_kt: 12,
  is_base: true,
  label: null,
  ...over,
})

const OPEN_TOP = band({ band_id: 'b-top', low_kt: 18, high_kt: null, is_base: false })

const version = (over: Partial<RigTuneChoice> = {}): RigTuneChoice => ({
  version_id: 'v3',
  version_number: 3,
  effective_from: '2026-05-01',
  bands: [band({ band_id: 'b-low', low_kt: 0, high_kt: 8, is_base: false }), band(), OPEN_TOP],
  ...over,
})

describe('the mean wind a Race Window logged', () => {
  const window = { start: 100, finish: 200 }

  it('is the mean of the TWS the file logged inside the window', () => {
    const rows = [
      { at: 100, tws: 10 },
      { at: 150, tws: 12 },
      { at: 200, tws: 14 },
    ]

    expect(loggedTwsMean(rows, window)).toBe(12)
  })

  it('ignores rows outside the window, at both ends', () => {
    // A recording usually runs long at both ends — the boat was logging on the way out and back —
    // and a mean over the delivery is not the mean over the race.
    const rows = [
      { at: 40, tws: 30 },
      { at: 150, tws: 12 },
      { at: 400, tws: 30 },
    ]

    expect(loggedTwsMean(rows, window)).toBe(12)
  })

  it('counts a row on either boundary as inside, the way the window filter does', () => {
    expect(loggedTwsMean([{ at: 100, tws: 6 }], window)).toBe(6)
    expect(loggedTwsMean([{ at: 200, tws: 6 }], window)).toBe(6)
    expect(loggedTwsMean([{ at: 201, tws: 6 }], window)).toBeNull()
  })

  it('skips the rows that logged no wind rather than reading them as calm', () => {
    // A blank TWS is the instrument saying nothing (ADR 0008). Folded in as a zero it would drag the
    // mean down and put a heavy-air race in a light-air band.
    const rows = [
      { at: 110, tws: null },
      { at: 120, tws: 15 },
      { at: 130, tws: 17 },
    ]

    expect(loggedTwsMean(rows, window)).toBe(16)
  })

  it('is null when the file logged no wind at all in the window', () => {
    // Not zero. There is nothing to compare the recorded band against, and the page says so by
    // saying nothing.
    expect(loggedTwsMean([{ at: 150, tws: null }], window)).toBeNull()
    expect(loggedTwsMean([], window)).toBeNull()
  })

  it('rounds to a tenth of a knot, which is the figure the comparison also uses', () => {
    // The stated figure and the compared figure are the same number by construction, so a page can
    // never read "averaged 12.0 kt" beside a claim that 12.0 falls outside the 8–12 band.
    const rows = [
      { at: 110, tws: 12 },
      { at: 120, tws: 12.1 },
      { at: 130, tws: 12.05 },
    ]

    expect(loggedTwsMean(rows, window)).toBe(12.1)
  })
})

describe('whether a Wind Band covers a wind speed', () => {
  it('covers a speed between its bounds', () => {
    expect(bandContains(band(), 10)).toBe(true)
  })

  it('covers a speed sitting exactly on either bound', () => {
    // Contiguous bands share edges — `checkBandTable` enforces `below.high_kt === above.low_kt` — so
    // a mean on a boundary belongs to both bands, and calling it a mismatch would be an accusation
    // out of an arithmetic tie.
    expect(bandContains(band(), 8)).toBe(true)
    expect(bandContains(band(), 12)).toBe(true)
  })

  it('does not cover a speed outside its bounds', () => {
    expect(bandContains(band(), 7.9)).toBe(false)
    expect(bandContains(band(), 15.4)).toBe(false)
  })

  it('covers everything above its lower bound when it is the open top band', () => {
    expect(bandContains(OPEN_TOP, 18)).toBe(true)
    expect(bandContains(OPEN_TOP, 44)).toBe(true)
    expect(bandContains(OPEN_TOP, 17.9)).toBe(false)
  })
})

describe('the finding a recorded band and the logged wind produce', () => {
  it('states both figures when they disagree, and states it as a note', () => {
    const finding = windBandFinding(band(), 15.4)

    expect(finding).toEqual({
      severity: 'note',
      message: 'Recorded in the 8–12 kt band; logged wind averaged 15.4 kt.',
    })
  })

  it('says nothing when the logged wind falls inside the recorded band', () => {
    expect(windBandFinding(band(), 10)).toBeNull()
  })

  it('says nothing when no band was recorded', () => {
    // Not recorded is not a disagreement. The page says the band is not recorded, in the Boat Setup
    // section, and there is no finding to make about it.
    expect(windBandFinding(null, 15.4)).toBeNull()
  })

  it('says nothing when the file logged no wind', () => {
    expect(windBandFinding(band(), null)).toBeNull()
  })

  it('names the open top band in its own words', () => {
    expect(windBandFinding(OPEN_TOP, 6)?.message).toBe(
      'Recorded in the 18 kt and up band; logged wind averaged 6 kt.'
    )
  })

  it('says the band’s label beside its range when the tuning guide gave one', () => {
    // The sailor's own word for the band is what they chose it by, and a finding that used only the
    // numbers would make them go and look it up.
    expect(windBandFinding(band({ label: 'Medium' }), 15.4)?.message).toBe(
      'Recorded in the Medium band (8–12 kt); logged wind averaged 15.4 kt.'
    )
  })
})

describe('the band a Race keeps when its Rig Tune pointer moves', () => {
  it('keeps a band that belongs to the newly named Version', () => {
    expect(bandKeptFor(version(), 'b-middle')).toBe('b-middle')
  })

  it('lets go of a band that belonged to the Version being replaced', () => {
    // The composite key would refuse the pair, and a form that submitted it would turn the sailor's
    // amendment into a database error. Bands do not migrate: a re-tune means new rows (ADR 0007).
    expect(bandKeptFor(version({ version_id: 'v4', bands: [OPEN_TOP] }), 'b-middle')).toBeNull()
  })

  it('lets go of the band when the Rig Tune pointer is cleared to not recorded', () => {
    // `band_requires_rig_tune`: a band without its Version is a range nobody can look up.
    expect(bandKeptFor(null, 'b-middle')).toBeNull()
  })

  it('leaves an unrecorded band unrecorded', () => {
    expect(bandKeptFor(version(), null)).toBeNull()
    expect(bandKeptFor(null, null)).toBeNull()
  })
})

import {
  buildRigTuneVersionInput,
  draftFromVersion,
  formatBandRange,
  formatTurns,
} from '../rigTune'
import type {
  RigTuneBandDraft,
  RigTuneDraft,
  RigTunePositionDraft,
  RigTuneShrouds,
  RigTuneSideDraft,
  RigTuneVersionRecord,
  ShroudPosition,
} from '@/types'

/**
 * The Rig Tune draft, and what it refuses.
 *
 * The figures here are the boat's own published guide's base settings (`V1 72 / D1 64 /
 * D2 61 mm`) used as *test* data, which is the one place they are allowed: ADR 0007
 * forbids seeding them as a Version, because stored as v1 they would be indistinguishable
 * from a measurement of this rig.
 */

function side(gap: string, turns = '0'): RigTuneSideDraft {
  return { gap_mm: gap, turns_from_base: turns }
}

/** The three positions, both sides even, as they would come off a caliper. */
function evenShrouds(
  v1: string,
  d1: string,
  d2: string,
  turns = '0'
): Record<ShroudPosition, RigTunePositionDraft> {
  const both = (gap: string) => ({ port: side(gap, turns), starboard: side(gap, turns) })
  return { V1: both(v1), D1: both(d1), D2: both(d2) }
}

/** A band with every figure filled in and both sides even. */
function band(over: Partial<RigTuneBandDraft> = {}): RigTuneBandDraft {
  return {
    key: 'band-1',
    label: 'Mac tune',
    low_kt: '0',
    high_kt: '',
    is_base: true,
    note: '',
    shrouds: evenShrouds('72', '64', '61'),
    seed: null,
    ...over,
  }
}

/** The band exactly as the current Version holds it, so its own figures are its seed. */
function seeded(b: RigTuneBandDraft, gaps_stale = false): RigTuneBandDraft {
  return { ...b, seed: { shrouds: asMeasured(b.shrouds), gaps_stale, was_base: b.is_base } }
}

function asMeasured(typed: Record<ShroudPosition, RigTunePositionDraft>): RigTuneShrouds {
  const read = (s: RigTuneSideDraft) => ({
    gap_mm: Number(s.gap_mm),
    turns_from_base: Number(s.turns_from_base),
  })
  return {
    V1: { port: read(typed.V1.port), starboard: read(typed.V1.starboard) },
    D1: { port: read(typed.D1.port), starboard: read(typed.D1.starboard) },
    D2: { port: read(typed.D2.port), starboard: read(typed.D2.starboard) },
  }
}

/** One caliper reading retyped, the way the form would leave it. */
function withGap(
  b: RigTuneBandDraft,
  position: ShroudPosition,
  side: 'port' | 'starboard',
  gap_mm: string
): RigTuneBandDraft {
  return {
    ...b,
    shrouds: {
      ...b.shrouds,
      [position]: { ...b.shrouds[position], [side]: { ...b.shrouds[position][side], gap_mm } },
    },
  }
}

function draft(over: Partial<RigTuneDraft> = {}): RigTuneDraft {
  return {
    effective_from: '2026-07-12',
    change_reason: 'First tune measured off the boat with a caliper.',
    bands: [band()],
    ...over,
  }
}

describe('buildRigTuneVersionInput', () => {
  it('builds a one-band v1 out of what was typed', () => {
    const result = buildRigTuneVersionInput(draft())

    expect(result).toEqual({
      ok: true,
      input: {
        effective_from: '2026-07-12',
        note: 'First tune measured off the boat with a caliper.',
        bands: [
          {
            low_kt: 0,
            high_kt: null,
            is_base: true,
            label: 'Mac tune',
            note: null,
            gaps_stale: false,
            shrouds: {
              V1: {
                port: { gap_mm: 72, turns_from_base: 0 },
                starboard: { gap_mm: 72, turns_from_base: 0 },
              },
              D1: {
                port: { gap_mm: 64, turns_from_base: 0 },
                starboard: { gap_mm: 64, turns_from_base: 0 },
              },
              D2: {
                port: { gap_mm: 61, turns_from_base: 0 },
                starboard: { gap_mm: 61, turns_from_base: 0 },
              },
            },
          },
        ],
      },
    })
  })

  it('refuses a blank Turnbuckle Gap rather than writing a zero', () => {
    const measured = band()
    const result = buildRigTuneVersionInput(
      draft({
        bands: [
          {
            ...measured,
            shrouds: {
              ...measured.shrouds,
              D1: { port: side(''), starboard: side('64') },
            },
          },
        ],
      })
    )

    expect(result).toEqual({
      ok: false,
      problems: [{ band_key: 'band-1', message: 'D1 port needs a Turnbuckle Gap in mm.' }],
    })
  })

  it('refuses a blank Turns From Base rather than reading it as the base setting', () => {
    // `Number('')` is 0, and 0 turns means "set exactly as the Base Tune" — a claim about
    // the rig nobody made. A band left empty is unmeasured, which is a refusal.
    const lighter = band({
      key: 'light',
      low_kt: '0',
      high_kt: '9',
      is_base: false,
      shrouds: {
        ...evenShrouds('70', '62', '60', '-1'),
        D2: { port: side('60', ''), starboard: side('60', '-1') },
      },
    })
    const result = buildRigTuneVersionInput(
      draft({ bands: [lighter, band({ key: 'base', low_kt: '9', high_kt: '' })] })
    )

    expect(result).toEqual({
      ok: false,
      problems: [{ band_key: 'light', message: 'D2 port needs Turns From Base, in half turns.' }],
    })
  })

  it('refuses Turns From Base finer than a half turn, and keeps the slack side negative', () => {
    /** Light air is set off the base by slackening, so its Turns run negative. */
    const lighter = (turns: string): RigTuneBandDraft =>
      band({
        key: 'light',
        label: 'Light',
        low_kt: '0',
        high_kt: '9',
        is_base: false,
        shrouds: evenShrouds('70', '62', '60', turns),
      })
    const base = band({ key: 'base', label: 'Mac base', low_kt: '9', high_kt: '' })

    const quarter = buildRigTuneVersionInput(draft({ bands: [lighter('-1.25'), base] }))

    expect(quarter).toEqual({
      ok: false,
      problems: [
        { band_key: 'light', message: 'V1 port Turns From Base goes in half turns.' },
        { band_key: 'light', message: 'V1 starboard Turns From Base goes in half turns.' },
        { band_key: 'light', message: 'D1 port Turns From Base goes in half turns.' },
        { band_key: 'light', message: 'D1 starboard Turns From Base goes in half turns.' },
        { band_key: 'light', message: 'D2 port Turns From Base goes in half turns.' },
        { band_key: 'light', message: 'D2 starboard Turns From Base goes in half turns.' },
      ],
    })

    const halves = buildRigTuneVersionInput(draft({ bands: [lighter('-1.5'), base] }))

    expect(halves.ok).toBe(true)
    expect(halves.ok && halves.input.bands[0].shrouds.V1.port.turns_from_base).toBe(-1.5)
  })

  it('refuses a Turnbuckle Gap that is not a positive measurement', () => {
    const measured = band()

    for (const typed of ['about 60', '-3', '0']) {
      const result = buildRigTuneVersionInput(
        draft({
          bands: [
            {
              ...measured,
              shrouds: {
                ...measured.shrouds,
                D2: { port: side('61'), starboard: side(typed) },
              },
            },
          ],
        })
      )

      expect(result).toEqual({
        ok: false,
        problems: [
          { band_key: 'band-1', message: 'D2 starboard Turnbuckle Gap must be a measurement in mm.' },
        ],
      })
    }
  })

  it('refuses a Version with no change reason and no date it took effect', () => {
    const result = buildRigTuneVersionInput(
      draft({ effective_from: '', change_reason: '   ' })
    )

    expect(result).toEqual({
      ok: false,
      problems: [
        { band_key: null, message: 'Say when this tune took effect.' },
        { band_key: null, message: 'Say why this Version exists.' },
      ],
    })
  })

  it('reads a three-band table up the wind axis whatever order it was typed in', () => {
    const light = band({ key: 'light', label: 'Light', low_kt: '0', high_kt: '9', is_base: false })
    const base = band({ key: 'base', label: 'Mac base', low_kt: '9', high_kt: '16', is_base: true })
    const heavy = band({ key: 'heavy', label: 'Heavy', low_kt: '16', high_kt: '', is_base: false })

    const result = buildRigTuneVersionInput(draft({ bands: [heavy, base, light] }))

    expect(result.ok).toBe(true)
    expect(result.ok && result.input.bands.map((b) => [b.low_kt, b.high_kt, b.is_base])).toEqual([
      [0, 9, false],
      [9, 16, true],
      [16, null, false],
    ])
  })

  it('refuses a wind speed that no band answers for', () => {
    const lower = band({ key: 'light', low_kt: '0', high_kt: '9', is_base: false })
    const upper = band({ key: 'heavy', low_kt: '10', high_kt: '', is_base: true })

    expect(buildRigTuneVersionInput(draft({ bands: [lower, upper] }))).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'No band covers 9 to 10 kt.' }],
    })
  })

  it('refuses two bands that both answer for the same wind speed', () => {
    const lower = band({ key: 'light', low_kt: '0', high_kt: '11', is_base: false })
    const upper = band({ key: 'heavy', low_kt: '9', high_kt: '', is_base: true })

    expect(buildRigTuneVersionInput(draft({ bands: [lower, upper] }))).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'Two bands cover 9 to 11 kt.' }],
    })
  })

  it('insists the table ends in exactly one open-ended band', () => {
    const closedTop = buildRigTuneVersionInput(
      draft({
        bands: [
          band({ key: 'light', low_kt: '0', high_kt: '9', is_base: false }),
          band({ key: 'heavy', low_kt: '9', high_kt: '16', is_base: true }),
        ],
      })
    )

    expect(closedTop).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'The top band must run open-ended, with no upper limit.' }],
    })

    const twoOpen = buildRigTuneVersionInput(
      draft({
        bands: [
          band({ key: 'light', low_kt: '0', high_kt: '', is_base: false }),
          band({ key: 'heavy', low_kt: '9', high_kt: '', is_base: true }),
        ],
      })
    )

    expect(twoOpen).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'Only the top band runs open-ended.' }],
    })
  })

  it('refuses a table that leaves the lightest air uncovered', () => {
    const result = buildRigTuneVersionInput(
      draft({ bands: [band({ low_kt: '6', high_kt: '' })] })
    )

    expect(result).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'The first band must start at 0 kt.' }],
    })
  })

  it('refuses a Version with no bands at all', () => {
    expect(buildRigTuneVersionInput(draft({ bands: [] }))).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'A Rig Tune needs at least one Wind Band.' }],
    })
  })

  it('insists exactly one band is the Base Tune', () => {
    const light = band({ key: 'light', low_kt: '0', high_kt: '9', is_base: false })
    const heavy = band({ key: 'heavy', low_kt: '9', high_kt: '', is_base: false })

    expect(buildRigTuneVersionInput(draft({ bands: [light, heavy] }))).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'Mark the band the Turns are counted from as the Base Tune.' }],
    })

    expect(
      buildRigTuneVersionInput(
        draft({ bands: [{ ...light, is_base: true }, { ...heavy, is_base: true }] })
      )
    ).toEqual({
      ok: false,
      problems: [{ band_key: null, message: 'Only one band is the Base Tune.' }],
    })
  })

  it('refuses band edges that are not a wind speed in knots', () => {
    expect(buildRigTuneVersionInput(draft({ bands: [band({ low_kt: '  ' })] }))).toEqual({
      ok: false,
      problems: [{ band_key: 'band-1', message: 'This band needs the wind speed it starts at.' }],
    })

    for (const typed of ['light', '-2']) {
      expect(buildRigTuneVersionInput(draft({ bands: [band({ low_kt: typed })] }))).toEqual({
        ok: false,
        problems: [{ band_key: 'band-1', message: 'Band edges are wind speeds in knots.' }],
      })
    }

    expect(
      buildRigTuneVersionInput(draft({ bands: [band({ low_kt: '0', high_kt: 'breezy' })] }))
    ).toEqual({
      ok: false,
      problems: [{ band_key: 'band-1', message: 'Band edges are wind speeds in knots.' }],
    })

    expect(
      buildRigTuneVersionInput(draft({ bands: [band({ low_kt: '12', high_kt: '9' })] }))
    ).toEqual({
      ok: false,
      problems: [
        { band_key: 'band-1', message: 'A band must end above the wind speed it starts at.' },
      ],
    })
  })

  describe('when the Base Tune is re-measured', () => {
    const light = seeded(
      band({ key: 'light', label: 'Light', low_kt: '0', high_kt: '9', is_base: false, shrouds: evenShrouds('70', '62', '60', '-1') })
    )
    const base = seeded(
      band({ key: 'base', label: 'Mac base', low_kt: '9', high_kt: '16', is_base: true })
    )
    const heavy = seeded(
      band({ key: 'heavy', label: 'Heavy', low_kt: '16', high_kt: '', is_base: false, shrouds: evenShrouds('75', '67', '63', '1.5') })
    )

    /** The Version being edited, so a table saved untouched changes nothing. */
    const carried = draft({ bands: [light, base, heavy] })

    function staleness(edited: RigTuneDraft): Record<string, boolean> {
      const result = buildRigTuneVersionInput(edited)
      if (!result.ok) throw new Error(`refused: ${result.problems.map((p) => p.message).join(' ')}`)
      return Object.fromEntries(result.input.bands.map((b) => [b.label, b.gaps_stale]))
    }

    it('marks the Gaps of the bands nobody re-measured stale, and never the base itself', () => {
      const state = staleness({
        ...carried,
        bands: [light, withGap(base, 'V1', 'port', '73'), heavy],
      })

      expect(state).toEqual({ Light: true, 'Mac base': false, Heavy: true })
    })

    it('recomputes nothing: a stale band keeps the Gaps and Turns it was measured with', () => {
      const result = buildRigTuneVersionInput({
        ...carried,
        bands: [light, withGap(base, 'V1', 'port', '73'), heavy],
      })

      expect(result.ok && result.input.bands[0].shrouds).toEqual({
        V1: { port: { gap_mm: 70, turns_from_base: -1 }, starboard: { gap_mm: 70, turns_from_base: -1 } },
        D1: { port: { gap_mm: 62, turns_from_base: -1 }, starboard: { gap_mm: 62, turns_from_base: -1 } },
        D2: { port: { gap_mm: 60, turns_from_base: -1 }, starboard: { gap_mm: 60, turns_from_base: -1 } },
      })
    })

    it('leaves a band fresh when it was re-measured alongside the base', () => {
      const state = staleness({
        ...carried,
        bands: [withGap(light, 'D1', 'starboard', '63'), withGap(base, 'V1', 'port', '73'), heavy],
      })

      expect(state).toEqual({ Light: false, 'Mac base': false, Heavy: true })
    })

    it('changes nothing when the table is saved with the base untouched', () => {
      const state = staleness({ ...carried, bands: [light, base, withGap(heavy, 'D2', 'port', '64')] })

      expect(state).toEqual({ Light: false, 'Mac base': false, Heavy: false })
    })

    it('marks nothing stale when the admin only moves which band is the Base Tune', () => {
      // Re-flagging is re-organising the table, not re-measuring the rig. Every band's
      // Gaps are the same millimetres they were, so calling them stale would be a claim
      // nobody made — even though the band now marked base of course reads different
      // Gaps from the band that was: they are two different bands.
      const state = staleness({
        ...carried,
        bands: [
          { ...light, is_base: true, shrouds: evenShrouds('70', '62', '60', '0') },
          { ...base, is_base: false, shrouds: evenShrouds('72', '64', '61', '1') },
          { ...heavy, is_base: false, shrouds: evenShrouds('75', '67', '63', '2.5') },
        ],
      })

      expect(state).toEqual({ Light: false, 'Mac base': false, Heavy: false })
    })
  })

  it('leaves an already stale band stale until someone re-measures it', () => {
    const base = seeded(band({ key: 'base', label: 'Mac base', low_kt: '9', high_kt: '', is_base: true }))
    const light = seeded(
      band({ key: 'light', label: 'Light', low_kt: '0', high_kt: '9', is_base: false, shrouds: evenShrouds('70', '62', '60') }),
      true
    )
    const carried = draft({ bands: [light, base] })

    const untouched = buildRigTuneVersionInput(carried)
    expect(untouched.ok && untouched.input.bands[0].gaps_stale).toBe(true)

    const remeasured = buildRigTuneVersionInput({
      ...carried,
      bands: [withGap(light, 'V1', 'starboard', '71'), base],
    })
    expect(remeasured.ok && remeasured.input.bands[0].gaps_stale).toBe(false)
  })

  it('never calls a band the admin has just added stale', () => {
    const base = seeded(band({ key: 'base', label: 'Mac base', low_kt: '0', high_kt: '16', is_base: true }))
    const added = band({ key: 'added', label: 'Heavy', low_kt: '16', high_kt: '', is_base: false })

    const result = buildRigTuneVersionInput(
      draft({ bands: [withGap(base, 'V1', 'port', '73'), added] })
    )

    expect(result.ok && result.input.bands.map((b) => b.gaps_stale)).toEqual([false, false])
  })

  it('insists the Base Tune itself sits at zero Turns From Base', () => {
    const result = buildRigTuneVersionInput(
      draft({ bands: [band({ shrouds: evenShrouds('72', '64', '61', '1') })] })
    )

    expect(result).toEqual({
      ok: false,
      problems: [
        {
          band_key: 'band-1',
          message: 'The Base Tune is where the Turns are counted from, so its own Turns are 0.',
        },
      ],
    })
  })

  it('refuses a date that is not a real calendar day', () => {
    for (const typed of ['12/07/2026', '2026-02-31', '2026-7-12']) {
      expect(buildRigTuneVersionInput(draft({ effective_from: typed }))).toEqual({
        ok: false,
        problems: [
          { band_key: null, message: 'Give the date this tune took effect as YYYY-MM-DD.' },
        ],
      })
    }
  })
})

describe('draftFromVersion', () => {
  const recorded: RigTuneVersionRecord = {
    id: 'v2',
    version_number: 2,
    effective_from: '2026-08-01',
    recorded_at: '2026-08-02T14:00:00Z',
    note: 'Re-measured after the shrouds were reset.',
    created_by: 'admin-1',
    bands: [
      {
        id: 'band-light',
        version_id: 'v2',
        kind: 'rig_tune',
        low_kt: 0,
        high_kt: 9,
        is_base: false,
        label: 'Light',
        note: 'Forestay one hole aft.',
        gaps_stale: true,
        shrouds: asMeasured(evenShrouds('70', '62', '60', '-1.5')),
      },
      {
        id: 'band-base',
        version_id: 'v2',
        kind: 'rig_tune',
        low_kt: 9,
        high_kt: null,
        is_base: true,
        label: 'Mac base',
        note: null,
        gaps_stale: false,
        shrouds: asMeasured(evenShrouds('72', '64', '61')),
      },
    ],
  }

  it('opens the recorded tune for editing, and carries what each band was measured under', () => {
    const opened = draftFromVersion(recorded)

    // The date and the reason are the *new* Version's, so neither is inherited: a reason
    // copied off the last Version would explain the wrong change (ADR 0007).
    expect(opened.effective_from).toBe('')
    expect(opened.change_reason).toBe('')

    expect(opened.bands.map((b) => b.key)).toEqual(['band-light', 'band-base'])
    expect(opened.bands[0].low_kt).toBe('0')
    expect(opened.bands[0].high_kt).toBe('9')
    // The open top band's blank field is what makes it open.
    expect(opened.bands[1].high_kt).toBe('')
    expect(opened.bands[0].shrouds.D1.port).toEqual({ gap_mm: '62', turns_from_base: '-1.5' })
    expect(opened.bands[0].label).toBe('Light')
    expect(opened.bands[1].note).toBe('')

    // The seed is what the band was last measured as, so a band left untouched can be told
    // from one re-measured in this edit — that is what decides staleness.
    expect(opened.bands[0].seed).toEqual({
      shrouds: asMeasured(evenShrouds('70', '62', '60', '-1.5')),
      gaps_stale: true,
      was_base: false,
    })
    // And whether it was the Base Tune, which is what tells re-measuring the base — the
    // thing that makes the other bands' Gaps stale — from moving the flag elsewhere.
    expect(opened.bands[1].seed?.was_base).toBe(true)
  })

  it('opens an unrecorded Rig Tune as one empty band, the Base Tune, from 0 kt', () => {
    const opened = draftFromVersion(null)

    // No figures: there is no seed for a Rig Tune, so v1 is measured off this boat and a
    // guide's published numbers would be indistinguishable from that measurement.
    expect(opened.bands).toHaveLength(1)
    expect(opened.bands[0].is_base).toBe(true)
    expect(opened.bands[0].low_kt).toBe('0')
    expect(opened.bands[0].high_kt).toBe('')
    expect(opened.bands[0].shrouds.V1.port).toEqual({ gap_mm: '', turns_from_base: '0' })
    expect(opened.bands[0].seed).toBeNull()
  })
})

describe('formatBandRange', () => {
  it('reads a closed band as the speeds it covers, and the top band as open', () => {
    expect(formatBandRange(0, 9)).toBe('0–9 kt')
    expect(formatBandRange(9, 16)).toBe('9–16 kt')
    // Never "16–∞" or a dash with nothing after it, which reads as a value gone missing:
    // the top band runs to whatever comes, and a sailor reads that as words.
    expect(formatBandRange(16, null)).toBe('16 kt and up')
  })
})

describe('formatTurns', () => {
  it('reads Turns From Base in half turns, signed, off the base', () => {
    // Half turns are the resolution ADR 0007 records, so a half is drawn as a half rather
    // than as 0.5 — the figure is read off a turnbuckle, not off a calculator.
    expect(formatTurns(0)).toBe('0')
    expect(formatTurns(1.5)).toBe('+1½')
    expect(formatTurns(2)).toBe('+2')
    expect(formatTurns(0.5)).toBe('+½')
    // Slacker than the base is a setting, not an error, so the sign is kept and drawn
    // with a real minus rather than a hyphen.
    expect(formatTurns(-0.5)).toBe('−½')
    expect(formatTurns(-1.5)).toBe('−1½')
    expect(formatTurns(-3)).toBe('−3')
  })

  it('shows a figure that is not on the half-turn grid as recorded, not rounded down', () => {
    // Nothing in the app writes 1.25 — the validator refuses it — but `rig_tune_bands`
    // carries no CHECK on the resolution, so a figure that arrives another way must be
    // *readable*. Drawing it as "+1" would silently reduce a recorded measurement, which
    // is the one thing the core belief forbids.
    expect(formatTurns(1.25)).toBe('+1.25')
    expect(formatTurns(-0.75)).toBe('−0.75')
  })
})

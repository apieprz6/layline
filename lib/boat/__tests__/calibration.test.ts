import {
  CALIBRATION_CHANNELS,
  CALIBRATION_EVENT_LABEL,
  CHANNEL_LABEL,
  CHANNEL_UNIT,
  formatFigure,
  formatMultiplier,
  formatOffset,
  hasMultiplier,
  multiplierField,
  offsetField,
  parseCalibrationPayload,
  plausibilityWarnings,
} from '../calibration'
import type { CalibrationChannel, InstrumentCalibrationPayload } from '@/types'

/** The archive's figures, in the display's own encoding. */
const AS_PROGRAMMED: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

/** Form fields for a payload, as the four-channel form would submit them. */
function fields(payload: InstrumentCalibrationPayload): Record<string, string> {
  const out: Record<string, string> = {}
  for (const channel of CALIBRATION_CHANNELS) {
    out[offsetField(channel)] = String(payload[channel].offset)
    if (hasMultiplier(channel)) {
      out[multiplierField(channel)] = String(payload[channel].multiplier)
    }
  }
  return out
}

const read = (given: Record<string, string>) => (name: string) => given[name] ?? null

describe('the Calibration Channel vocabulary', () => {
  it('is the four channels the display corrects, in the schema’s own order', () => {
    expect(CALIBRATION_CHANNELS).toEqual(['AWA', 'AWS', 'STW', 'HDG'])
  })

  it('gives a multiplier to AWS and STW alone', () => {
    // AWA and the compass carry a Programmed Offset and nothing else — that is the
    // display's field set, not a simplification of it (ADR 0005).
    expect(CALIBRATION_CHANNELS.filter(hasMultiplier)).toEqual(['AWS', 'STW'])
  })

  it('names each channel and its own unit', () => {
    for (const channel of CALIBRATION_CHANNELS) {
      expect(CHANNEL_LABEL[channel]).toMatch(/\w/)
    }
    expect(CHANNEL_UNIT).toEqual({ AWA: '°', AWS: 'kt', STW: 'kt', HDG: '°' })
  })

  it('renders an offset in its channel’s unit, and a multiplier bare', () => {
    expect(formatOffset('AWA', 2)).toBe('2°')
    expect(formatOffset('AWS', -0.5)).toBe('-0.5 kt')
    // Two decimals, because the display shows two and 1.2 is not 1.02.
    expect(formatMultiplier(1.02)).toBe('1.02')
    expect(formatMultiplier(1)).toBe('1.00')
  })
})

describe('parsing a transcribed Instrument Calibration', () => {
  it('reads all four channels, with no multiplier key on the two that have none', () => {
    const result = parseCalibrationPayload(read(fields(AS_PROGRAMMED)))

    expect(result).toEqual({ ok: true, payload: AS_PROGRAMMED })

    // Absent, not null: the display has no such field, so the payload has no such
    // key. `toEqual` above would accept `{ offset: 2, multiplier: undefined }`, and
    // that serialises to a JSONB object carrying a null the schema never wanted.
    if (!result.ok) throw new Error(result.message)
    expect(Object.keys(result.payload.AWA)).toEqual(['offset'])
    expect(Object.keys(result.payload.HDG)).toEqual(['offset'])
    expect(Object.keys(result.payload.AWS).sort()).toEqual(['multiplier', 'offset'])
  })

  it('ignores a multiplier typed against a channel that has none', () => {
    // A field the form never renders. If one arrives it is the caller's invention,
    // and storing it would put a figure in the record that no display ever showed.
    const result = parseCalibrationPayload(
      read({ ...fields(AS_PROGRAMMED), [multiplierField('HDG')]: '1.5' })
    )

    expect(result).toEqual({ ok: true, payload: AS_PROGRAMMED })
  })

  it('keeps the figure exactly as typed, sign and all', () => {
    const result = parseCalibrationPayload(
      read({ ...fields(AS_PROGRAMMED), [offsetField('HDG')]: '-13.5' })
    )

    expect(result).toEqual({
      ok: true,
      payload: { ...AS_PROGRAMMED, HDG: { offset: -13.5 } },
    })
  })

  it('refuses a blank figure rather than storing a zero for it', () => {
    // The one thing the core belief forbids outright: a plausible number standing in
    // for a missing one. A blank offset is not an offset of nothing.
    const result = parseCalibrationPayload(
      read({ ...fields(AS_PROGRAMMED), [offsetField('AWS')]: '   ' })
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/AWS/)
  })

  it('refuses a missing field the same way', () => {
    const given = fields(AS_PROGRAMMED)
    delete given[multiplierField('STW')]

    const result = parseCalibrationPayload(read(given))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/STW/)
  })

  it('refuses anything that is not a finite number', () => {
    for (const typed of ['abc', '1.0.2', 'Infinity', 'NaN', '1,02']) {
      const result = parseCalibrationPayload(
        read({ ...fields(AS_PROGRAMMED), [offsetField('AWA')]: typed })
      )
      expect(result.ok).toBe(false)
    }
  })
})

describe('plausibility, which warns and never blocks', () => {
  it('finds nothing to say about the figures actually programmed', () => {
    expect(plausibilityWarnings(AS_PROGRAMMED)).toEqual([])
  })

  it('warns about a multiplier far from unity, naming the channel and the field', () => {
    const warnings = plausibilityWarnings({
      ...AS_PROGRAMMED,
      STW: { multiplier: 2.5, offset: 0 },
    })

    expect(warnings).toHaveLength(1)
    expect(warnings[0].channel).toBe('STW')
    expect(warnings[0].field).toBe('multiplier')
    expect(warnings[0].message).toMatch(/2\.5/)
  })

  it('warns about a wind-angle offset no masthead alignment would need', () => {
    const warnings = plausibilityWarnings({ ...AS_PROGRAMMED, AWA: { offset: 95 } })

    expect(warnings.map((w) => [w.channel, w.field])).toEqual([['AWA', 'offset']])
  })

  it('warns per figure, so two implausible channels give two warnings', () => {
    const warnings = plausibilityWarnings({
      AWA: { offset: 95 },
      AWS: { multiplier: 1.02, offset: 0 },
      STW: { multiplier: 1.02, offset: 0 },
      HDG: { offset: 180 },
    })

    expect(warnings.map((w) => w.channel)).toEqual(['AWA', 'HDG'])
  })

  it('says nothing that reads as a refusal', () => {
    // A hard block would be Layline telling the boat its own display is wrong. The
    // copy has to leave the sailor in no doubt the figure will still be stored.
    const [warning] = plausibilityWarnings({ ...AS_PROGRAMMED, AWA: { offset: 95 } })

    expect(warning.message).not.toMatch(/cannot|refus|invalid|error/i)
    expect(warning.message).toMatch(/unusual|outside|expected/i)
  })

  it('leaves the payload it was given untouched', () => {
    const payload = { ...AS_PROGRAMMED, AWA: { offset: 95 } }
    const before = JSON.stringify(payload)

    plausibilityWarnings(payload)

    expect(JSON.stringify(payload)).toBe(before)
  })
})

describe('the field names the form and the action share', () => {
  it('are one per figure, and distinct', () => {
    const names = CALIBRATION_CHANNELS.flatMap((channel: CalibrationChannel) =>
      hasMultiplier(channel)
        ? [offsetField(channel), multiplierField(channel)]
        : [offsetField(channel)]
    )

    expect(new Set(names).size).toBe(6)
  })
})

describe('formatFigure', () => {
  it('formats a multiplier as a multiplier and an offset as an offset', () => {
    // The Log renders both from one loop over the diff, so it needs one entry point
    // that picks by field rather than a caller that remembers which is which.
    expect(formatFigure('AWS', 'multiplier', 1.02)).toBe(formatMultiplier(1.02))
    expect(formatFigure('AWS', 'offset', 0)).toBe(formatOffset('AWS', 0))
  })

  it('carries the channel\u2019s unit on an offset and none on a multiplier', () => {
    expect(formatFigure('AWA', 'offset', 2)).toBe('2\u00b0')
    expect(formatFigure('STW', 'offset', -0.2)).toBe('-0.2 kt')
    expect(formatFigure('STW', 'multiplier', 1)).toBe('1.00')
  })
})

describe('CALIBRATION_EVENT_LABEL', () => {
  it('names every event type', () => {
    expect(CALIBRATION_EVENT_LABEL).toEqual({
      autocompensation: 'Autocompensation',
      other: 'Other',
    })
  })
})

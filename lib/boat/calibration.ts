import type {
  CalibrationChannel,
  CalibrationEventType,
  InstrumentCalibrationPayload,
} from '@/types'

/**
 * The **Calibration Channel** vocabulary, and the reading of a transcribed
 * **Instrument Calibration**.
 *
 * Pure and React-free, so the form, the Server Action that stores what it submits,
 * and the **Calibration Log** that renders it back cannot disagree about which four
 * channels there are, which two carry a multiplier, or what a figure means.
 *
 * Everything here works in **the display's own encoding**. A multiplier reads
 * `1.02`, never `+2%`; an offset is in its channel's own unit. These are
 * transcriptions off the TL-25's screens, and a converted number would not match
 * the number on the boat (ADR 0005).
 */

/**
 * The four channels, in the order the `calibration_channel` enum declares them and
 * the order the form asks for them.
 */
export const CALIBRATION_CHANNELS = ['AWA', 'AWS', 'STW', 'HDG'] as const satisfies
  readonly CalibrationChannel[]

/**
 * The two channels the display gives a multiplier. Held as a set rather than as a
 * property of each channel's label, because `payload.AWA.multiplier` being *absent*
 * — not null — is a schema-level fact and this predicate is what decides it.
 */
const MULTIPLIER_CHANNELS: ReadonlySet<CalibrationChannel> = new Set(['AWS', 'STW'])

/** Whether this channel's correction is `multiplier × reading + offset` or just `+ offset`. */
export function hasMultiplier(channel: CalibrationChannel): boolean {
  return MULTIPLIER_CHANNELS.has(channel)
}

/** What the sailor sees. The channel code leads, because that is what the display shows. */
export const CHANNEL_LABEL: Record<CalibrationChannel, string> = {
  AWA: 'AWA — apparent wind angle',
  AWS: 'AWS — apparent wind speed',
  STW: 'STW — speed through water',
  HDG: 'HDG — heading',
}

/** Each channel's own unit: degrees for the two angles, knots for the two speeds. */
export const CHANNEL_UNIT: Record<CalibrationChannel, string> = {
  AWA: '°',
  AWS: 'kt',
  STW: 'kt',
  HDG: '°',
}

/** `'2°'`, `'-0.5 kt'`. A degree sign closes up; a knot label does not. */
export function formatOffset(channel: CalibrationChannel, offset: number): string {
  const unit = CHANNEL_UNIT[channel]
  return unit === '°' ? `${offset}°` : `${offset} ${unit}`
}

/**
 * `1.02`, to two decimals always.
 *
 * The display shows two, and `1.2` is not `1.02` — trailing-zero trimming here would
 * make two different transcriptions render identically.
 */
export function formatMultiplier(multiplier: number): string {
  return multiplier.toFixed(2)
}

/**
 * One figure in the display's own encoding, whichever of the two it is.
 *
 * The pair `(channel, field)` is what the **Calibration Log**'s diffs carry, so the
 * Log renders a figure through this rather than deciding for itself that a
 * multiplier has no unit and an offset does.
 */
export function formatFigure(
  channel: CalibrationChannel,
  field: 'multiplier' | 'offset',
  value: number
): string {
  return field === 'multiplier' ? formatMultiplier(value) : formatOffset(channel, value)
}

/** What a **Calibration Event**'s type is called on screen. */
export const CALIBRATION_EVENT_LABEL: Record<CalibrationEventType, string> = {
  autocompensation: 'Autocompensation',
  other: 'Other',
}

/** The form field carrying one channel's **Programmed Offset**. */
export function offsetField(channel: CalibrationChannel): string {
  return `offset-${channel}`
}

/** The form field carrying one channel's multiplier. Rendered for `AWS` and `STW` only. */
export function multiplierField(channel: CalibrationChannel): string {
  return `multiplier-${channel}`
}

/** How a form field is read, so this module needs no `FormData` and no DOM. */
export type ReadField = (name: string) => string | null

export type ParsedCalibration =
  | { ok: true; payload: InstrumentCalibrationPayload }
  | { ok: false; message: string }

/**
 * One figure, read as a number or refused.
 *
 * A blank or absent field is **refused**, not defaulted. A zero standing in for a
 * figure nobody typed is the one thing the core belief rules out, and it is
 * indistinguishable afterwards from a genuine `0.0` on the display.
 */
function figure(read: ReadField, name: string, describe: string): number | string {
  const typed = (read(name) ?? '').trim()

  if (typed === '') return `${describe} is missing. Type the figure the display shows.`

  // `Number` and not `parseFloat`: parseFloat('1,02') is 1, which would silently
  // store a European decimal comma as a different number.
  const value = Number(typed)

  if (!Number.isFinite(value)) {
    return `${describe} is not a number. Type the figure the display shows.`
  }

  return value
}

/**
 * Reads the four channels off a submitted form.
 *
 * Refuses only what is not a figure at all. Everything that *is* a figure is
 * accepted here and, if it looks unlikely, reported by `plausibilityWarnings` —
 * which warns and never blocks, because an implausible number may still be exactly
 * what is programmed into the box.
 */
export function parseCalibrationPayload(read: ReadField): ParsedCalibration {
  const payload: Partial<InstrumentCalibrationPayload> = {}

  for (const channel of CALIBRATION_CHANNELS) {
    const offset = figure(read, offsetField(channel), `${channel} offset`)
    if (typeof offset === 'string') return { ok: false, message: offset }

    if (!hasMultiplier(channel)) {
      // No multiplier key at all, rather than a null one: this channel has no such
      // field on the display, so the record must not claim a figure for it. A
      // multiplier submitted against it is dropped for the same reason.
      payload[channel] = { offset }
      continue
    }

    const multiplier = figure(read, multiplierField(channel), `${channel} multiplier`)
    if (typeof multiplier === 'string') return { ok: false, message: multiplier }

    payload[channel] = { multiplier, offset }
  }

  return { ok: true, payload: payload as InstrumentCalibrationPayload }
}

export interface CalibrationWarning {
  channel: CalibrationChannel
  field: 'multiplier' | 'offset'
  /** Copy for the sailor, which must never read as a refusal. */
  message: string
}

/**
 * What a figure would ordinarily fall within — a guide for the eye, and nothing the
 * database or either Server Action consults.
 *
 * The multiplier range is generous on purpose: a paddlewheel that reads 15% slow is
 * a paddlewheel this boat has actually had. The offsets are bounded by what an
 * alignment or a deviation table plausibly needs, not by what is physically
 * possible.
 */
const EXPECTED = {
  multiplier: { low: 0.8, high: 1.25 },
  offset: {
    AWA: { low: -20, high: 20 },
    AWS: { low: -5, high: 5 },
    STW: { low: -5, high: 5 },
    HDG: { low: -30, high: 30 },
  },
} as const

/**
 * Figures that sit outside their expected range, each with the copy to show beside
 * the field.
 *
 * **Warns, never blocks.** A hard block would be Layline telling the boat its own
 * display is wrong, and the display is the authority on what is programmed into it.
 * So this returns copy and no verdict: nothing downstream may branch on the result
 * to refuse a write.
 */
export function plausibilityWarnings(
  payload: InstrumentCalibrationPayload
): CalibrationWarning[] {
  const warnings: CalibrationWarning[] = []

  for (const channel of CALIBRATION_CHANNELS) {
    const { multiplier, offset } = payload[channel]

    if (multiplier !== undefined) {
      const { low, high } = EXPECTED.multiplier
      if (multiplier < low || multiplier > high) {
        warnings.push({
          channel,
          field: 'multiplier',
          message: `${channel} multiplier ${formatMultiplier(multiplier)} is outside the usual ${formatMultiplier(low)}–${formatMultiplier(high)}. It will be saved as typed — the display is the authority on what is programmed into it.`,
        })
      }
    }

    const { low, high } = EXPECTED.offset[channel]
    if (offset < low || offset > high) {
      warnings.push({
        channel,
        field: 'offset',
        message: `${channel} offset ${formatOffset(channel, offset)} is outside the usual ${formatOffset(channel, low)} to ${formatOffset(channel, high)}. It will be saved as typed — the display is the authority on what is programmed into it.`,
      })
    }
  }

  return warnings
}

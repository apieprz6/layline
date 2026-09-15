'use client'

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import {
  correctCalibrationVersion,
  recordCalibrationVersion,
} from '@/app/(app)/boat-management/instrument-calibration/actions'
import {
  CALIBRATION_CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_UNIT,
  hasMultiplier,
  multiplierField,
  offsetField,
  parseCalibrationPayload,
  plausibilityWarnings,
} from '@/lib/boat/calibration'
import { spacing } from '@/lib/utils/design'
import type { CalibrationChannel, InstrumentCalibrationVersion } from '@/types'

interface CalibrationVersionFormProps {
  /**
   * `record` mints a new Version; `correct` fixes an existing one in place. The two
   * are one form because they type the same six figures — and are one component so
   * that a correction cannot quietly grow a field a mint does not have.
   */
  mode: 'record' | 'correct'
  /**
   * In `correct` mode, the Version being corrected. In `record` mode, the Version in
   * force, whose figures the form starts from — or `null` when nothing is recorded
   * yet and every field starts empty.
   */
  version: InstrumentCalibrationVersion | null
  /** Called once the write has landed. */
  onDone: () => void
  onCancel: () => void
}

const FIELD_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-base)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  color: 'var(--input-fg)',
  background: 'var(--surface-base)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--input-radius)',
  padding: '8px 10px',
}

const TEXT_FIELD_STYLE: CSSProperties = {
  ...FIELD_STYLE,
  fontFamily: 'var(--font-body)',
  textAlign: 'left',
}

const BUTTON_STYLE: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-medium)',
  padding: '8px 14px',
  cursor: 'pointer',
}

const NOTE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  lineHeight: 1.45,
}

/** Every figure the form carries, keyed by its own field name. */
type Figures = Record<string, string>

/**
 * What the six fields start at: the given Version's figures, or blank.
 *
 * Blank and not `0`. A zero nobody typed is indistinguishable afterwards from a
 * genuine `0.0` on the display, and `parseCalibrationPayload` refuses a blank for
 * exactly that reason.
 *
 * `String` and not `formatMultiplier`, even though the multiplier is *shown* to two
 * decimals everywhere else. Nothing constrains a stored multiplier to two — the field
 * is `step="any"` — so a recorded `1.023` prefilled as `1.02` would be silently
 * rewritten by an admin who opened this form to correct a different channel
 * altogether. A form field is not a rendering of a figure; it is the figure.
 */
function startingFigures(version: InstrumentCalibrationVersion | null): Figures {
  const figures: Figures = {}

  for (const channel of CALIBRATION_CHANNELS) {
    const recorded = version?.payload[channel]

    figures[offsetField(channel)] = recorded === undefined ? '' : String(recorded.offset)

    if (hasMultiplier(channel)) {
      figures[multiplierField(channel)] =
        recorded?.multiplier === undefined ? '' : String(recorded.multiplier)
    }
  }

  return figures
}

/**
 * The form that records an **Instrument Calibration** Version, and the form that
 * corrects one.
 *
 * Every figure is typed in **the display's own encoding** — `1.02`, never `+2%` — and
 * the form says so, because a sailor reading a multiplier field with no unit has no
 * other way to know which convention is wanted.
 *
 * Implausible figures **warn and still save**. The warnings appear as they are typed
 * and nothing here consults them before submitting: a hard block would be Layline
 * telling the boat its own display is wrong. That is also why the inputs carry no
 * `min` or `max` — the browser would refuse the value on the form's behalf — and why
 * they are not the mockup's ± steppers, which cannot express a figure outside their
 * range at all.
 *
 * A Version snapshots **all four channels**, so all six figures are submitted whichever
 * one moved. In `record` mode they start at the Version in force, and the copy says to
 * check every one against the display rather than trusting the ones left alone.
 */
export default function CalibrationVersionForm({
  mode,
  version,
  onDone,
  onCancel,
}: CalibrationVersionFormProps): ReactElement {
  const [figures, setFigures] = useState<Figures>(() => startingFigures(version))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const correcting = mode === 'correct'

  // Recomputed as the sailor types. While any figure is still blank or unparseable
  // the parse refuses and there is simply nothing to warn about yet — the refusal
  // itself is not shown here, because a field being half-typed is not a mistake.
  const warnings = useMemo(() => {
    const parsed = parseCalibrationPayload((name) => figures[name] ?? null)
    return parsed.ok ? plausibilityWarnings(parsed.payload) : []
  }, [figures])

  function warningFor(channel: CalibrationChannel, field: 'multiplier' | 'offset'): string | null {
    return warnings.find((w) => w.channel === channel && w.field === field)?.message ?? null
  }

  function set(name: string, value: string): void {
    setFigures((current) => ({ ...current, [name]: value }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setSaving(true)
    setMessage(null)
    const result = correcting
      ? await correctCalibrationVersion(formData)
      : await recordCalibrationVersion(formData)
    setSaving(false)

    if (result.ok) {
      onDone()
      return
    }

    // The refusal stays beside the fields that caused it, and every figure keeps what
    // was typed — a transcription off a display is not worth making twice.
    setMessage(result.message)
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="calibration-version-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(4),
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        padding: spacing(4),
      }}
    >
      <div>
        <div style={EYEBROW_STYLE}>
          {correcting ? `Correct v${version?.version_number} in place` : 'Record new values'}
        </div>
        <p style={NOTE_STYLE}>
          Type each figure <strong>exactly as the display shows it</strong>: a multiplier as{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>1.02</span>, not as +2%. Layline stores
          what is programmed into the instrument, so a converted number would no longer match the
          boat.
        </p>
      </div>

      {correcting ? (
        <p
          data-testid="correction-consequence"
          style={{ ...NOTE_STYLE, color: 'var(--wind-heavy)' }}
        >
          This changes v{version?.version_number} itself rather than adding a Version. Every race
          already sailed under it will report against the corrected figures — so correct a typo
          here, and record new values instead when the instrument actually changed.
        </p>
      ) : (
        <p style={NOTE_STYLE}>
          All four channels are recorded together, so check every figure against the display — not
          only the one you changed.
        </p>
      )}

      {correcting && <input type="hidden" name="version_id" value={version?.id ?? ''} />}

      {CALIBRATION_CHANNELS.map((channel) => (
        <div key={channel}>
          <div style={{ ...EYEBROW_STYLE, marginBottom: '6px' }}>{CHANNEL_LABEL[channel]}</div>

          <div style={{ display: 'flex', gap: spacing(3) }}>
            {hasMultiplier(channel) && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <label
                  htmlFor={`cal-${multiplierField(channel)}`}
                  style={{ ...EYEBROW_STYLE, display: 'block', textTransform: 'none' }}
                >
                  Multiplier
                </label>
                <input
                  id={`cal-${multiplierField(channel)}`}
                  name={multiplierField(channel)}
                  value={figures[multiplierField(channel)] ?? ''}
                  onChange={(event) => set(multiplierField(channel), event.target.value)}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  required
                  autoComplete="off"
                  style={FIELD_STYLE}
                />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <label
                htmlFor={`cal-${offsetField(channel)}`}
                style={{ ...EYEBROW_STYLE, display: 'block', textTransform: 'none' }}
              >
                Offset ({CHANNEL_UNIT[channel]})
              </label>
              <input
                id={`cal-${offsetField(channel)}`}
                name={offsetField(channel)}
                value={figures[offsetField(channel)] ?? ''}
                onChange={(event) => set(offsetField(channel), event.target.value)}
                type="number"
                step="any"
                inputMode="decimal"
                required
                autoComplete="off"
                style={FIELD_STYLE}
              />
            </div>
          </div>

          {/* `status` and not `alert`: this is a remark on a figure that is about to be
              saved, not a refusal of it, and an assertive announcement would say
              otherwise to anyone listening. */}
          {(['multiplier', 'offset'] as const).map((field) => {
            const warning = warningFor(channel, field)
            if (warning === null) return null

            return (
              <p
                key={field}
                role="status"
                data-testid={`calibration-warning-${channel}-${field}`}
                style={{ ...NOTE_STYLE, marginTop: '6px', color: 'var(--wind-heavy)' }}
              >
                {warning}
              </p>
            )
          })}
        </div>
      ))}

      <div>
        <label
          htmlFor="cal-effective-from"
          style={{ ...EYEBROW_STYLE, display: 'block' }}
        >
          Effective from
        </label>
        <input
          id="cal-effective-from"
          name="effective_from"
          type="date"
          defaultValue={version !== null && correcting ? version.effective_from : ''}
          required
          style={TEXT_FIELD_STYLE}
        />
        <p style={{ ...NOTE_STYLE, marginTop: '4px' }}>
          The day these figures went into the display — which is not the day you are typing them
          in. Layline records that separately.
        </p>
      </div>

      <div>
        <label htmlFor="cal-note" style={{ ...EYEBROW_STYLE, display: 'block' }}>
          Note (optional)
        </label>
        <textarea
          id="cal-note"
          name="note"
          defaultValue={correcting ? (version?.note ?? '') : ''}
          rows={2}
          style={{ ...TEXT_FIELD_STYLE, resize: 'vertical' }}
        />
        <p style={{ ...NOTE_STYLE, marginTop: '4px' }}>
          Why, if the figures do not say it themselves — the Calibration Log already shows what
          moved.
        </p>
      </div>

      {message !== null && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--wind-storm)',
          }}
        >
          {message}
        </p>
      )}

      <div style={{ display: 'flex', gap: spacing(2) }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-ghost-bg)',
            border: '1px solid var(--btn-ghost-border)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-ghost-fg)',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            ...BUTTON_STYLE,
            background: 'var(--btn-primary-bg)',
            border: '1px solid var(--btn-primary-bg)',
            borderRadius: 'var(--btn-primary-radius)',
            color: 'var(--btn-primary-fg)',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving' : correcting ? 'Save the correction' : 'Record the Version'}
        </button>
      </div>
    </form>
  )
}

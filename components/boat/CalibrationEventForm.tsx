'use client'

import { useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { addCalibrationEvent } from '@/app/(app)/boat-management/instrument-calibration/actions'
import { CALIBRATION_CHANNELS, CHANNEL_LABEL } from '@/lib/boat/calibration'
import { spacing } from '@/lib/utils/design'
import type { CalibrationEventType } from '@/types'

interface CalibrationEventFormProps {
  onDone: () => void
  onCancel: () => void
}

const TEXT_FIELD_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--input-fg)',
  background: 'var(--surface-base)',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--input-radius)',
  padding: '8px 10px',
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

const CHOICE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: spacing(2),
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

/**
 * Records a **Calibration Event**: a dated act with **no value**.
 *
 * There is no numeric field anywhere on this form, and that absence is the point. An
 * autocompensation rebuilds the compass's own deviation table — nobody types a figure,
 * and no programmed coefficient changes — so an Event that carried a number would be
 * claiming something the act does not produce. Numbers belong to a Version, and a
 * **Measured Offset** is derived from a Race and never written back here (ADR 0005).
 *
 * The note is required for the same reason: it is the whole content of the entry.
 *
 * An autocompensation is fixed to `HDG` rather than offered against the other three.
 * It is a compass operation by definition, so a channel set to choose from would be
 * offering three choices that are all refusals. `autocompensation_is_hdg_only` refuses
 * them in the database as well.
 */
export default function CalibrationEventForm({
  onDone,
  onCancel,
}: CalibrationEventFormProps): ReactElement {
  const [type, setType] = useState<CalibrationEventType>('autocompensation')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setSaving(true)
    setMessage(null)
    const result = await addCalibrationEvent(formData)
    setSaving(false)

    if (result.ok) {
      onDone()
      return
    }

    setMessage(result.message)
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="calibration-event-form"
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
        <div style={EYEBROW_STYLE}>Add a calibration event</div>
        <p style={NOTE_STYLE}>
          An act performed on the instruments with no figure to type — an autocompensation, a
          compass swing, a paddlewheel swapped. Nothing is versioned and no programmed value
          changes; the act itself is what is recorded.
        </p>
      </div>

      <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
        <legend style={{ ...EYEBROW_STYLE, padding: 0 }}>What was done</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          <label style={CHOICE_STYLE}>
            <input
              type="radio"
              name="type"
              value="autocompensation"
              checked={type === 'autocompensation'}
              onChange={() => setType('autocompensation')}
            />
            <span>
              Autocompensation
              <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                Two slow circles in flat water. The compass rebuilds its own deviation table.
              </span>
            </span>
          </label>

          <label style={CHOICE_STYLE}>
            <input
              type="radio"
              name="type"
              value="other"
              checked={type === 'other'}
              onChange={() => setType('other')}
            />
            <span>
              Other
              <span style={{ display: 'block', color: 'var(--text-muted)' }}>
                Anything else worth a dated line in the Log. The note says what.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {type === 'autocompensation' ? (
        <div>
          <div style={EYEBROW_STYLE}>Channel</div>
          <input type="hidden" name="channels" value="HDG" />
          <p style={{ ...NOTE_STYLE, color: 'var(--text-primary)' }}>
            {CHANNEL_LABEL.HDG}
            <span style={{ display: 'block', color: 'var(--text-muted)' }}>
              An autocompensation is a compass operation, so there is nothing else to choose.
            </span>
          </p>
        </div>
      ) : (
        <fieldset style={{ margin: 0, padding: 0, border: 'none' }}>
          <legend style={{ ...EYEBROW_STYLE, padding: 0 }}>Channels affected</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
            {CALIBRATION_CHANNELS.map((channel) => (
              <label key={channel} style={CHOICE_STYLE}>
                <input type="checkbox" name="channels" value={channel} />
                <span>{CHANNEL_LABEL[channel]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="event-occurred-on" style={{ ...EYEBROW_STYLE, display: 'block' }}>
          Date
        </label>
        <input
          id="event-occurred-on"
          name="occurred_on"
          type="date"
          required
          style={TEXT_FIELD_STYLE}
        />
      </div>

      <div>
        <label htmlFor="event-note" style={{ ...EYEBROW_STYLE, display: 'block' }}>
          Note
        </label>
        <textarea
          id="event-note"
          name="note"
          rows={3}
          required
          style={{ ...TEXT_FIELD_STYLE, resize: 'vertical' }}
        />
        <p style={{ ...NOTE_STYLE, marginTop: '4px' }}>
          Required. There is no figure on this entry, so the note is the whole of what it records.
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
          {saving ? 'Saving' : 'Add to the Log'}
        </button>
      </div>
    </form>
  )
}

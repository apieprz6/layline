import type { CSSProperties, ReactElement } from 'react'
import { CALIBRATION_EVENT_LABEL } from '@/lib/boat/calibration'
import { buildCalibrationLog, describeChange } from '@/lib/boat/calibrationLog'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { CalibrationEvent, InstrumentCalibrationVersion } from '@/types'

interface CalibrationLogProps {
  versions: InstrumentCalibrationVersion[]
  events: CalibrationEvent[]
}

const DATE_STYLE: CSSProperties = {
  flex: '0 0 82px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-muted)',
  paddingTop: '2px',
}

const HEADLINE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
}

const CHANGE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
}

const PROSE_STYLE: CSSProperties = {
  margin: '4px 0 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
}

/**
 * The **Calibration Log**: one dated timeline over Version mints and **Calibration
 * Events**.
 *
 * Assembled here and stored nowhere. Every line on the screen is derived from the two
 * lists it is handed — a Version mint is rendered as a *diff against the Version
 * before it*, computed at read, so no change is written down twice and no two
 * recordings of one change can disagree (ADR 0005).
 *
 * It is also the Version history: there is no second list, because "what changed" and
 * "when was it changed" are one question. The mockup's separate "Version history"
 * panel, with its uploader line, is the shape being refused — nothing here is
 * uploaded, and the Log already carries every date.
 *
 * No current pointer is marked. "What is the boat set to now" is answered by the
 * current Version above, and never by reading back down through this.
 *
 * A Server Component: a list of dates has nothing to hold.
 */
export default function CalibrationLog({ versions, events }: CalibrationLogProps): ReactElement {
  const entries = buildCalibrationLog(versions, events)

  if (entries.length === 0) {
    return (
      <p
        data-testid="calibration-log-empty"
        style={{ ...PROSE_STYLE, margin: 0, color: 'var(--text-muted)' }}
      >
        Nothing has been recorded against this instrument yet. Values and calibration acts
        both appear here, newest first, once there are any.
      </p>
    )
  }

  return (
    <div data-testid="calibration-log">
      {entries.map((entry) => (
        <div
          key={entry.entry === 'version' ? entry.version.id : entry.event.id}
          style={{
            display: 'flex',
            gap: spacing(3),
            padding: `${spacing(3)} 0`,
            borderBottom: '1px solid var(--surface-divider)',
          }}
        >
          <div style={DATE_STYLE}>{formatCalendarDate(entry.date)}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {entry.entry === 'version' ? (
              <>
                <div style={{ ...HEADLINE_STYLE, color: 'var(--text-primary)' }}>
                  {entry.isFirst ? 'First recorded' : 'Values changed'} · v
                  {entry.version.version_number}
                </div>

                {entry.changes.length === 0 ? (
                  // A Version that snapshots the same six figures as the one before it.
                  // Legitimate — a Version is minted per act, not per difference — and
                  // saying so beats an entry that looks like a rendering failure.
                  <div style={{ ...CHANGE_STYLE, fontFamily: 'var(--font-body)' }}>
                    No figure moved.
                  </div>
                ) : (
                  entry.changes.map((change) => (
                    <div key={`${change.channel}-${change.field}`} style={CHANGE_STYLE}>
                      {describeChange(change)}
                    </div>
                  ))
                )}

                {entry.version.note !== null && <p style={PROSE_STYLE}>{entry.version.note}</p>}
              </>
            ) : (
              <>
                <div style={{ ...HEADLINE_STYLE, color: 'var(--wind-heavy)' }}>
                  {CALIBRATION_EVENT_LABEL[entry.event.type]} · {entry.event.channels.join(', ')}
                </div>

                {/* The note is the whole content of an Event, which is why it is
                    required: there is no figure for it to sit beside. */}
                <p style={PROSE_STYLE}>{entry.event.note}</p>

                <p style={{ ...PROSE_STYLE, color: 'var(--text-muted)' }}>
                  {entry.event.type === 'autocompensation'
                    ? 'No programmed figure changed — the instrument rebuilt its own deviation table.'
                    : 'No programmed figure changed.'}
                </p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

'use client'

import { useState, type CSSProperties, type ReactElement } from 'react'
import CalibrationEventForm from '@/components/boat/CalibrationEventForm'
import CalibrationVersionForm from '@/components/boat/CalibrationVersionForm'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import type { InstrumentCalibrationVersion } from '@/types'

interface CalibrationWritesProps {
  /** Every Version, ascending by version number. */
  versions: InstrumentCalibrationVersion[]
  /** The Version in force, whose figures a new one starts from. */
  currentVersionId: string | null
}

type Panel = 'closed' | 'record' | 'event' | 'correct'

const ACTION_STYLE: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  padding: '10px 12px',
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border-hover)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

const HINT_STYLE: CSSProperties = {
  margin: '5px 2px 0',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  lineHeight: 1.45,
}

const CHIP_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  padding: '6px 11px',
  borderRadius: 'var(--radius-full)',
  cursor: 'pointer',
}

/**
 * The three writes an **admin** has on this screen, and their one shared rule: only
 * one is open at a time.
 *
 * They are kept apart, each under its own sentence, because two of them are genuinely
 * easy to confuse and the consequences differ. Recording new values *adds* a Version
 * and leaves history alone; correcting one *changes* what every Race already sailed
 * under it reports. Adding a Calibration Event records an act with no figure at all.
 * The prototype settled that the difference belongs in the button's own label and hint
 * rather than behind a help icon.
 *
 * This decides only what to *offer*. Every one of the three re-checks the Role on the
 * server, and RLS refuses the write a second time through `public.is_admin()` — a
 * Server Action is a public endpoint, and a component that renders no button is not a
 * check.
 */
export default function CalibrationWrites({
  versions,
  currentVersionId,
}: CalibrationWritesProps): ReactElement {
  const [panel, setPanel] = useState<Panel>('closed')

  const current = versions.find((version) => version.id === currentVersionId) ?? null
  const latest = versions.length === 0 ? null : versions[versions.length - 1]

  // Only what the sailor picked, and no default seeded into it. A `useState`
  // initializer runs once, and this island is re-rendered rather than remounted when
  // a write revalidates the page — so an id seeded from the empty archive would still
  // be `null` the moment after the first Version was recorded, and the correction
  // panel would open on nothing at all.
  const [picked, setPicked] = useState<string | null>(null)

  // The default is derived instead: the current Version, which is where a freshly
  // mistyped figure will be.
  const correcting = versions.find((version) => version.id === picked) ?? current ?? latest

  if (panel === 'record') {
    return (
      <CalibrationVersionForm
        mode="record"
        version={current}
        onDone={() => setPanel('closed')}
        onCancel={() => setPanel('closed')}
      />
    )
  }

  if (panel === 'event') {
    return (
      <CalibrationEventForm onDone={() => setPanel('closed')} onCancel={() => setPanel('closed')} />
    )
  }

  if (panel === 'correct' && correcting !== null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        {versions.length > 1 && (
          <div>
            <div style={EYEBROW_STYLE}>Which Version has the typo</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing(2) }}>
              {versions.map((version) => {
                const chosen = version.id === correcting.id
                return (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setPicked(version.id)}
                    aria-pressed={chosen}
                    style={{
                      ...CHIP_STYLE,
                      background: chosen ? 'var(--blue-muted)' : 'var(--surface-raised)',
                      border: chosen
                        ? '1.5px solid var(--blue-500)'
                        : '1px solid var(--surface-border)',
                      color: chosen ? 'var(--text-accent)' : 'var(--text-secondary)',
                    }}
                  >
                    v{version.version_number}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Keyed on the Version so switching chips rebuilds the fields from it rather
            than leaving the previous Version's figures in a form now labelled with
            another's number. */}
        <CalibrationVersionForm
          key={correcting.id}
          mode="correct"
          version={correcting}
          onDone={() => setPanel('closed')}
          onCancel={() => setPanel('closed')}
        />
      </div>
    )
  }

  return (
    <section
      data-testid="calibration-writes"
      style={{
        padding: spacing(4),
        background: 'var(--surface-elevated)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={EYEBROW_STYLE}>Admin only</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <div>
          <button type="button" onClick={() => setPanel('record')} style={ACTION_STYLE}>
            Record new values
          </button>
          <p style={HINT_STYLE}>
            The figures programmed into the display changed. This adds a Version, effective from
            the day you changed them, and leaves every earlier one exactly as it was.
          </p>
        </div>

        <div>
          <button type="button" onClick={() => setPanel('event')} style={ACTION_STYLE}>
            Add a calibration event
          </button>
          <p style={HINT_STYLE}>
            Something was performed on the instruments with no figure to type — an
            autocompensation, a compass swing, a paddlewheel swapped. Nothing is versioned; the
            dated act is recorded.
          </p>
        </div>

        {latest !== null && (
          <div>
            <button type="button" onClick={() => setPanel('correct')} style={ACTION_STYLE}>
              Correct a recorded Version in place
            </button>
            <p style={HINT_STYLE}>
              For a figure typed in wrongly, and only that. A Version is otherwise permanent, but a
              typo is not a history — and left standing it would be what every Race under that
              Version reports.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

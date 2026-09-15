import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import CalibrationLog from '@/components/boat/CalibrationLog'
import CalibrationValues from '@/components/boat/CalibrationValues'
import CalibrationWrites from '@/components/boat/CalibrationWrites'
import EmptyState from '@/components/common/EmptyState'
import NotRecorded from '@/components/common/NotRecorded'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { BOAT_SETUP_LABEL } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { InstrumentCalibrationRecord } from '@/types'

interface InstrumentCalibrationContentProps {
  /** `null` when the artifact could not be read — not an artifact with nothing in it. */
  record: InstrumentCalibrationRecord | null
  /** Whether this sailor may write: `admin` only (ADR 0019). */
  canWrite: boolean
}

const SECTION_STYLE: CSSProperties = {
  padding: `0 ${spacing(4)} ${spacing(4)}`,
}

const PROSE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  lineHeight: 1.45,
}

/**
 * **Instrument Calibration** — the fourth Boat Setup artifact, and its **Calibration
 * Log**.
 *
 * Three things, in the order a sailor asks for them: what the display is set to now,
 * the writes an admin has, and one dated record of everything that ever happened to
 * the instrument. There is no separate version history, because the Log is it.
 *
 * There is nothing here about *sending* these figures anywhere. Layline cannot reach
 * the TL-25 from a web app, so the mockup's "Push to instruments?" banner is a control
 * over hardware this application has no route to; and nothing about this artifact is a
 * file, so there is no filename and no Download either (ADR 0005). What the screen
 * records is what a person read off a display and typed in.
 *
 * A Server Component. The only client island is the admin's write panel — a sailor who
 * cannot write is served no interactive JavaScript for this screen at all.
 */
export default function InstrumentCalibrationContent({
  record,
  canWrite,
}: InstrumentCalibrationContentProps): ReactElement {
  const current =
    record === null
      ? null
      : (record.versions.find((version) => version.id === record.currentVersionId) ?? null)

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: spacing(4),
        }}
      >
        <Link
          href="/boat-management"
          style={{
            display: 'inline-block',
            marginBottom: '8px',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-accent)',
            textDecoration: 'none',
          }}
        >
          ← Boat management
        </Link>

        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-bold)',
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          {BOAT_SETUP_LABEL.instrument_calibration}
        </h1>

        {current !== null && (
          <div
            style={{
              marginTop: '4px',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
            }}
          >
            v{current.version_number} current · effective{' '}
            {formatCalendarDate(current.effective_from)}
          </div>
        )}
      </div>

      {record === null ? (
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="⚓"
            title="The calibration could not be read"
            detail="Nothing is shown rather than a guess at what the instruments are set to. Sign in again, or try once more in a moment."
          />
        </div>
      ) : (
        <>
          <div style={{ ...SECTION_STYLE, paddingTop: spacing(4) }}>
            <div style={EYEBROW_STYLE}>As programmed</div>

            {current === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
                <NotRecorded />
                <p style={PROSE_STYLE}>
                  No Version has been recorded, so Layline does not know what the display is set
                  to. It is not showing zeros in the meantime.
                </p>
              </div>
            ) : (
              <>
                <CalibrationValues payload={current.payload} />
                <p style={{ ...PROSE_STYLE, marginTop: spacing(3) }}>
                  In the display&rsquo;s own encoding, exactly as transcribed: a multiplier reads{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>1.02</span>, not +2%. Each
                  channel corrects a reading as{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    multiplier × reading + offset
                  </span>
                  , and AWA and HDG take an offset alone.
                </p>
                {current.note !== null && (
                  <p style={{ ...PROSE_STYLE, marginTop: spacing(2), color: 'var(--text-secondary)' }}>
                    {current.note}
                  </p>
                )}
              </>
            )}
          </div>

          {canWrite && (
            <div style={SECTION_STYLE}>
              <CalibrationWrites
                versions={record.versions}
                currentVersionId={record.currentVersionId}
              />
            </div>
          )}

          <div style={SECTION_STYLE}>
            <div style={EYEBROW_STYLE}>Calibration Log</div>
            <p style={{ ...PROSE_STYLE, marginBottom: spacing(3) }}>
              One list. Figures that changed and acts with no figure sit in the same chronology,
              because &ldquo;what happened to this instrument&rdquo; is one question. Each Version
              is shown as what it changed, worked out when you read it and stored nowhere.
            </p>
            <CalibrationLog versions={record.versions} events={record.events} />
          </div>
        </>
      )}
    </div>
  )
}

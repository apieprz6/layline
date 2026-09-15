import type { ReactElement } from 'react'
import Link from 'next/link'
import NotRecorded from '@/components/common/NotRecorded'
import { BOAT_SETUP_LABEL, boatSetupHref, opensUnrecorded } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { BoatSetupRow } from '@/types'

interface BoatSetupListProps {
  /** The four artifacts, already in reading order — `readBoatSetup` owns that. */
  artifacts: BoatSetupRow[]
  /** Whether this sailor may record a Version: `admin` only (ADR 0019). */
  canWrite: boolean
}

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing(3),
  width: '100%',
  padding: '13px 4px',
  borderBottom: '1px solid var(--surface-divider)',
  textAlign: 'left' as const,
  textDecoration: 'none',
}

const NAME_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
}

const CHEVRON_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-muted)',
  flexShrink: 0,
}

const CURRENT_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

/**
 * The four Boat Setup artifacts, one row each.
 *
 * A row states what it is and what Version is in force, and nothing else. There is
 * deliberately no filename, no Download and no upload affordance on any row: a Rig
 * Tune and an Instrument Calibration have no file behind them at all — they are
 * entered as forms — and the two that do are uploaded from their own detail screen
 * (LAY-106 to LAY-108), not from this list. The mockup's `Wayward_Wind.rig` and its
 * "Upload a new version any time you refit" subtitle are the shapes being refused.
 *
 * Four rows, not five. A Crossover Chart carries its own Sail Definitions, so there
 * are four Version pointers on the boat (ADR 0012).
 *
 * A Server Component: a row either links somewhere or is inert, and neither needs
 * the client.
 */
export default function BoatSetupList({ artifacts, canWrite }: BoatSetupListProps): ReactElement {
  return (
    <div data-testid="boat-setup-list">
      {artifacts.map(({ kind, current }) => {
        const name = (
          <span data-testid="artifact-name" style={NAME_STYLE}>
            {BOAT_SETUP_LABEL[kind]}
          </span>
        )

        if (current === null) {
          // Nothing recorded means nothing to *read*. A row dressed as a control that
          // leads to an empty screen is the trap LAY-102 fixed on the locked drawer
          // row, so for a viewer an unrecorded artifact is plain text with no chevron.
          //
          // For an admin it is a place to go: a Rig Tune has no file behind it, so its
          // screen is where the first Version is typed, and a row that waits for a
          // Version before it opens waits forever. It still says "Not recorded" — what
          // is offered is an empty form, not a Version.
          const empty = (
            <>
              {name}
              {/* Held at its own width: at 390px "Instrument Calibration" and this
                  badge share one line, and a squashed badge is a broken shape. */}
              <span style={{ flexShrink: 0 }}>
                <NotRecorded />
              </span>
            </>
          )

          return opensUnrecorded(kind, canWrite) ? (
            <Link key={kind} href={boatSetupHref(kind)} style={ROW_STYLE}>
              {empty}
            </Link>
          ) : (
            <div key={kind} style={ROW_STYLE}>
              {empty}
            </div>
          )
        }

        return (
          <Link key={kind} href={boatSetupHref(kind)} style={ROW_STYLE}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              {name}
              <span style={CURRENT_STYLE}>
                v{current.version_number} · effective{' '}
                {formatCalendarDate(current.effective_from)}
              </span>
            </span>
            <span aria-hidden="true" style={CHEVRON_STYLE}>
              ›
            </span>
          </Link>
        )
      })}
    </div>
  )
}

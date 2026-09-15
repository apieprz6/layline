import type { ReactElement } from 'react'
import Link from 'next/link'
import NotRecorded from '@/components/common/NotRecorded'
import { BOAT_SETUP_LABEL, boatSetupHref, hasDetailScreen } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { BoatSetupRow } from '@/types'

interface BoatSetupListProps {
  /** The four artifacts, already in reading order — `readBoatSetup` owns that. */
  artifacts: BoatSetupRow[]
  /**
   * Whether this sailor may add a Version: `admin` only (ADR 0019).
   *
   * It decides one thing here — whether an artifact with nothing recorded is a way in to the
   * screen that would let them record the first one. It never hides a Version from a viewer.
   */
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
 * deliberately no filename and no Download on any row: a Rig Tune and an Instrument
 * Calibration have no file behind them at all — they are entered as forms — and the
 * two that do are uploaded from their own detail screen, not from this list. The
 * mockup's `Wayward_Wind.rig` and its "Upload a new version any time you refit"
 * subtitle are the shapes being refused.
 *
 * A row is a link only when there is a screen at the other end of it. `Polar`'s
 * arrived with LAY-106; the other three follow, and until then their rows are inert
 * whether or not a Version exists — a row dressed as a control that leads to a 404 is
 * the trap LAY-102 fixed on the locked drawer row.
 *
 * With nothing recorded, the row is still the way in for whoever may record the first
 * one. An admin gets a link, because the screen behind it is where the upload lives;
 * a viewer gets plain text, because for them that screen has nothing on it they have
 * not already been told here.
 *
 * Four rows, not five. A Crossover Chart carries its own Sail Definitions, so there
 * are four Version pointers on the boat (ADR 0012).
 *
 * A Server Component: a row either links somewhere or is inert, and neither needs
 * the client.
 */
export default function BoatSetupList({
  artifacts,
  canWrite,
}: BoatSetupListProps): ReactElement {
  return (
    <div data-testid="boat-setup-list">
      {artifacts.map(({ kind, current }) => {
        const name = (
          <span data-testid="artifact-name" style={NAME_STYLE}>
            {BOAT_SETUP_LABEL[kind]}
          </span>
        )

        const label = (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            {name}
            {current !== null && (
              <span style={CURRENT_STYLE}>
                v{current.version_number} · effective {formatCalendarDate(current.effective_from)}
              </span>
            )}
          </span>
        )

        const absence =
          current === null ? (
            // Held at its own width: at 390px "Instrument Calibration" and this badge
            // share one line, and a squashed badge is a broken shape.
            <span style={{ flexShrink: 0 }}>
              <NotRecorded />
            </span>
          ) : null

        // Nothing to open: either the screen is not built yet, or it is built and this
        // sailor would find nothing on it — no Version to read and no upload to make.
        if (!hasDetailScreen(kind) || (current === null && !canWrite)) {
          return (
            <div key={kind} style={ROW_STYLE}>
              {label}
              {absence}
            </div>
          )
        }

        return (
          <Link key={kind} href={boatSetupHref(kind)} style={ROW_STYLE}>
            {label}
            <span style={{ display: 'flex', alignItems: 'center', gap: spacing(2), flexShrink: 0 }}>
              {absence}
              <span aria-hidden="true" style={CHEVRON_STYLE}>
                ›
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

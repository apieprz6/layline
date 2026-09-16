import type { ReactElement } from 'react'
import Link from 'next/link'
import NotRecorded from '@/components/common/NotRecorded'
import { BOAT_SETUP_LABEL, boatSetupHref } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { BoatSetupRow } from '@/types'

interface BoatSetupListProps {
  /** The four artifacts, already in reading order — `readBoatSetup` owns that. */
  artifacts: BoatSetupRow[]
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
 * Every row is a link. All four detail screens exist now — the Polar's (LAY-106), the
 * Rig Tune's (LAY-107), the Instrument Calibration's (LAY-108) and the Crossover
 * Chart's (LAY-109) — so the gate that kept an unbuilt row inert, which was there to
 * avoid LAY-102's trap of a control that leads to a 404, has nothing left to hold back
 * and is gone.
 *
 * A row links to its detail including when nothing is recorded yet, because recording
 * the first Version is what that screen is for, and a link gated on a pointer would
 * leave the empty archive this app ships in with no way to fill itself. Nor is the gate
 * the *role*: a viewer opening an unrecorded artifact reads why there is nothing to read
 * (ADR 0019 governs writes only).
 *
 * Four rows, not five. A Crossover Chart carries its own Sail Definitions, so there
 * are four Version pointers on the boat (ADR 0012).
 *
 * A Server Component: a row is a link, and a link does not need the client.
 */
export default function BoatSetupList({ artifacts }: BoatSetupListProps): ReactElement {
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

import type { ReactElement } from 'react'
import BoatIdentityEditor from '@/components/boat/BoatIdentityEditor'
import BoatIdentityHeader from '@/components/boat/BoatIdentityHeader'
import BoatSetupList from '@/components/boat/BoatSetupList'
import EmptyState from '@/components/common/EmptyState'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { spacing } from '@/lib/utils/design'
import type { BoatSetup } from '@/types'

interface BoatManagementContentProps {
  /** `null` when the boat could not be read — not an empty boat. */
  page: BoatSetup | null
  /** Whether this sailor may edit the identity: `admin` only (ADR 0019). */
  canWrite: boolean
}

/**
 * **Boat management**: the boat's identity, and its four **Boat Setup** artifacts.
 *
 * The header *is* the identity — name and model, read from `boats` and edited in
 * place by an admin. Beneath it, one list of four rows: Polar, Crossover Chart, Rig
 * Tune, Instrument Calibration. Four, not five: a Crossover Chart carries its own
 * Sail Definitions (ADR 0012).
 *
 * A Server Component apart from the admin's editor, which is the only interactive
 * thing on the screen.
 */
export default function BoatManagementContent({
  page,
  canWrite,
}: BoatManagementContentProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: `${spacing(4)} ${spacing(4)}`,
        }}
      >
        {page === null ? (
          // With no row to read from, the section falls back to naming itself. It
          // does not name the boat: a blank identity, or a remembered one, would be
          // this screen inventing its own subject.
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
            Boat management
          </h1>
        ) : (
          <>
            {/* Above the identity in both its states, open and being edited, so the
                sailor never loses which section they are on while the name itself is
                in a text field. The mockup keeps its "Boat identity" label for the
                same reason. */}
            <div style={EYEBROW_STYLE}>Boat management</div>
            {canWrite ? (
              <BoatIdentityEditor boat={page.boat} />
            ) : (
              <BoatIdentityHeader name={page.boat.name} model={page.boat.model} />
            )}
          </>
        )}
      </div>

      {page === null ? (
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="⚓"
            title="The boat could not be read"
            detail="Nothing about the boat is shown rather than a guess at it. Sign in again, or try once more in a moment."
          />
        </div>
      ) : (
        <div style={{ padding: spacing(4) }}>
          <div style={EYEBROW_STYLE}>Boat setup</div>
          <BoatSetupList artifacts={page.artifacts} />
        </div>
      )}
    </div>
  )
}

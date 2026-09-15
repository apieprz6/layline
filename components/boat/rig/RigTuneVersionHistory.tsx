import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { RigTuneVersionRecord } from '@/types'

interface RigTuneVersionHistoryProps {
  /** Newest first — `readRigTune` owns that order. */
  versions: RigTuneVersionRecord[]
  /** The Version the boat is set to. Null before the first one exists. */
  currentVersionId: string | null
  /** The Version the screen is showing, so the list can mark where the reader is. */
  shownVersionId: string
  /** The reader's own user id, for "by you". Nobody else is named. */
  readerId: string
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '10px 4px',
  borderBottom: '1px solid var(--surface-divider)',
  textDecoration: 'none',
}

const CHIP_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const META_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const IN_FORCE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--state-info)',
  border: '1px solid var(--state-info)',
  borderRadius: 'var(--radius-sm)',
  padding: '1px 6px',
  flexShrink: 0,
}

/**
 * Every Version of the Rig Tune, newest first, each one openable.
 *
 * Past Versions stay readable because a Race freezes a pointer at whichever one the boat was
 * set to, and a pointer nobody can follow records nothing (ADR 0007). The pointer moves
 * forward only, so an older Version is testimony rather than something to restore.
 *
 * "by you" is the only authorship this screen states: the row carries a `created_by` uuid,
 * and turning one into a name would mean reading `profiles` for somebody else's identity.
 *
 * A Server Component: each row is a link.
 */
export default function RigTuneVersionHistory({
  versions,
  currentVersionId,
  shownVersionId,
  readerId,
}: RigTuneVersionHistoryProps): ReactElement {
  return (
    <div>
      <div style={EYEBROW_STYLE}>Versions</div>
      <div data-testid="rig-tune-version-history">
        {versions.map((version) => {
          const inForce = version.id === currentVersionId
          const shown = version.id === shownVersionId

          return (
            <Link
              key={version.id}
              // The Version in force is what this route shows by default, so its own row
              // links to the plain screen rather than pinning a number into the URL.
              href={inForce ? '/boat-management/rig-tune' : `/boat-management/rig-tune?version=${version.version_number}`}
              aria-current={shown ? 'page' : undefined}
              data-testid="rig-tune-version"
              style={{
                ...ROW_STYLE,
                background: shown ? 'var(--surface-elevated)' : 'transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
                <span style={CHIP_STYLE}>v{version.version_number}</span>
                <span style={META_STYLE}>
                  effective {formatCalendarDate(version.effective_from)}
                </span>
                {inForce && <span style={IN_FORCE_STYLE}>In force</span>}
              </span>
              <span style={META_STYLE}>
                {version.note}
                {version.created_by === readerId ? ' — by you' : ''}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

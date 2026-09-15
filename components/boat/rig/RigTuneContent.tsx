import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import EmptyState from '@/components/common/EmptyState'
import NotRecorded from '@/components/common/NotRecorded'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import RigTuneBandTable from '@/components/boat/rig/RigTuneBandTable'
import RigTuneEditor from '@/components/boat/rig/RigTuneEditor'
import RigTuneVersionHistory from '@/components/boat/rig/RigTuneVersionHistory'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { RigTunePage, RigTuneVersionRecord } from '@/types'

interface RigTuneContentProps {
  /** `null` when the artifact could not be read — not an unrecorded one. */
  page: RigTunePage | null
  /** Whether this sailor may mint a Version: `admin` only (ADR 0019). */
  canWrite: boolean
  /** The `version_number` the query asked for, or null for the one in force. */
  requestedVersion: number | null
  /** The reader's own user id, so their own Versions can say "by you". */
  readerId: string
}

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
}

const VERSION_CHIP_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  background: 'var(--surface-base)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '1px 6px',
}

const META_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const BACK_STYLE: CSSProperties = {
  ...META_STYLE,
  display: 'inline-block',
  marginBottom: '4px',
  textDecoration: 'none',
}

/**
 * The Version the screen is showing, or `null` when nothing has been recorded.
 *
 * The default is the pointer and not the highest number: `current_version_id` is what the
 * boat is set to and what a Race freezes against (ADR 0012). A query naming a Version that
 * is not there falls back to it rather than reporting a Version that does not exist.
 */
function shownVersion(
  page: RigTunePage,
  requestedVersion: number | null
): RigTuneVersionRecord | null {
  const current = page.versions.find((version) => version.id === page.current_version_id) ?? null

  if (requestedVersion === null) return current
  return page.versions.find((version) => version.version_number === requestedVersion) ?? current
}

/**
 * **Rig Tune** — the band table the boat is currently set to.
 *
 * There is no filename here, no attachment and nothing to fetch: a Rig Tune is typed into a
 * form, so the artifact *is* these numbers (ADR 0007). Nor is there a seed — v1 is the
 * owner's own measured tune, which is why an unrecorded artifact reads as absent rather than
 * as a guide's published figures.
 *
 * A Server Component. The admin's editor is the one client island, and it arrives beneath.
 */
export default function RigTuneContent({
  page,
  canWrite,
  requestedVersion,
  readerId,
}: RigTuneContentProps): ReactElement {
  const version = page === null ? null : shownVersion(page, requestedVersion)
  const stale = version?.bands.some((band) => band.gaps_stale) ?? false
  const past = page !== null && version !== null && version.id !== page.current_version_id

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <div
        style={{
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: spacing(4),
        }}
      >
        <Link href="/boat-management" style={BACK_STYLE}>
          ‹ Boat management
        </Link>
        <div style={EYEBROW_STYLE}>Boat setup</div>
        <h1 style={HEADING_STYLE}>Rig Tune</h1>

        {version === null ? (
          // "Not recorded" is an answer about the boat, and only sayable when the artifact
          // was actually read. A failed read is an answer about Layline, so the header says
          // nothing and the body below states what went wrong.
          page !== null && (
            <div style={{ marginTop: spacing(2) }}>
              <NotRecorded />
            </div>
          )
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginTop: spacing(2),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2) }}>
              <span data-testid="shown-version" style={VERSION_CHIP_STYLE}>
                v{version.version_number}
              </span>
              <span data-testid="shown-version-effective" style={META_STYLE}>
                effective {formatCalendarDate(version.effective_from)}
              </span>
            </div>
            {/* The change reason, which a Rig Tune Version cannot exist without: a table of
                millimetres says nothing about why the rig moved. */}
            <p style={{ ...META_STYLE, margin: 0, color: 'var(--text-secondary)' }}>
              {version.note}
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(4), padding: spacing(4) }}>
        {page === null ? (
          <EmptyState
            mark="⚓"
            title="The Rig Tune could not be read"
            detail="Nothing about the tune is shown rather than a guess at it. Sign in again, or try once more in a moment."
          />
        ) : version === null ? (
          <>
            <p style={{ ...META_STYLE, margin: 0 }}>
              {canWrite
                ? 'Nothing is recorded yet. Measure the rig and type what the caliper says — the first Version is this boat’s own tune, not a guide’s.'
                : 'Nothing is recorded yet. The first Version is measured off this boat, so there is nothing to read until it has been.'}
            </p>
            {canWrite && <RigTuneEditor current={null} />}
          </>
        ) : (
          <>
            {past && (
              <p
                data-testid="past-version-notice"
                role="status"
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: spacing(3),
                }}
              >
                This is not the tune the boat is set to. It is kept because a Race recorded
                against it still names it, and the way past it is to measure the rig and
                record the next Version — never to edit this one.
              </p>
            )}
            {stale && (
              <p
                data-testid="gaps-stale-banner"
                role="status"
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--state-warning)',
                  background: 'var(--surface-elevated)',
                  border: '1px dashed var(--state-warning)',
                  borderRadius: 'var(--radius-md)',
                  padding: spacing(3),
                }}
              >
                The Base Tune was re-measured after some of these bands, so their Turnbuckle
                Gaps describe a rig that no longer exists. Their Turns still hold. Nothing is
                recalculated: no thread pitch is recorded, so re-measure those bands to
                replace the millimetres.
              </p>
            )}
            <RigTuneBandTable bands={version.bands} />
            {/* Only from the Version in force, and never from a past one: the pointer moves
                forward only, so a retune is measured out of what the boat is set to now. */}
            {canWrite && !past && <RigTuneEditor current={version} />}
            <RigTuneVersionHistory
              versions={page.versions}
              currentVersionId={page.current_version_id}
              shownVersionId={version.id}
              readerId={readerId}
            />
          </>
        )}
      </div>
    </div>
  )
}

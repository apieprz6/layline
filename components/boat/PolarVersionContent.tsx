import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import PolarGrid from '@/components/boat/PolarGrid'
import EmptyState from '@/components/common/EmptyState'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { boatSetupDownloadHref } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { PolarVersionDetail } from '@/types'

interface PolarVersionContentProps {
  /** `null` when there is no such Polar Version to read. */
  version: PolarVersionDetail | null
}

/**
 * One **Polar Version** on its own: what it says, when it took effect, and the file it came from.
 *
 * Every Version has this screen, in force or long superseded. The grid is drawn the same way it is
 * everywhere — through `PolarGrid`, which suppresses the file's own filler angles wherever it is
 * used — and the original bytes are one link away, unchanged since the upload and provable against
 * the SHA-256 printed beside them.
 */
export default function PolarVersionContent({
  version,
}: PolarVersionContentProps): ReactElement {
  if (version === null) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
        <header style={HEADER_STYLE}>
          <Link href="/boat-management/polar" style={BACK_STYLE}>
            ‹ Polar
          </Link>
        </header>
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="◳"
            title="No such Polar Version"
            detail="The link may be from an older address, or point at a Version of something else. Every Polar Version is listed on the Polar screen."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header style={HEADER_STYLE}>
        <Link href="/boat-management/polar" style={BACK_STYLE}>
          ‹ Polar
        </Link>
        <div style={{ ...EYEBROW_STYLE, marginTop: spacing(2) }}>Polar</div>
        <h1 style={TITLE_STYLE}>
          v{version.version_number}
          {version.is_current && (
            <span data-testid="polar-version-current" style={CURRENT_STYLE}>
              In force
            </span>
          )}
        </h1>
        <p style={SUBTITLE_STYLE}>
          Effective {formatCalendarDate(version.effective_from)}
        </p>
      </header>

      <div style={{ padding: spacing(4) }}>
        <dl data-testid="polar-version-facts" style={FACTS_STYLE}>
          <div>
            <dt style={EYEBROW_STYLE}>Effective from</dt>
            <dd style={VALUE_STYLE}>{formatCalendarDate(version.effective_from)}</dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>Recorded</dt>
            {/* When Layline was told, which is a different fact from when the polar took effect
                and is why both are shown. Printed as the database holds it, offset included:
                localising it here would need a zone this screen has no business choosing, and the
                repo's only date helper is for calendar dates, which this is not. */}
            <dd style={{ ...VALUE_STYLE, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
              {version.recorded_at}
            </dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>Note</dt>
            <dd style={VALUE_STYLE}>
              {version.note ?? <span style={{ fontStyle: 'italic' }}>None</span>}
            </dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>File</dt>
            <dd style={{ ...VALUE_STYLE, fontFamily: 'var(--font-mono)' }}>
              {version.filename}
            </dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>SHA-256</dt>
            {/* In full. It is the proof that the bytes behind the Download are the bytes that
                were parsed, and half a hash proves nothing. */}
            <dd style={{ ...VALUE_STYLE, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
              {version.content_sha256}
            </dd>
          </div>
        </dl>

        <a
          href={boatSetupDownloadHref('polar', version.id)}
          download={version.filename}
          style={DOWNLOAD_STYLE}
        >
          Download the original file
        </a>

        <div style={{ marginTop: spacing(6) }}>
          <div style={EYEBROW_STYLE}>The grid</div>
          <PolarGrid payload={version.payload} />
        </div>
      </div>
    </div>
  )
}

const HEADER_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  borderBottom: '1px solid var(--surface-border)',
  padding: spacing(4),
}

const BACK_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  textDecoration: 'none',
}

const TITLE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: spacing(2),
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
}

const CURRENT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-semibold)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--blue-500)',
  border: '1px solid var(--blue-500)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 5px',
}

const SUBTITLE_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const FACTS_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(3),
  margin: `0 0 ${spacing(4)}`,
}

const VALUE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-primary)',
}

const DOWNLOAD_STYLE: CSSProperties = {
  display: 'inline-block',
  padding: '11px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--blue-500)',
  border: '1px solid var(--blue-500)',
  borderRadius: 'var(--radius-sm)',
  textDecoration: 'none',
}

import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import CrossoverChartGrid from '@/components/boat/CrossoverChartGrid'
import EmptyState from '@/components/common/EmptyState'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { boatSetupDownloadHref } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { CrossoverChartVersionDetail } from '@/types'

interface CrossoverChartVersionContentProps {
  /** `null` when there is no such Crossover Chart Version to read. */
  version: CrossoverChartVersionDetail | null
}

/**
 * One **Crossover Chart Version** on its own: what it says, when it took effect, and the two files
 * it came from.
 *
 * Every Version has this screen, in force or long superseded. The chart is drawn the same way it is
 * everywhere — through `CrossoverChartGrid`, legend included — and both sets of original bytes are
 * one link away, unchanged since the upload and provable against the SHA-256s printed beside them.
 *
 * **Two files, and this is the screen that says so.** The grid file's name and hash are the Version's
 * own columns; the definitions file's are inside the payload, because a second file is not machinery
 * every kind shares and so has no column of its own (ADR 0022). They are shown side by side all the
 * same, because to a sailor they are two files that arrived together, and where a fact is stored is
 * not their problem.
 */
export default function CrossoverChartVersionContent({
  version,
}: CrossoverChartVersionContentProps): ReactElement {
  if (version === null) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
        <header style={HEADER_STYLE}>
          <Link href="/boat-management/crossover-chart" style={BACK_STYLE}>
            ‹ Crossover Chart
          </Link>
        </header>
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="◳"
            title="No such Crossover Chart Version"
            detail="The link may be from an older address, or point at a Version of something else. Every Crossover Chart Version is listed on the Crossover Chart screen."
          />
        </div>
      </div>
    )
  }

  const definitions = version.payload.source?.definitions ?? null

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header style={HEADER_STYLE}>
        <Link href="/boat-management/crossover-chart" style={BACK_STYLE}>
          ‹ Crossover Chart
        </Link>
        <div style={{ ...EYEBROW_STYLE, marginTop: spacing(2) }}>Crossover Chart</div>
        <h1 style={TITLE_STYLE}>
          v{version.version_number}
          {version.is_current && (
            <span data-testid="crossover-chart-version-current" style={CURRENT_STYLE}>
              In force
            </span>
          )}
        </h1>
        <p style={SUBTITLE_STYLE}>Effective {formatCalendarDate(version.effective_from)}</p>
      </header>

      <div style={{ padding: spacing(4) }}>
        <dl data-testid="crossover-chart-version-facts" style={FACTS_STYLE}>
          <div>
            <dt style={EYEBROW_STYLE}>Effective from</dt>
            <dd style={VALUE_STYLE}>{formatCalendarDate(version.effective_from)}</dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>Recorded</dt>
            {/* When Layline was told, which is a different fact from when the chart took effect and
                is why both are shown. Printed as the database holds it, offset included: localising
                it here would need a zone this screen has no business choosing, and the repo's only
                date helper is for calendar dates, which this is not. */}
            <dd
              style={{ ...VALUE_STYLE, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
            >
              {version.recorded_at}
            </dd>
          </div>
          <div>
            <dt style={EYEBROW_STYLE}>Note</dt>
            <dd style={VALUE_STYLE}>
              {version.note ?? <span style={{ fontStyle: 'italic' }}>None</span>}
            </dd>
          </div>
        </dl>

        <div style={EYEBROW_STYLE}>The two files</div>
        <div data-testid="crossover-chart-version-files" style={FILES_STYLE}>
          <FileCard
            what="Sail chart"
            filename={version.filename}
            sha256={version.content_sha256}
            href={boatSetupDownloadHref('crossover_chart', version.id)}
            action="Download the sail chart"
          />

          {definitions === null ? (
            // A payload that records no provenance for its second half. The schema requires it, so
            // this is only reachable for a row written before it did — said plainly rather than
            // drawn as a Download that would 404.
            <p data-testid="crossover-chart-version-no-definitions-file" style={MUTED_STYLE}>
              This Version records no separate definitions file. Its sail definitions are in the
              chart below, where they have been since it was written.
            </p>
          ) : (
            <FileCard
              what="Sail definitions"
              filename={definitions.filename}
              sha256={definitions.content_sha256}
              href={boatSetupDownloadHref('crossover_chart', version.id, 'definitions')}
              action="Download the sail definitions"
            />
          )}
        </div>

        <div style={{ marginTop: spacing(6) }}>
          <div style={EYEBROW_STYLE}>The chart</div>
          <CrossoverChartGrid payload={version.payload} />
        </div>
      </div>
    </div>
  )
}

interface FileCardProps {
  what: string
  filename: string
  sha256: string
  href: string
  /** The link's own words. Two Downloads on one screen that both say "Download" name nothing. */
  action: string
}

function FileCard({ what, filename, sha256, href, action }: FileCardProps): ReactElement {
  return (
    <div data-testid="crossover-chart-version-file" style={FILE_CARD_STYLE}>
      <div style={EYEBROW_STYLE}>{what}</div>
      <p style={{ ...VALUE_STYLE, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
        {filename}
      </p>
      {/* In full. It is the proof that the bytes behind the Download are the bytes that were
          parsed, and half a hash proves nothing. */}
      <p style={HASH_STYLE}>{sha256}</p>
      <a href={href} download={filename} style={DOWNLOAD_STYLE}>
        {action}
      </a>
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
  margin: `0 0 ${spacing(5)}`,
}

const VALUE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--text-primary)',
}

/** One above the other at 390px, where two cards side by side would each be unreadable. */
const FILES_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(3),
  marginTop: spacing(2),
}

const FILE_CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(2),
  alignItems: 'flex-start',
  padding: spacing(3),
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
}

const HASH_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  overflowWrap: 'anywhere',
}

const MUTED_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
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

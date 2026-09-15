import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import { boatSetupDownloadHref, boatSetupVersionHref } from '@/lib/boat/artifacts'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { PolarVersionSummary } from '@/types'

interface PolarVersionListProps {
  /** Newest first — `readPolarVersions` owns that order. */
  versions: PolarVersionSummary[]
}

/**
 * Every **Polar Version** ever uploaded, one row each.
 *
 * All of them, not just the one in force. A polar that was in force for a season is what that
 * season's races were sailed against, so a superseded Version stays openable and its original
 * bytes stay downloadable — superseding is not retiring.
 *
 * Each row states the four things that identify a Version to a sailor: its number, the date it
 * took effect, the note if there is one, and the filename it arrived as. The number and the date
 * are different facts and both are shown: v3 uploaded this morning may be the polar from last
 * April.
 *
 * The Download is a sibling of the row's link and never nested inside it, because an anchor
 * inside an anchor is invalid HTML and browsers resolve it by dropping one of them — usually the
 * one you wanted.
 *
 * A Server Component: opening a Version is a navigation and downloading one is a link.
 */
export default function PolarVersionList({ versions }: PolarVersionListProps): ReactElement {
  return (
    <ul data-testid="polar-version-list" style={LIST_STYLE}>
      {versions.map((version) => (
        <li
          key={version.id}
          data-testid="polar-version-row"
          data-version-number={version.version_number}
          style={ROW_STYLE}
        >
          <Link
            href={boatSetupVersionHref('polar', version.id)}
            style={{ ...OPEN_STYLE, minWidth: 0 }}
          >
            <span style={HEADLINE_STYLE}>
              <span style={NUMBER_STYLE}>v{version.version_number}</span>
              <span style={DATE_STYLE}>
                effective {formatCalendarDate(version.effective_from)}
              </span>
              {version.is_current && (
                <span data-testid="polar-version-current" style={CURRENT_STYLE}>
                  In force
                </span>
              )}
            </span>

            {/* The sailor's own sentence about why this Version exists, when they wrote one.
                Absent rather than replaced by filler: a Polar's note is optional, unlike a Rig
                Tune's, and inventing "no note" copy would fill the screen with nothing. */}
            {version.note !== null && (
              <span data-testid="polar-version-note" style={NOTE_STYLE}>
                {version.note}
              </span>
            )}

            <span data-testid="polar-version-filename" style={FILENAME_STYLE}>
              {version.filename}
            </span>
          </Link>

          {/* `download` names the file the sailor gets. The route also asks Storage to set the
              disposition, since a redirect to a signed URL leaves the attribute behind. */}
          <a
            href={boatSetupDownloadHref('polar', version.id)}
            download={version.filename}
            style={DOWNLOAD_STYLE}
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  )
}

const LIST_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing(3),
  padding: '13px 4px',
  borderBottom: '1px solid var(--surface-divider)',
}

const OPEN_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  textDecoration: 'none',
}

const HEADLINE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: spacing(2),
}

const NUMBER_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
}

const DATE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

/** The one in force, said in words. A colour alone would not survive the night-vision theme. */
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

const NOTE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const FILENAME_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  overflowWrap: 'anywhere',
}

const DOWNLOAD_STYLE: CSSProperties = {
  flexShrink: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--blue-500)',
  textDecoration: 'none',
}

import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import PolarGrid from '@/components/boat/PolarGrid'
import PolarUploadPanel from '@/components/boat/PolarUploadPanel'
import PolarVersionList from '@/components/boat/PolarVersionList'
import EmptyState from '@/components/common/EmptyState'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { PolarVersionDetail, PolarVersionList as PolarVersions } from '@/types'

interface PolarContentProps {
  /** `null` when the read failed — not an empty archive, which is `versions: []`. */
  list: PolarVersions | null
  /** The Version the pointer is at, with its grid. `null` before the first upload. */
  current: PolarVersionDetail | null
  /** Whether this sailor may upload: `admin` only (ADR 0019). */
  canWrite: boolean
}

/**
 * The **Polar** screen: the grid in force, every Version behind it, and — for an admin — the
 * upload.
 *
 * The first of the four Boat Setup artifacts to get a screen of its own, and the shape the
 * Crossover Chart will reuse: a current Version drawn as its own thing, a list of all of them
 * beneath it, and the write offered only to whoever may make it.
 *
 * A signed-in non-admin sees everything on this screen except the upload panel. That is the whole
 * of the difference: the Role governs writes and nothing else (ADR 0019), so a viewer reads every
 * Version and downloads every file.
 */
export default function PolarContent({
  list,
  current,
  canWrite,
}: PolarContentProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header style={HEADER_STYLE}>
        {/* Back to the four artifacts. A detail screen reached from a list needs the way out
            stated, since a deep link has no history to go back through. */}
        <Link href="/boat-management" style={BACK_STYLE}>
          ‹ Boat management
        </Link>
        <div style={{ ...EYEBROW_STYLE, marginTop: spacing(2) }}>Boat setup</div>
        <h1 style={TITLE_STYLE}>Polar</h1>
        <p style={SUBTITLE_STYLE}>
          Target boat speed at each wind angle and wind speed — speed through the water, not VMG.
        </p>
      </header>

      {list === null ? (
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="◳"
            title="The Polar could not be read"
            detail="Nothing about the boat's polar is shown rather than a guess at it. Sign in again, or try once more in a moment."
          />
        </div>
      ) : (
        <div style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(6) }}>
          {list.versions.length === 0 ? (
            <EmptyState
              mark="◳"
              title="No Polar recorded"
              detail={
                canWrite
                  ? 'Upload the .pol from the boat’s certificate or router below. Nothing about it will be corrected on the way in.'
                  : 'Nobody has uploaded one yet. An admin adds the boat’s polar; it will appear here as soon as they do.'
              }
            />
          ) : (
            <>
              <section>
                <div style={EYEBROW_STYLE}>In force</div>
                {current === null ? (
                  // Versions exist but the pointer is not at a readable one: either the read of
                  // that one row failed, or its stored payload is not a grid. Said rather than
                  // covered over by silently drawing the next Version down, which would show the
                  // sailor a polar that is not the boat's current one.
                  <p style={MUTED_STYLE}>
                    The Version in force could not be read. Every Version is still listed below
                    and can be opened on its own.
                  </p>
                ) : (
                  <>
                    <p style={CURRENT_LINE_STYLE}>
                      v{current.version_number} · effective{' '}
                      {formatCalendarDate(current.effective_from)}
                      {current.note !== null && ` · ${current.note}`}
                    </p>
                    <PolarGrid payload={current.payload} />
                  </>
                )}
              </section>

              <section>
                <div style={EYEBROW_STYLE}>
                  {list.versions.length === 1 ? '1 Version' : `${list.versions.length} Versions`}
                </div>
                <PolarVersionList versions={list.versions} />
                {/* Superseded is not retired: a season's races were sailed against whatever
                    polar was in force then, so every Version stays here. */}
                <p style={MUTED_STYLE}>
                  Every Version ever uploaded stays here, openable and downloadable, including the
                  ones a later upload superseded.
                </p>
              </section>
            </>
          )}

          {canWrite && <PolarUploadPanel />}
        </div>
      )}
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
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
}

const SUBTITLE_STYLE: CSSProperties = {
  margin: `${spacing(2)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const CURRENT_LINE_STYLE: CSSProperties = {
  margin: `0 0 ${spacing(2)}`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
}

const MUTED_STYLE: CSSProperties = {
  margin: `${spacing(3)} 0 0`,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

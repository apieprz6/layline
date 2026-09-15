import type { CSSProperties, ReactElement } from 'react'
import Link from 'next/link'
import BoatSetupVersionList from '@/components/boat/BoatSetupVersionList'
import CrossoverChartGrid from '@/components/boat/CrossoverChartGrid'
import CrossoverChartUploadPanel from '@/components/boat/CrossoverChartUploadPanel'
import EmptyState from '@/components/common/EmptyState'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { formatCalendarDate } from '@/lib/utils/calendarDate'
import { spacing } from '@/lib/utils/design'
import type { CrossoverChartVersionDetail, FileBackedVersionList } from '@/types'

interface CrossoverChartContentProps {
  /** `null` when the read failed — not an empty archive, which is `versions: []`. */
  list: FileBackedVersionList | null
  /** The Version the pointer is at, with its chart. `null` before the first upload. */
  current: CrossoverChartVersionDetail | null
  /** Whether this sailor may upload: `admin` only (ADR 0019). */
  canWrite: boolean
}

/**
 * The **Crossover Chart** screen: the chart in force, every Version behind it, and — for an admin —
 * the upload.
 *
 * The last of the four Boat Setup artifacts to get a screen, and the second one whose Versions are
 * backed by files. It is the Polar's shape deliberately: a current Version drawn as its own thing, a
 * list of all of them beneath it, and the write offered only to whoever may make it. The Version list
 * is literally the same component (ADR 0011); the chart above it is not, because a grid of boat
 * speeds and a grid of sail choices are read differently.
 *
 * **One artifact, two files.** The chart and its Sail Definitions are one Version and are never
 * versioned apart, so this screen is not a screen about two things — the subtitle says so, and the
 * definitions appear as the chart's legend rather than as a section of their own (ADR 0012).
 *
 * A signed-in non-admin sees everything on this screen except the upload panel. That is the whole of
 * the difference: the Role governs writes and nothing else (ADR 0019), so a viewer reads every
 * Version and downloads every file.
 */
export default function CrossoverChartContent({
  list,
  current,
  canWrite,
}: CrossoverChartContentProps): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <header style={HEADER_STYLE}>
        {/* Back to the four artifacts. A detail screen reached from a list needs the way out
            stated, since a deep link has no history to go back through. */}
        <Link href="/boat-management" style={BACK_STYLE}>
          ‹ Boat management
        </Link>
        <div style={{ ...EYEBROW_STYLE, marginTop: spacing(2) }}>Boat setup</div>
        <h1 style={TITLE_STYLE}>Crossover Chart</h1>
        <p style={SUBTITLE_STYLE}>
          Which sail to be carrying at each wind angle and wind speed — the chart and the sail
          definitions that name it, kept as one Version so neither can drift from the other.
        </p>
      </header>

      {list === null ? (
        <div style={{ padding: spacing(4) }}>
          <EmptyState
            mark="◳"
            title="The Crossover Chart could not be read"
            detail="Nothing about the boat's sail choices is shown rather than a guess at them. Sign in again, or try once more in a moment."
          />
        </div>
      ) : (
        <div
          style={{ padding: spacing(4), display: 'flex', flexDirection: 'column', gap: spacing(6) }}
        >
          {list.versions.length === 0 ? (
            <EmptyState
              mark="◳"
              title="No Crossover Chart recorded"
              detail={
                canWrite
                  ? 'Upload the sail chart and its definitions from the router below. Both go in together, and nothing in either will be corrected on the way in.'
                  : 'Nobody has uploaded one yet. An admin adds the boat’s sail chart; it will appear here as soon as they do.'
              }
            />
          ) : (
            <>
              <section>
                <div style={EYEBROW_STYLE}>In force</div>
                {current === null ? (
                  // Versions exist but the pointer is not at a readable one: either the read of
                  // that one row failed, or its stored payload is not a chart. Said rather than
                  // covered over by silently drawing the next Version down, which would show the
                  // sailor sail choices that are not the boat's current ones.
                  <p style={MUTED_STYLE}>
                    The Version in force could not be read. Every Version is still listed below and
                    can be opened on its own.
                  </p>
                ) : (
                  <>
                    <p style={CURRENT_LINE_STYLE}>
                      v{current.version_number} · effective{' '}
                      {formatCalendarDate(current.effective_from)}
                      {current.note !== null && ` · ${current.note}`}
                    </p>
                    <CrossoverChartGrid payload={current.payload} />
                  </>
                )}
              </section>

              <section>
                <div style={EYEBROW_STYLE}>
                  {list.versions.length === 1 ? '1 Version' : `${list.versions.length} Versions`}
                </div>
                <BoatSetupVersionList kind="crossover_chart" versions={list.versions} />
                {/* Superseded is not retired: a season's races were sailed against whatever chart
                    was in force then, so every Version stays here. */}
                <p style={MUTED_STYLE}>
                  Every Version ever uploaded stays here, openable and downloadable, including the
                  ones a later upload superseded. Open one to download both of its files.
                </p>
              </section>
            </>
          )}

          {canWrite && <CrossoverChartUploadPanel />}
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

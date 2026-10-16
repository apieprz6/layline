import type { ReactElement } from 'react'
import Skeleton, { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import {
  BODY_CLASS,
  ColumnHeaderRow,
  HEADER_STYLE,
  RACES_CLASS,
  RAIL_CLASS,
  ROOT_CLASS,
  ROW_CLASS,
  ROW_STYLE,
  SECTION_HEADING_STYLE,
  SECTION_STYLE,
  TABLE_CLASS,
  TABLE_STYLE,
  TITLE_STYLE,
  TOOLBAR_STYLE,
  rowRule,
} from './boatPerformanceLayout'

/**
 * Boat performance while the archive is still being read.
 *
 * `BoatPerformanceContent`'s own shape, from the same `boatPerformanceLayout` geometry: the section
 * header, the "This season" rail, and the races' toolbar over a table. What is already known is
 * drawn as itself — the section's name, both section headings, the three column names — and what
 * the read returns is a bar.
 *
 * The rail holds one row's height, which is what its own `<Suspense>` boundary on the page shows
 * next: the season's figures are a second read, so this skeleton gives way to the rail's fallback
 * and not straight to its teasers. The table holds three rows — a guess at a length, and the only
 * honest kind of guess available, since the count is exactly what the read returns. For the same
 * reason the "Races" heading has no count beside it.
 *
 * No "Upload a race" button. It belongs to an admin only (ADR 0019) and the **Role**
 * has not been resolved yet, so drawing one would promise a control most sailors
 * never get. `TOOLBAR_STYLE` holds the button's height whether it is drawn or not, so an admin's
 * table does not drop when it arrives.
 *
 * An empty archive replaces the table with an empty state, which is the one case
 * this skeleton cannot match: nothing here can know the archive is empty before it
 * has been read.
 *
 * A `<Suspense>` fallback inside the page and not a `loading.tsx`, for the reason given
 * in [BoatManagementSkeleton]: a boundary above the page would show a **Guest** a
 * placeholder of a screen they are served no form of (ADR 0015).
 */
export default function BoatPerformanceSkeleton(): ReactElement {
  return (
    <SkeletonScreen
      label="Loading the race archive"
      className={ROOT_CLASS}
      style={{ background: 'var(--page-bg)' }}
    >
      <div style={HEADER_STYLE}>
        <h1 style={TITLE_STYLE}>Boat performance</h1>
      </div>

      <div className={BODY_CLASS}>
        <div className={RAIL_CLASS} style={SECTION_STYLE}>
          <div style={TOOLBAR_STYLE}>
            <h2 style={SECTION_HEADING_STYLE}>This season</h2>
          </div>
          {/* The page's `rowFallback`, which is what this rail shows next. */}
          <Skeleton height="92px" radius="var(--radius-md)" />
        </div>

        <div className={RACES_CLASS} style={SECTION_STYLE}>
          <div style={TOOLBAR_STYLE}>
            <h2 style={SECTION_HEADING_STYLE}>Races</h2>
          </div>

          <div className={TABLE_CLASS} style={TABLE_STYLE}>
            <ColumnHeaderRow />

            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className={ROW_CLASS}
                style={{ ...ROW_STYLE, ...rowRule(row) }}
              >
                <SkeletonText fontSize="var(--text-base)" width="70%" />
                <SkeletonText fontSize="var(--text-sm)" width="160px" />
                <SkeletonText fontSize="var(--text-xs)" width="48px" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  )
}

import type { ReactElement } from 'react'
import { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import SectionTabsChrome from '@/components/common/SectionTabsChrome'
import { spacing } from '@/lib/utils/design'

/**
 * Boat performance while the archive is still being read.
 *
 * `BoatPerformanceContent`'s Races tab, which is the tab it opens on: the section
 * header, then one card per race. Three cards — a guess at a length, and the only
 * honest kind of guess available, since the count is exactly what the read returns.
 * Each card is the real card's three lines: title, window, duration and filename.
 *
 * No "Upload a race" button. It belongs to an admin only (ADR 0019) and the **Role**
 * has not been resolved yet, so drawing one would promise a control most sailors
 * never get — and a button that vanishes shifts the whole list up.
 *
 * An empty archive replaces all of this with an empty state, which is the one case
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
      className="min-h-screen"
      style={{ background: 'var(--page-bg)' }}
    >
      <SectionTabsChrome title="Boat performance" tabs={['Races', 'Overall']} />

      <div style={{ padding: spacing(4) }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing(1),
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: spacing(3),
                }}
              >
                <SkeletonText fontSize="var(--text-base)" width="58%" />
                <SkeletonText fontSize="var(--text-sm)" width="44%" />
                <SkeletonText fontSize="var(--text-xs)" width="70%" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  )
}

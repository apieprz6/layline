import type { ReactElement } from 'react'
import { SkeletonScreen } from '@/components/common/Skeleton'
import { radius, spacing } from '@/lib/utils/design'

/**
 * The Sail Selection Screen while the archive is being read.
 *
 * The screen's own geometry: the title, the filter rail's five chips, the ledger, the four
 * thumbnails and the grid. The chips and the thumbnails are drawn rather than left out because
 * both are known before anything is read — they are the registry and the four layers, not data —
 * so nothing above the grid moves when the rows arrive.
 *
 * A `<Suspense>` fallback inside the page rather than a `loading.tsx` beside it, for the reason
 * `PolarPerformanceSkeleton` gives: a boundary above the page would show a **Guest** a placeholder
 * of a screen they are served no form of (ADR 0015).
 */
export default function SailSelectionSkeleton(): ReactElement {
  return (
    <SkeletonScreen
      label="Reading the race archive"
      className="min-h-screen"
      style={{ background: 'var(--page-bg)', padding: spacing(4) }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <div style={{ height: 20, width: 190, background: 'var(--skeleton-bg)', borderRadius: 4 }} />

        <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
          {[0, 1, 2, 3, 4].map((chip) => (
            <div
              key={chip}
              style={{
                flexShrink: 0,
                height: 28,
                width: 92,
                background: 'var(--skeleton-bg)',
                borderRadius: radius('full'),
              }}
            />
          ))}
        </div>

        <div
          style={{
            height: 76,
            background: 'var(--skeleton-bg)',
            borderRadius: radius('sm'),
            borderLeft: '3px solid var(--surface-divider)',
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing(1) }}>
          {[0, 1, 2, 3].map((thumb) => (
            <div
              key={thumb}
              style={{
                height: 64,
                background: 'var(--skeleton-bg)',
                borderRadius: radius('sm'),
              }}
            />
          ))}
        </div>

        {/* 26 rows of 24px, which is the grid's own height on this boat's chart. */}
        <div style={{ height: 624, background: 'var(--skeleton-bg)', borderRadius: radius('sm') }} />
      </div>
    </SkeletonScreen>
  )
}

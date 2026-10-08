import type { ReactElement } from 'react'
import { SkeletonScreen } from '@/components/common/Skeleton'
import { radius, spacing } from '@/lib/utils/design'

/**
 * Polar performance while the archive is being read.
 *
 * The screen's own geometry: the title, the filter rail's six chips, the ledger, two figure tiles.
 * The six chips are drawn rather than left out because their labels are known before anything is
 * read — they are the registry, not data — so the rail does not move when the rows arrive.
 *
 * A `<Suspense>` fallback inside the page rather than a `loading.tsx` beside it, for the reason
 * `BoatPerformanceSkeleton` gives: a boundary above the page would show a **Guest** a placeholder
 * of a screen they are served no form of (ADR 0015).
 */
export default function PolarPerformanceSkeleton(): ReactElement {
  return (
    <SkeletonScreen
      label="Reading the race archive"
      className="min-h-screen"
      style={{ background: 'var(--page-bg)', padding: spacing(4) }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <div style={{ height: 20, width: 180, background: 'var(--skeleton-bg)', borderRadius: 4 }} />

        <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
          {[0, 1, 2, 3, 4, 5].map((chip) => (
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

        <div style={{ display: 'flex', gap: spacing(2) }}>
          {[0, 1].map((tile) => (
            <div
              key={tile}
              style={{
                flex: 1,
                height: 64,
                background: 'var(--skeleton-bg)',
                borderRadius: radius('md'),
              }}
            />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}

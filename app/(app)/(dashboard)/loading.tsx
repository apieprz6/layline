import type { ReactElement } from 'react'
import { SkeletonScreen } from '@/components/common/Skeleton'
import StationRowSkeleton, { stationsAwaited } from '@/components/dashboard/StationRowSkeleton'
import { radius, spacing } from '@/lib/utils/design'

/**
 * The dashboard while its buoys are still being read.
 *
 * `/` awaits CHII2 and the Purdue buoy before it renders anything, and both are a
 * network hop to NDBC — so without this the sailor's tap on the app lands on a blank
 * screen for as long as that takes, which reads as a dead click rather than as work
 * in progress.
 *
 * The shape is `LiveWindCard`'s: the grid it sits in, its card, its header row, and a
 * row per station a row can arrive for. "Live Wind" and "See all" are the real strings,
 * since they are chrome and not data. The link is a plain span here: it would work, but
 * a sailor cannot usefully leave for `/wind-data` in the instant before this card
 * resolves, and a skeleton offering navigation invites a second dead click.
 *
 * The `(dashboard)` group exists for this file. A `loading.tsx` is the fallback for
 * every route below it, so one placed directly in `(app)` would stand in for
 * `/boat-management` as well — and a Suspense boundary above those pages moves their
 * guest redirect from an HTTP one to a client-side one, which would serve a **Guest**
 * a placeholder of a screen ADR 0015 says they get no form of at all. Grouping `/` with
 * its own skeleton keeps the boundary over the one route it describes.
 */
export default function DashboardLoading(): ReactElement {
  return (
    <SkeletonScreen
      label="Loading current conditions"
      className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4"
    >
      <div className="layline-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing(3),
          }}
        >
          <div className="label" style={{ color: 'var(--text-secondary)' }}>
            Live Wind
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-accent)' }}>See all →</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
          {stationsAwaited().map((buoyId) => (
            <div
              key={buoyId}
              style={{
                borderRadius: radius('md'),
                border: '1px solid var(--surface-border)',
                background: 'var(--card-bg)',
              }}
            >
              <StationRowSkeleton />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}

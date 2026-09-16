import type { ReactElement } from 'react'
import Skeleton, { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import SectionTabsChrome from '@/components/common/SectionTabsChrome'
import StationRowSkeleton, { stationsAwaited } from '@/components/dashboard/StationRowSkeleton'
import { radius, spacing } from '@/lib/utils/design'

/**
 * Wind Data while its two stations are still being read.
 *
 * `WindDataContent`'s shape, in its opening state — the Live & Historical tab, which
 * is the tab it always opens on. Header, summary bar, one card per station a row can
 * arrive for, sources line. The title, the tab labels and the sources line are real
 * strings; everything downstream of NDBC is a bar.
 *
 * The summary bar draws its speed and direction, which `SummaryBar` shows only while at
 * least one station is online — a reading under 30 minutes old, so the normal case for a
 * feed that updates every 6. The bar loses that column on the day every station is dark,
 * which is also the day the cards below it are gone entirely.
 */
export default function WindDataLoading(): ReactElement {
  return (
    <SkeletonScreen
      label="Loading wind data"
      className="min-h-screen"
      style={{ background: 'var(--page-bg)' }}
    >
      <SectionTabsChrome title="Wind Data" tabs={['Live & Historical', 'Model Forecast']} />

      <div style={{ padding: spacing(4) }}>
        {/* Summary bar */}
        <div className="layline-card" style={{ padding: spacing(4) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing(3) }}>
            <Skeleton width="9px" height="9px" radius="var(--radius-full)" />

            <div style={{ flex: 1, minWidth: 0 }}>
              <SkeletonText fontSize="11px" width="44%" style={{ marginBottom: '2px' }} />
              <SkeletonText fontSize="9px" width="32%" />
            </div>

            <Skeleton width="20px" height="20px" radius="var(--radius-full)" />
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <SkeletonText fontSize="20px" width="46px" />
              <SkeletonText fontSize="9px" width="28px" style={{ marginLeft: 'auto' }} />
            </div>
          </div>
        </div>

        {/* Station cards */}
        <div
          style={{
            marginTop: spacing(4),
            display: 'flex',
            flexDirection: 'column',
            gap: spacing(3),
          }}
        >
          {stationsAwaited().map((buoyId) => (
            <div
              key={buoyId}
              style={{
                borderRadius: radius('md'),
                border: '1px solid var(--card-border)',
                background: 'var(--card-bg)',
                overflow: 'hidden',
              }}
            >
              <StationRowSkeleton />
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Sources: NDBC · NOAA ASOS · Updates every 6 min
        </div>
      </div>
    </SkeletonScreen>
  )
}

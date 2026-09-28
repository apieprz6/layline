import type { ReactElement } from 'react'
import Skeleton, { SkeletonText } from '@/components/common/Skeleton'
import { isPurdueSeason } from '@/services/buoys/season'
import { spacing } from '@/lib/utils/design'

/**
 * The stations a row can arrive for, in the order both screens render them.
 *
 * Neither screen renders a row for a buoy that came back without data, and the Purdue
 * buoy runs May–October — so out of season its row is not late, it is not coming, and a
 * bar in its place is a bar that vanishes when the card resolves. A station that is in
 * season and simply fails to answer is the one case nothing rendered before the fetch
 * can know about; the card loses that row when it happens.
 */
export function stationsAwaited(): readonly string[] {
  return isPurdueSeason() ? ['CHII2', '45198'] : ['CHII2']
}

/**
 * A `StationRow` before its station has reported: the same three columns, the same
 * `10px 12px`, and bars whose heights come from the same font-sizes.
 *
 * One component for both places a row appears — the dashboard's Live Wind card and
 * Wind Data's station cards — because `StationRow` is shared between them and a
 * skeleton that matched only one would shift on the other.
 *
 * The gust line is drawn. A station that reports no gust makes the real row a little
 * shorter than this, which is the one shift left in the shape: the alternative is a
 * skeleton that is *always* short and grows on every station that does report one.
 */
export default function StationRowSkeleton(): ReactElement {
  return (
    <div
      data-testid="station-row-skeleton"
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: spacing(3),
      }}
    >
      {/* Status dot — no colour, because the status is exactly what is not known yet */}
      <Skeleton width="7px" height="7px" radius="var(--radius-full)" />

      {/* Station name + location */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <SkeletonText fontSize="12px" width="58%" style={{ marginBottom: '1px' }} />
        <SkeletonText fontSize="9px" width="34%" style={{ marginTop: '1px' }} />
      </div>

      {/* Wind arrow + speed + gust */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing(2), flexShrink: 0 }}>
        <Skeleton width="16px" height="16px" radius="var(--radius-full)" />
        <div style={{ textAlign: 'right' }}>
          <SkeletonText fontSize="16px" width="38px" />
          <SkeletonText fontSize="9px" width="18px" style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </div>
  )
}

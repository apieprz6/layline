/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Everything a variant gets. The scrubbing state is LAY-168's harness,
 * unchanged; the gust/wave readings are computed once here so the variants
 * only differ in where they put them.
 */

import type { WindDataPointWithOffset } from '@/types'
import type { TimeScale } from '@/lib/utils/windowing'
import type { ProtoMetadata, ProtoPoint } from './fixtures'
import type { ProtoPointWithOffset, Reading } from './readings'

export interface ContentProps {
  buoyId: string
  stationName: string
  metadata: ProtoMetadata
  data: ProtoPoint[]
  dataWithOffset: ProtoPointWithOffset[]
  now: Date
  scaleId: TimeScale
  timeWindowMinutes: number
  nowOffset: number
  maxOffset: number
  isAtLive: boolean
  referenceTime: Date
  windowStart: Date
  latestDataTime: Date
  hoverPoint: WindDataPointWithOffset | null
  displayPoint: ProtoPointWithOffset | undefined
  mode: 'reference' | 'touch'
  /** Window's points, oldest → newest. */
  windowPoints: ProtoPointWithOffset[]
  gust: Reading
  wave: Reading
  peakGust: number | null
  onHoverChange: (point: WindDataPointWithOffset | null) => void
  onScaleChange: (scale: TimeScale) => void
  onOffsetChange: (offset: number) => void
  onReturnToLive: () => void
}

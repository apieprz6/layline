/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Shapes shared by all three variants, so the harness only has to describe
 * the state once. The time-scrubbing/scale-selection logic itself is
 * `StationPageClient`'s, carried over unchanged — this prototype is about
 * what wraps it, not how it behaves.
 */

import type { WindDataPoint, WindDataPointWithOffset } from '@/types'
import type { TimeScale } from '@/lib/utils/windowing'

export interface VariantProps {
  buoyId: string
  stationName: string
  data: WindDataPoint[]
  dataWithOffset: WindDataPointWithOffset[]
  now: Date
  scaleId: TimeScale
  timeWindowMinutes: number
  nowOffset: number
  maxOffset: number
  isAtLive: boolean
  referenceTime: Date
  windowStart: Date
  latestDataTime: Date
  lastFetchTime: Date
  hoverPoint: WindDataPointWithOffset | null
  displayPoint: WindDataPointWithOffset | undefined
  mode: 'reference' | 'touch'
  onHoverChange: (point: WindDataPointWithOffset | null) => void
  onScaleChange: (scale: TimeScale) => void
  onOffsetChange: (offset: number) => void
  onReturnToLive: () => void
}

export const MODULE_PLACEHOLDERS = [
  { key: 'gust', label: 'Gust', hint: 'LAY-169' },
  { key: 'wave', label: 'Wave', hint: 'LAY-169' },
] as const

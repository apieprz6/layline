'use client'

import { useState, useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import MobileStationLayout from '@/components/dashboard/MobileStationLayout'
import StationHeader from '@/components/dashboard/StationHeader'
import PolarChart from '@/components/dashboard/PolarChart'
import BottomControlsDock from '@/components/dashboard/BottomControlsDock'

interface StationPageClientProps {
  buoyId: string
  stationName: string
  isLive: boolean
  data: MinuteDataPoint[]
}

const TOTAL_HOURS = 72
const TOTAL_MINUTES = TOTAL_HOURS * 60

export default function StationPageClient({
  buoyId,
  stationName,
  isLive,
  data,
}: StationPageClientProps) {
  const [scaleId, setScaleId] = useState<TimeScale>('1h')
  const [hoverPoint, setHoverPoint] = useState<MinuteDataPoint | null>(null)
  const [nowOffset, setNowOffset] = useState<number>(0) // Minutes ago from current time (0 = live)

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes

  // Calculate max offset: can't go back more than TOTAL_MINUTES minus current scale
  const maxOffset = TOTAL_MINUTES - timeWindowMinutes

  // Calculate reference time and window start for display
  // Use state to capture current time once per render cycle
  const [currentTime] = useState(() => Date.now())
  const referenceTime = useMemo(
    () => new Date(currentTime - nowOffset * 60 * 1000),
    [currentTime, nowOffset]
  )
  const windowStart = useMemo(
    () => new Date(currentTime - (nowOffset + timeWindowMinutes) * 60 * 1000),
    [currentTime, nowOffset, timeWindowMinutes]
  )

  // Calculate display point: use hoverPoint if set, otherwise most recent data point
  const displayPoint = useMemo(() => {
    if (hoverPoint) return hoverPoint
    if (!data || data.length === 0) return undefined

    // Find point with minsAgo = nowOffset (reference time), or fallback to closest
    const referencePoint = data.find((p) => p.minsAgo === nowOffset)
    if (referencePoint) return referencePoint

    // Find closest point to reference time
    let closest = data[0]
    let minDiff = Math.abs(data[0]?.minsAgo - nowOffset)
    for (const point of data) {
      const diff = Math.abs(point.minsAgo - nowOffset)
      if (diff < minDiff) {
        minDiff = diff
        closest = point
      }
    }
    return closest
  }, [hoverPoint, data, nowOffset])

  // Calculate mode: 'touch' when hovering, 'reference' when showing most recent
  const mode: 'reference' | 'touch' = hoverPoint ? 'touch' : 'reference'

  // Check if currently at live position
  const isAtLive = nowOffset === 0

  return (
    <MobileStationLayout
      header={
        <StationHeader stationName={stationName} buoyId={buoyId} isLive={isLive} />
      }
      dock={
        <BottomControlsDock
          scaleId={scaleId}
          nowOffset={nowOffset}
          maxOffset={maxOffset}
          timeWindowMinutes={timeWindowMinutes}
          isLive={isAtLive}
          referenceTime={referenceTime}
          windowStart={windowStart}
          onScaleChange={setScaleId}
          onOffsetChange={setNowOffset}
          onReturnToLive={() => setNowOffset(0)}
        />
      }
    >
      {/* Polar chart card */}
      {data && data.length > 0 && (
        <PolarChart
          data={data}
          buoyId={buoyId}
          timeWindowMinutes={timeWindowMinutes}
          nowOffsetMinutes={nowOffset}
          hoverPoint={hoverPoint}
          onHoverChange={setHoverPoint}
          displayPoint={displayPoint}
          mode={mode}
        />
      )}
    </MobileStationLayout>
  )
}

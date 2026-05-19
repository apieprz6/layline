'use client'

import { useState, useMemo } from 'react'
import type { MinuteDataPoint } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import MobileStationLayout from '@/components/dashboard/MobileStationLayout'
import StationHeader from '@/components/dashboard/StationHeader'
import PolarChart from '@/components/dashboard/PolarChart'
import SpeedLineChart from '@/components/dashboard/SpeedLineChart'
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

  // Calculate latest data time (most recent sample)
  const latestDataTime = useMemo(() => {
    if (!data || data.length === 0) return new Date()
    const latestPoint = data.find((p) => p.minsAgo === 0) || data[0]
    return new Date(currentTime - latestPoint.minsAgo * 60 * 1000)
  }, [data, currentTime])

  // For demo: use current time minus 12 seconds as lastFetchTime
  // TODO: This should come from the API response (fetchedAt field)
  const lastFetchTime = useMemo(() => new Date(currentTime - 12 * 1000), [currentTime])

  return (
    <MobileStationLayout
      header={
        <StationHeader
          stationName={stationName}
          buoyId={buoyId}
          latestDataTime={latestDataTime}
          lastFetchTime={lastFetchTime}
          nowOffset={nowOffset}
          onReturnToLive={() => setNowOffset(0)}
        />
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

      {/* Speed line chart card */}
      {data && data.length > 0 && (
        <div
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--surface-border)',
            borderRadius: '12px',
            padding: '12px 10px 6px 10px',
            marginBottom: '14px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 6px 4px 6px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '9.5px',
                fontWeight: '600',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Wind speed
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-muted)',
              }}
            >
              {TIME_SCALES[scaleId].label}
            </span>
          </div>
          <SpeedLineChart
            data={data}
            timeWindowMinutes={timeWindowMinutes}
            nowOffsetMinutes={nowOffset}
            hoverPoint={hoverPoint}
            onHoverChange={setHoverPoint}
          />
        </div>
      )}
    </MobileStationLayout>
  )
}

'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See ./README.md.
 *
 * LAY-168's harness (`../station-chrome/PrototypeStationChrome.tsx`), with
 * the gust and wave readings at the displayed moment worked out once for all
 * three variants. Scrubbing and scale behave exactly as on the real page.
 */

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { WindDataPointWithOffset } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { getMinutesAgo } from '@/lib/utils/time'
import PrototypeSwitcher from '../station-chrome/PrototypeSwitcher'
import FixtureBar from './FixtureBar'
import VariantA, { VARIANT_A_NAME } from './VariantA'
import VariantB, { VARIANT_B_NAME } from './VariantB'
import VariantC, { VARIANT_C_NAME } from './VariantC'
import { inWindow, peakGust, readingAt, type ProtoPointWithOffset } from './readings'
import type { ProtoMetadata, ProtoPoint } from './fixtures'
import type { ContentProps } from './shared'

interface PrototypeStationContentProps {
  buoyId: string
  stationName: string
  metadata: ProtoMetadata
  data: ProtoPoint[]
  windIsSynthetic: boolean
  serverTime: number
}

const TOTAL_MINUTES = 72 * 60

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME, Component: VariantA },
  { key: 'B', name: VARIANT_B_NAME, Component: VariantB },
  { key: 'C', name: VARIANT_C_NAME, Component: VariantC },
]

export default function PrototypeStationContent({
  buoyId,
  stationName,
  metadata,
  data,
  windIsSynthetic,
  serverTime,
}: PrototypeStationContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const variant = VARIANTS.find((v) => v.key === searchParams.get('variant')) ?? VARIANTS[0]
  const missing = searchParams.get('missing') === '1'

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null) params.delete(key)
      else params.set(key, value)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const [scaleId, setScaleId] = useState<TimeScale>('1h')
  const [hoverPoint, setHoverPoint] = useState<WindDataPointWithOffset | null>(null)
  const [nowOffset, setNowOffset] = useState<number>(0)

  const now = useMemo(() => new Date(serverTime), [serverTime])

  const dataWithOffset: ProtoPointWithOffset[] = useMemo(
    () => data.map((point) => ({ ...point, minsAgo: getMinutesAgo(point.timestamp, now) })),
    [data, now]
  )

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes
  const maxOffset = TOTAL_MINUTES - timeWindowMinutes

  const handleScaleChange = useCallback(
    (newScale: TimeScale) => {
      if (nowOffset > TOTAL_MINUTES - TIME_SCALES[newScale].minutes) setNowOffset(0)
      setScaleId(newScale)
    },
    [nowOffset]
  )

  const referenceTime = useMemo(() => new Date(serverTime - nowOffset * 60000), [serverTime, nowOffset])
  const windowStart = useMemo(
    () => new Date(serverTime - (nowOffset + timeWindowMinutes) * 60000),
    [serverTime, nowOffset, timeWindowMinutes]
  )

  // The real components hand back the point they were given, but typed as the
  // narrower WindDataPoint — so look the full fixture point up by its offset.
  const displayPoint = useMemo(() => {
    if (dataWithOffset.length === 0) return undefined
    const target = hoverPoint ? hoverPoint.minsAgo : nowOffset
    let closest = dataWithOffset[0]
    for (const p of dataWithOffset) {
      if (Math.abs(p.minsAgo - target) < Math.abs(closest.minsAgo - target)) closest = p
    }
    return closest
  }, [hoverPoint, dataWithOffset, nowOffset])

  const windowPoints = useMemo(
    () => inWindow(dataWithOffset, nowOffset, timeWindowMinutes),
    [dataWithOffset, nowOffset, timeWindowMinutes]
  )

  const latestDataTime = useMemo(() => {
    if (dataWithOffset.length === 0) return new Date(serverTime)
    const latest = dataWithOffset.reduce((a, b) => (b.minsAgo < a.minsAgo ? b : a))
    return new Date(serverTime - latest.minsAgo * 60000)
  }, [dataWithOffset, serverTime])

  const onReturnToLive = useCallback(() => setNowOffset(0), [])

  const contentProps: ContentProps = {
    buoyId,
    stationName,
    metadata,
    data,
    dataWithOffset,
    now,
    scaleId,
    timeWindowMinutes,
    nowOffset,
    maxOffset,
    isAtLive: nowOffset === 0,
    referenceTime,
    windowStart,
    latestDataTime,
    hoverPoint,
    displayPoint,
    mode: hoverPoint ? 'touch' : 'reference',
    windowPoints,
    gust: readingAt(dataWithOffset, displayPoint, 'gust'),
    wave: readingAt(dataWithOffset, displayPoint, 'waveHeight'),
    peakGust: peakGust(windowPoints),
    onHoverChange: setHoverPoint,
    onScaleChange: handleScaleChange,
    onOffsetChange: setNowOffset,
    onReturnToLive,
  }

  const Variant = variant.Component

  return (
    <>
      <Variant {...contentProps} />
      <FixtureBar
        buoyId={buoyId}
        missing={missing}
        metadata={metadata}
        windIsSynthetic={windIsSynthetic}
        onChange={setParam}
      />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant.key}
        onChange={(key) => setParam('variant', key)}
      />
    </>
  )
}

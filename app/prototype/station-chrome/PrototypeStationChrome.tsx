'use client'

/**
 * PROTOTYPE HARNESS — throwaway. See ./README.md.
 *
 * Wires `?variant=` to A/B/C. The state below — scale, offset, hover, the
 * derived reference/window times — is `StationPageClient`'s, copied rather
 * than imported so each variant stays free to wrap it however it wants.
 * LAY-168 is a chrome question, not a new interaction model, so none of this
 * logic itself changed.
 */

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { WindDataPoint, WindDataPointWithOffset } from '@/types'
import { TIME_SCALES, type TimeScale } from '@/lib/utils/windowing'
import { getMinutesAgo } from '@/lib/utils/time'
import PrototypeSwitcher from './PrototypeSwitcher'
import VariantA, { VARIANT_A_NAME } from './VariantA'
import VariantB, { VARIANT_B_NAME } from './VariantB'
import VariantC, { VARIANT_C_NAME } from './VariantC'
import type { VariantProps } from './shared'

interface PrototypeStationChromeProps {
  buoyId: string
  stationName: string
  data: WindDataPoint[]
  fetchedAt: string
  serverTime: number
}

const TOTAL_HOURS = 72
const TOTAL_MINUTES = TOTAL_HOURS * 60

const VARIANTS = [
  { key: 'A', name: VARIANT_A_NAME, Component: VariantA },
  { key: 'B', name: VARIANT_B_NAME, Component: VariantB },
  { key: 'C', name: VARIANT_C_NAME, Component: VariantC },
]

export default function PrototypeStationChrome({
  buoyId,
  stationName,
  data,
  fetchedAt,
  serverTime,
}: PrototypeStationChromeProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const variantKey = searchParams.get('variant') ?? 'A'
  const variant = VARIANTS.find((v) => v.key === variantKey) ?? VARIANTS[0]

  const setVariant = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('variant', key)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const [scaleId, setScaleId] = useState<TimeScale>('1h')
  const [hoverPoint, setHoverPoint] = useState<WindDataPointWithOffset | null>(null)
  const [nowOffset, setNowOffset] = useState<number>(0)

  const now = useMemo(() => new Date(serverTime), [serverTime])

  const dataWithOffset: WindDataPointWithOffset[] = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        minsAgo: getMinutesAgo(point.timestamp, now),
      })),
    [data, now]
  )

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes
  const maxOffset = TOTAL_MINUTES - timeWindowMinutes

  const handleScaleChange = useCallback(
    (newScale: TimeScale) => {
      const newMaxOffset = TOTAL_MINUTES - TIME_SCALES[newScale].minutes
      if (nowOffset > newMaxOffset) setNowOffset(0)
      setScaleId(newScale)
    },
    [nowOffset]
  )

  const referenceTime = useMemo(
    () => new Date(serverTime - nowOffset * 60 * 1000),
    [serverTime, nowOffset]
  )
  const windowStart = useMemo(
    () => new Date(serverTime - (nowOffset + timeWindowMinutes) * 60 * 1000),
    [serverTime, nowOffset, timeWindowMinutes]
  )

  const displayPoint = useMemo(() => {
    if (hoverPoint) return hoverPoint
    if (!dataWithOffset || dataWithOffset.length === 0) return undefined

    const referencePoint = dataWithOffset.find((p) => p.minsAgo === nowOffset)
    if (referencePoint) return referencePoint

    let closest = dataWithOffset[0]
    let minDiff = Math.abs(dataWithOffset[0]?.minsAgo - nowOffset)
    for (const point of dataWithOffset) {
      const diff = Math.abs(point.minsAgo - nowOffset)
      if (diff < minDiff) {
        minDiff = diff
        closest = point
      }
    }
    return closest
  }, [hoverPoint, dataWithOffset, nowOffset])

  const mode: 'reference' | 'touch' = hoverPoint ? 'touch' : 'reference'
  const isAtLive = nowOffset === 0

  const latestDataTime = useMemo(() => {
    if (!dataWithOffset || dataWithOffset.length === 0) return new Date()
    const latestPoint = dataWithOffset.find((p) => p.minsAgo === 0) || dataWithOffset[0]
    return new Date(serverTime - latestPoint.minsAgo * 60 * 1000)
  }, [dataWithOffset, serverTime])

  const lastFetchTime = useMemo(() => new Date(fetchedAt), [fetchedAt])

  const onReturnToLive = useCallback(() => setNowOffset(0), [])

  const variantProps: VariantProps = {
    buoyId,
    stationName,
    data,
    dataWithOffset,
    now,
    scaleId,
    timeWindowMinutes,
    nowOffset,
    maxOffset,
    isAtLive,
    referenceTime,
    windowStart,
    latestDataTime,
    lastFetchTime,
    hoverPoint,
    displayPoint,
    mode,
    onHoverChange: setHoverPoint,
    onScaleChange: handleScaleChange,
    onOffsetChange: setNowOffset,
    onReturnToLive,
  }

  const Variant = variant.Component

  return (
    <>
      <Variant {...variantProps} />
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant.key}
        onChange={setVariant}
      />
    </>
  )
}

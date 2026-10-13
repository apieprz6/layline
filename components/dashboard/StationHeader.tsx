'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { formatTimeHHMM, formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'

interface StationHeaderProps {
  stationName: string
  buoyId: string
  latestDataTime: Date
  nowOffset: number
  onReturnToLive: () => void
}

/** The station page's sticky one-row header: back, name and id, latest sample, live pill. */
export default function StationHeader({
  stationName,
  buoyId,
  latestDataTime,
  nowOffset,
  onReturnToLive,
}: StationHeaderProps) {
  const router = useRouter()
  const handleBack = useCallback(() => safeBack(router), [router])
  const isLive = nowOffset === 0

  return (
    // The testid is shared with `app/station/[buoyId]/loading.tsx`, so a browser can
    // measure both and prove the swap moves nothing.
    <div data-testid="station-header" className="station-header">
      <button onClick={handleBack} className="station-header__back" aria-label="Go back">
        ←
      </button>

      <div className="station-header__title">
        <h1 className="station-header__name">{stationName}</h1>
        <span className="station-header__id">{buoyId}</span>
        <span className="station-header__latest">· Latest {formatTimeHHMM(latestDataTime)}</span>
      </div>

      <button
        onClick={onReturnToLive}
        className={`station-header__pill${isLive ? ' station-header__pill--live' : ''}`}
        aria-label={isLive ? 'Live' : 'Return to live'}
      >
        <span className="station-header__pill-dot" />
        <span>{isLive ? 'Live' : formatOffset(nowOffset)}</span>
      </button>
    </div>
  )
}

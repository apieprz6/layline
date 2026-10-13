'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant B — "Let the charts breathe." See VariantB.module.css for the
 * layout argument. The header collapses on scroll rather than shrinking
 * permanently; the grid never grows a column.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import WindRose from '@/components/dashboard/WindRose'
import ScaleControl from '@/components/dashboard/ScaleControl'
import TimeScrubber from '@/components/dashboard/TimeScrubber'
import { formatTimeHHMM, formatFetchAge, formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'
import ModuleSlot from './ModuleSlot'
import SpeedCard from './SpeedCard'
import StatsOnly from './StatsOnly'
import { MODULE_PLACEHOLDERS, type VariantProps } from './shared'
import grid from './grid.module.css'
import styles from './VariantB.module.css'

export const VARIANT_B_NAME = 'Let the charts breathe'

const COLLAPSE_THRESHOLD = 24

export default function VariantB(props: VariantProps) {
  const {
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
    latestDataTime,
    lastFetchTime,
    hoverPoint,
    onHoverChange,
    onScaleChange,
    onOffsetChange,
    onReturnToLive,
  } = props

  const router = useRouter()
  const handleBack = useCallback(() => safeBack(router), [router])
  const hasData = data && data.length > 0

  const [collapsed, setCollapsed] = useState(false)

  // The document scrolls, not `.scroll` — the layout has a min-height, not a height.
  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > COLLAPSE_THRESHOLD)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={`${grid.layout} ${styles.wrapper}`}>
      <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`}>
        <div className={styles.headerRow}>
          <button onClick={handleBack} className={styles.backBtn} aria-label="Go back">
            ←
          </button>
          <span className={styles.name}>{stationName}</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '999px',
              background: isAtLive ? '#007A2F' : '#0044CC',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
        </div>
        <div className={`${styles.metaRow} ${collapsed ? styles.metaRowCollapsed : ''}`}>
          <div className={styles.metaRowInner}>
            {buoyId} · Latest {formatTimeHHMM(latestDataTime)} · Fetched{' '}
            {formatFetchAge(lastFetchTime, now)}
          </div>
        </div>
      </div>

      <div className={grid.scroll}>
        <div className={grid.content}>
          <div className={grid.windRose}>
            {hasData ? (
              <WindRose
                data={data}
                referenceTime={now}
                timeWindowMinutes={timeWindowMinutes}
                nowOffsetMinutes={nowOffset}
                hoverPoint={hoverPoint}
                onHoverChange={onHoverChange}
                displayPoint={props.displayPoint}
                mode={props.mode}
              />
            ) : null}
          </div>

          <div className={grid.speed}>
            {hasData ? (
              <SpeedCard
                data={data}
                now={now}
                scaleId={scaleId}
                timeWindowMinutes={timeWindowMinutes}
                nowOffset={nowOffset}
                hoverPoint={hoverPoint}
                onHoverChange={onHoverChange}
              />
            ) : null}
          </div>

          <div className={grid.stats}>
            {hasData ? (
              <StatsOnly
                dataWithOffset={dataWithOffset}
                timeWindowMinutes={timeWindowMinutes}
                nowOffsetMinutes={nowOffset}
              />
            ) : null}
          </div>
        </div>

        <div className={styles.moduleStrip}>
          {MODULE_PLACEHOLDERS.map((m) => (
            <ModuleSlot key={m.key} label={m.label} hint={m.hint} />
          ))}
        </div>
      </div>

      <div className={styles.dock}>
        <div className={styles.dockRow}>
          <div style={{ minWidth: 0 }}>
            <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TimeScrubber
              value={nowOffset}
              max={maxOffset}
              scaleMinutes={timeWindowMinutes}
              onChange={onOffsetChange}
            />
          </div>
          {!isAtLive && <span className={styles.viewing}>{formatOffset(nowOffset)}</span>}
          <button
            onClick={onReturnToLive}
            disabled={isAtLive}
            className={styles.liveBtn}
            aria-label="Return to live"
          >
            ⏺
          </button>
        </div>
      </div>
    </div>
  )
}

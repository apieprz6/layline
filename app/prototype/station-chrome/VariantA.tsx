'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant A — "Shrink in place." See VariantA.module.css for the layout
 * argument. WindRose, SpeedLineChart, ScaleControl and TimeScrubber are the
 * real components, unchanged — only what wraps them is new.
 */

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import WindRose from '@/components/dashboard/WindRose'
import ScaleControl from '@/components/dashboard/ScaleControl'
import TimeScrubber from '@/components/dashboard/TimeScrubber'
import { TIME_SCALES } from '@/lib/utils/windowing'
import { formatDateTimeRange } from '@/lib/utils/time'
import { formatTimeHHMM, formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'
import ModuleSlot from './ModuleSlot'
import SpeedCard from './SpeedCard'
import StatsOnly from './StatsOnly'
import { MODULE_PLACEHOLDERS, type VariantProps } from './shared'
import grid from './grid.module.css'
import styles from './VariantA.module.css'

export const VARIANT_A_NAME = 'Shrink in place'

export default function VariantA(props: VariantProps) {
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
    referenceTime,
    windowStart,
    latestDataTime,
    hoverPoint,
    onHoverChange,
    onScaleChange,
    onOffsetChange,
    onReturnToLive,
  } = props

  const router = useRouter()
  const handleBack = useCallback(() => safeBack(router), [router])
  const hasData = data && data.length > 0

  return (
    <div className={`${grid.layout} ${styles.wrapper}`}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button onClick={handleBack} className={styles.backBtn} aria-label="Go back">
            ←
          </button>
          <div className={styles.nameBlock}>
            <span className={styles.name}>{stationName}</span>
            <span className={styles.buoyId}>{buoyId}</span>
            <span className={styles.metaInline}>
              · Latest {formatTimeHHMM(latestDataTime)}
            </span>
          </div>
          <button
            onClick={onReturnToLive}
            aria-label={isAtLive ? 'Live' : 'Return to live'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 9px',
              borderRadius: '999px',
              border: isAtLive
                ? '1.25px solid rgba(0,122,47,0.45)'
                : '1.25px solid rgba(0,68,204,0.66)',
              background: isAtLive ? 'rgba(0,122,47,0.06)' : 'rgba(0,68,204,0.15)',
              fontFamily: 'var(--font-body)',
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: isAtLive ? '#007A2F' : '#0044CC',
              textTransform: 'uppercase',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '999px',
                background: 'currentColor',
              }}
            />
            {isAtLive ? 'Live' : formatOffset(nowOffset)}
          </button>
        </div>
      </div>

      <div className={grid.scroll}>
        <div className={`${grid.content} ${styles.content}`}>
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

          <div className={styles.modules}>
            {MODULE_PLACEHOLDERS.map((m) => (
              <ModuleSlot key={m.key} label={m.label} hint={m.hint} />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.dock}>
        <div className={styles.dockRow} style={{ marginBottom: '6px' }}>
          <div style={{ flex: 1 }}>
            <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
          </div>
          <button
            onClick={onReturnToLive}
            disabled={isAtLive}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '10.5px',
              fontWeight: 500,
              padding: '7px 9px',
              background: 'var(--accent-primary)',
              color: 'white',
              border: '1px solid var(--accent-primary)',
              borderRadius: '8px',
              cursor: isAtLive ? 'not-allowed' : 'pointer',
              opacity: isAtLive ? 0.45 : 1,
              flexShrink: 0,
            }}
          >
            Live →
          </button>
        </div>
        <TimeScrubber
          value={nowOffset}
          max={maxOffset}
          scaleMinutes={timeWindowMinutes}
          onChange={onOffsetChange}
        />
        <div className={styles.caption}>
          {formatDateTimeRange(windowStart)} → {formatDateTimeRange(referenceTime)} ·{' '}
          {TIME_SCALES[scaleId].label}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant C — "The dock stops floating." See VariantC.module.css for the
 * layout argument, including the one explicit ultrawide (>=1920px)
 * breakpoint among the three variants.
 */

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import WindRose from '@/components/dashboard/WindRose'
import ScaleControl from '@/components/dashboard/ScaleControl'
import TimeScrubber from '@/components/dashboard/TimeScrubber'
import { formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'
import ModuleSlot from './ModuleSlot'
import SpeedCard from './SpeedCard'
import StatsOnly from './StatsOnly'
import { MODULE_PLACEHOLDERS, type VariantProps } from './shared'
import grid from './grid.module.css'
import styles from './VariantC.module.css'

export const VARIANT_C_NAME = 'The dock stops floating'

export default function VariantC(props: VariantProps) {
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
    hoverPoint,
    onHoverChange,
    onScaleChange,
    onOffsetChange,
    onReturnToLive,
  } = props

  const router = useRouter()
  const handleBack = useCallback(() => safeBack(router), [router])
  const hasData = data && data.length > 0

  const livePill = (
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
        style={{ width: '6px', height: '6px', borderRadius: '999px', background: 'currentColor' }}
      />
      {isAtLive ? 'Live' : formatOffset(nowOffset)}
    </button>
  )

  return (
    <div className={`${grid.layout} ${styles.wrapper}`}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button onClick={handleBack} className={styles.backBtn} aria-label="Go back">
            ←
          </button>
          <div className={styles.name}>
            <span className={styles.nameText}>{stationName}</span>
            <span className={styles.buoyId}>{buoyId}</span>
          </div>
          {livePill}
        </div>

      {/* 768px+: the dock relocated here, under the header and sticky with it */}
      <div className={styles.rail}>
        <div className={styles.railScale}>
          <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
        </div>
        <div className={styles.railScrubber}>
          <TimeScrubber
            value={nowOffset}
            max={maxOffset}
            scaleMinutes={timeWindowMinutes}
            onChange={onOffsetChange}
          />
        </div>
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

        <div className={styles.moduleStrip}>
          {MODULE_PLACEHOLDERS.map((m) => (
            <ModuleSlot key={m.key} label={m.label} hint={m.hint} />
          ))}
        </div>
      </div>

      {/* Phone-only: the dock still floats fixed, thumb reach is real there */}
      <div className={styles.dock}>
        <div className={styles.dockRow} style={{ marginBottom: '6px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
          </div>
          <button
            onClick={onReturnToLive}
            disabled={isAtLive}
            className={styles.liveBtn}
            aria-label="Return to live"
          >
            ⏺
          </button>
        </div>
        <TimeScrubber
          value={nowOffset}
          max={maxOffset}
          scaleMinutes={timeWindowMinutes}
          onChange={onOffsetChange}
        />
      </div>
    </div>
  )
}

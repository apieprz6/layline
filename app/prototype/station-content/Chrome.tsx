'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * LAY-168's winning chrome (Variant A, "Shrink in place"), lifted out of
 * `../station-chrome/VariantA.tsx` so all three content variants sit in the
 * same shell: one-row header, two-row fixed dock. Its CSS is imported from
 * that folder, not copied. `headerExtra` is the one addition — a slot after
 * the station id, used by variant A for the elevation chip.
 */

import { useRouter } from 'next/navigation'
import { useCallback, type ReactNode } from 'react'
import ScaleControl from '@/components/dashboard/ScaleControl'
import TimeScrubber from '@/components/dashboard/TimeScrubber'
import { TIME_SCALES } from '@/lib/utils/windowing'
import { formatDateTimeRange } from '@/lib/utils/time'
import { formatTimeHHMM, formatOffset } from '@/lib/utils/timeFormatting'
import { safeBack } from '@/lib/utils/navigation'
import grid from '../station-chrome/grid.module.css'
import styles from '../station-chrome/VariantA.module.css'
import type { ContentProps } from './shared'

interface ChromeProps {
  props: ContentProps
  headerExtra?: ReactNode
  contentClassName?: string
  children: ReactNode
}

export default function Chrome({ props, headerExtra, contentClassName, children }: ChromeProps) {
  const {
    buoyId,
    stationName,
    scaleId,
    timeWindowMinutes,
    nowOffset,
    maxOffset,
    isAtLive,
    referenceTime,
    windowStart,
    latestDataTime,
    onScaleChange,
    onOffsetChange,
    onReturnToLive,
  } = props

  const router = useRouter()
  const handleBack = useCallback(() => safeBack(router), [router])

  return (
    <div className={`${grid.layout} ${styles.wrapper}`}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <button onClick={handleBack} className={styles.backBtn} aria-label="Go back">
            ←
          </button>
          <div className={styles.nameBlock} style={{ overflow: 'visible', alignItems: 'center' }}>
            <span className={styles.name}>{stationName}</span>
            <span className={styles.buoyId}>{buoyId}</span>
            {headerExtra}
            <span className={styles.metaInline}>· Latest {formatTimeHHMM(latestDataTime)}</span>
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
              border: isAtLive ? '1.25px solid rgba(0,122,47,0.45)' : '1.25px solid rgba(0,68,204,0.66)',
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
            <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: 'currentColor' }} />
            {isAtLive ? 'Live' : formatOffset(nowOffset)}
          </button>
        </div>
      </div>

      <div className={grid.scroll}>
        {/* Not LAY-168 A's `.content`: its third column is B's to append, not a given. */}
        <div className={`${grid.content} ${contentClassName ?? ''}`}>{children}</div>
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
        <TimeScrubber value={nowOffset} max={maxOffset} scaleMinutes={timeWindowMinutes} onChange={onOffsetChange} />
        <div className={styles.caption}>
          {formatDateTimeRange(windowStart)} → {formatDateTimeRange(referenceTime)} · {TIME_SCALES[scaleId].label}
        </div>
      </div>
    </div>
  )
}

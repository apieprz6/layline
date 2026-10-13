'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant B — "Own modules." LAY-168 A's third column as built: a Gust tile
 * and a Wave tile, stacked at 1024, side by side at 1440. Each carries its
 * current figure and a sparkline of the window. The speed chart and rose are
 * today's. Below 1024 the tiles become a two-up strip after stats, not hidden
 * as LAY-168 A had them, because the phone is the primary device. CHII2 gets
 * the Gust tile alone. The elevation note sits on the speed chart's title.
 */

import GustWindRose from './GustWindRose'
import Chrome from './Chrome'
import ElevationNote from './ElevationNote'
import SpeedCard from './SpeedCard'
import StatsOnly from '../station-chrome/StatsOnly'
import { GustTile, WaveTile } from './Modules'
import { TIME_SCALES } from '@/lib/utils/windowing'
import grid from '../station-chrome/grid.module.css'
import styles from './variants.module.css'
import type { ContentProps } from './shared'

export const VARIANT_B_NAME = 'Own modules'

export default function VariantB(props: ContentProps) {
  const { metadata, data, displayPoint, gust, wave, windowPoints, peakGust, scaleId } = props
  const hasData = data.length > 0
  const { capability } = metadata
  const tileCount = Number(capability.gust) + Number(capability.waves)
  const scaleLabel = TIME_SCALES[scaleId].label

  return (
    <Chrome props={props} contentClassName={styles.modulesContent}>
      <div className={`${grid.windRose} ${styles.roseAboveStrip}`}>
        {hasData && (
          <GustWindRose
            data={data}
            referenceTime={props.now}
            timeWindowMinutes={props.timeWindowMinutes}
            nowOffsetMinutes={props.nowOffset}
            hoverPoint={props.hoverPoint}
            onHoverChange={props.onHoverChange}
            displayPoint={displayPoint}
            mode={props.mode}
          />
        )}
      </div>

      <div className={grid.speed}>
        {hasData && (
          <SpeedCard
            data={data}
            gustStyle="none"
            now={props.now}
            scaleId={scaleId}
            timeWindowMinutes={props.timeWindowMinutes}
            nowOffset={props.nowOffset}
            hoverPoint={props.hoverPoint}
            onHoverChange={props.onHoverChange}
            titleExtra={<ElevationNote metadata={metadata} look="chip" />}
          />
        )}
      </div>

      <div className={grid.stats}>
        {hasData && (
          <StatsOnly
            dataWithOffset={props.dataWithOffset}
            timeWindowMinutes={props.timeWindowMinutes}
            nowOffsetMinutes={props.nowOffset}
          />
        )}
      </div>

      {tileCount > 0 && (
        <div className={`${styles.modules} ${tileCount === 1 ? styles.single : ''}`}>
          {capability.gust && (
            <GustTile reading={gust} windowPoints={windowPoints} peak={peakGust} scaleLabel={scaleLabel} />
          )}
          {capability.waves && <WaveTile reading={wave} windowPoints={windowPoints} scaleLabel={scaleLabel} />}
        </div>
      )}
    </Chrome>
  )
}

'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant C — "Gust in, waves out." The two get different treatments because
 * they're different kinds of thing. Gust is wind speed: same unit, same axis,
 * same anemometer, so it folds into the speed chart (one tick per reading)
 * and the rose readout. Waves are a different quantity with no chart to join,
 * so they get one compact strip under stats in column 2. LAY-61's two columns
 * stay; LAY-168 A's third is dropped. The elevation note is an ⓘ on the
 * rose's "Speed" label, next to the numbers it qualifies.
 */

import GustWindRose from './GustWindRose'
import Chrome from './Chrome'
import ElevationNote from './ElevationNote'
import SpeedCard from './SpeedCard'
import StatsOnly from '../station-chrome/StatsOnly'
import { WaveStrip } from './Modules'
import grid from '../station-chrome/grid.module.css'
import styles from './variants.module.css'
import type { ContentProps } from './shared'

export const VARIANT_C_NAME = 'Gust in, waves out'

export default function VariantC(props: ContentProps) {
  const { metadata, data, displayPoint, gust, wave } = props
  const hasData = data.length > 0
  const { capability } = metadata

  return (
    <Chrome
      props={props}
      contentClassName={`${styles.hybridContent} ${capability.waves ? styles.withWaves : ''}`}
    >
      <div className={grid.windRose}>
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
            gust={capability.gust ? gust.point?.gust ?? null : undefined}
            speedLabelExtra={<ElevationNote metadata={metadata} look="icon" align="right" />}
          />
        )}
      </div>

      <div className={grid.speed}>
        {hasData && (
          <SpeedCard
            data={data}
            gustStyle={capability.gust ? 'ticks' : 'none'}
            now={props.now}
            scaleId={props.scaleId}
            timeWindowMinutes={props.timeWindowMinutes}
            nowOffset={props.nowOffset}
            hoverPoint={props.hoverPoint}
            onHoverChange={props.onHoverChange}
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

      {capability.waves && (
        <div className={styles.waveStrip}>
          <WaveStrip reading={wave} />
        </div>
      )}
    </Chrome>
  )
}

'use client'

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Variant A — "Folded in." No new modules; LAY-61's two columns, with
 * LAY-168 A's third column dropped. Gust is a band on the speed chart and
 * a "G 18" under the rose's speed readout. Waves are a readout in the rose's
 * bottom-left corner. The elevation note is a chip in the header, beside the
 * station id, because it qualifies every wind number on the page.
 */

import GustWindRose from './GustWindRose'
import Chrome from './Chrome'
import ElevationNote from './ElevationNote'
import SpeedCard from './SpeedCard'
import StatsOnly from '../station-chrome/StatsOnly'
import { WaveCorner } from './Modules'
import grid from '../station-chrome/grid.module.css'
import styles from './variants.module.css'
import type { ContentProps } from './shared'

export const VARIANT_A_NAME = 'Folded in'

export default function VariantA(props: ContentProps) {
  const { metadata, data, displayPoint, gust, wave } = props
  const hasData = data.length > 0

  return (
    <Chrome
      props={props}
      contentClassName={styles.foldedContent}
      headerExtra={<ElevationNote metadata={metadata} look="chip" align="right" />}
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
            gust={metadata.capability.gust ? gust.point?.gust ?? null : undefined}
            corner={metadata.capability.waves ? <WaveCorner reading={wave} /> : undefined}
          />
        )}
      </div>

      <div className={grid.speed}>
        {hasData && (
          <SpeedCard
            data={data}
            gustStyle={metadata.capability.gust ? 'band' : 'none'}
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
    </Chrome>
  )
}

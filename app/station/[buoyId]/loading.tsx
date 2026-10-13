import type { CSSProperties, ReactElement } from 'react'
import Skeleton, { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import { TIME_SCALES } from '@/lib/utils/windowing'
import {
  STATS_PANEL_LABEL_STYLE,
  STATS_PANEL_STYLE,
} from '@/components/dashboard/StationStatsPanel'

/**
 * A station's detail screen while its 72 hours of history are still being read.
 *
 * This is the slowest screen in the app and the one reached by a tap on a station
 * row, so it is where a blank hold reads most like a dead click. `StationPageClient`'s
 * three cards are laid out here through the same `station-layout` grid, so the mobile
 * column and the 768px two-column grid both hold their shape.
 *
 * The chrome that is a *setting* rather than a reading is drawn for real: the panel's
 * "Stats" label, "Wind speed", the four stat labels, and the 1h window label, which
 * is the scale the screen always opens on. The station's own name is a bar — the route
 * carries a buoy id, and turning that into "Harrison-Dever Crib" here would put a
 * second spelling of the station's name in a second place.
 *
 * The back arrow and the live pill are drawn but inert: both need a client component to
 * do anything, and a skeleton exists to hold a shape, not to take a tap. Two seconds
 * later the real header arrives with both working.
 */

const CARD_STYLE: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--surface-border)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-sm)',
}

const STAT_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '2px',
}

const CARD_EYEBROW_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '9.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

export default function StationLoading(): ReactElement {
  return (
    <SkeletonScreen label="Loading station history" className="station-layout">
      {/* Header — StationHeader's own classes, so it is held at the same height, and its
          testid, so `e2e/loading-skeletons.spec.ts` measures the two the same way */}
      <div data-testid="station-header" className="station-header">
        <span aria-hidden="true" className="station-header__back">
          ←
        </span>

        <div className="station-header__title">
          {/* An `h1` in the real header, so --leading-tight and not the body's 1.5 */}
          <SkeletonText fontSize="14px" lineHeight="var(--leading-tight)" width="58%" />
        </div>

        <div className="station-header__pill">
          <Skeleton width="6px" height="6px" radius="var(--radius-full)" />
          <SkeletonText fontSize="10.5px" width="24px" />
        </div>
      </div>

      <div className="station-layout__scroll">
        <div className="station-layout__content">
          {/* Wind rose */}
          <div className="station-layout__wind-rose">
            <div className="wind-rose-card" style={{ ...CARD_STYLE, padding: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <SkeletonText fontSize="12px" width="76px" />
                <SkeletonText fontSize="10px" width="56px" />
              </div>

              <div
                className="wind-rose-card__chart"
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* The rose itself: 42 of the SVG's 360 is padding on each side */}
                <Skeleton width="76.7%" radius="var(--radius-full)" style={{ aspectRatio: '1' }} />
              </div>
            </div>
          </div>

          {/* Wind speed chart */}
          <div className="station-layout__speed">
            <div style={{ ...CARD_STYLE, padding: '12px 10px 6px 10px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 6px 4px 6px',
                }}
              >
                <span style={CARD_EYEBROW_STYLE}>Wind speed</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {TIME_SCALES['1h'].label}
                </span>
              </div>
              {/* The chart's own viewBox is 360 × 130 at width 100% */}
              <Skeleton style={{ aspectRatio: '360 / 130' }} />
            </div>
          </div>

          {/* Stats panel */}
          <div className="station-layout__stats">
            <div style={STATS_PANEL_STYLE}>
              <div style={STATS_PANEL_LABEL_STYLE}>Stats</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {['Mean dir', 'Mean spd', 'Range', 'Veer/back'].map((label) => (
                  <div key={label}>
                    <div style={STAT_LABEL_STYLE}>{label}</div>
                    <SkeletonText fontSize="19px" width="66%" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The dock is fixed, so it moves nothing — it is here because a station screen
          without one looks broken rather than pending */}
      <div className="bottom-dock">
        <div className="bottom-dock__row">
          <Skeleton height="38px" radius="var(--radius-md)" style={{ flex: 1 }} />
          <Skeleton width="50px" height="32px" radius="var(--radius-md)" />
        </div>

        {/* TimeScrubber's 44px track and its 14px row of tick labels */}
        <Skeleton height="58px" radius="var(--radius-md)" />

        <div className="bottom-dock__caption">
          <SkeletonText fontSize="9.5px" width="180px" style={{ margin: '0 auto' }} />
        </div>
      </div>
    </SkeletonScreen>
  )
}

import type { CSSProperties, ReactElement } from 'react'
import Skeleton, { SkeletonScreen, SkeletonText } from '@/components/common/Skeleton'
import { TIME_SCALES } from '@/lib/utils/windowing'
import { spacing } from '@/lib/utils/design'

/**
 * A station's detail screen while its 72 hours of history are still being read.
 *
 * This is the slowest screen in the app and the one reached by a tap on a station
 * row, so it is where a blank hold reads most like a dead click. `StationPageClient`'s
 * three cards are laid out here through the same `station-layout` grid, so the mobile
 * column and the 768px two-column grid both hold their shape.
 *
 * The chrome that is a *setting* rather than a reading is drawn for real: the panel's
 * three tab names, "Wind speed", the four stat labels, and the 1h window label, which
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

const PANEL_TAB_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '11.5px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textAlign: 'center',
  borderRadius: '7px',
  padding: '9px 0',
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
      {/* Header — StationHeader's shape, under its testid so the two are measured the
          same way in `e2e/loading-skeletons.spec.ts` */}
      <div
        data-testid="station-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--surface-raised)',
          borderBottom: '1px solid var(--surface-border)',
          padding: spacing(4),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing(3) }}>
          <span
            aria-hidden="true"
            style={{
              padding: spacing(2),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              fontSize: '18px',
              lineHeight: 1,
            }}
          >
            ←
          </span>

          <div style={{ flex: 1 }}>
            {/* An `h1` in the real header, so --leading-tight and not the body's 1.5 */}
            <SkeletonText fontSize="16px" lineHeight="var(--leading-tight)" width="58%" />
            <SkeletonText fontSize="10px" width="20%" style={{ marginTop: '2px' }} />
          </div>

          {/* The live pill, at its own geometry so the header is the right height */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px 5px 8px',
              borderRadius: '999px',
              border: '1.25px solid var(--surface-border)',
              flexShrink: 0,
            }}
          >
            <Skeleton width="7px" height="7px" radius="var(--radius-full)" />
            <SkeletonText fontSize="11px" width="24px" />
          </div>
        </div>

        {/* Metadata row: Latest, Fetched */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '10px',
          }}
        >
          <SkeletonText fontSize="10.5px" width="88px" />
          <SkeletonText fontSize="10.5px" width="96px" />
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
          <div className="station-layout__tabbed">
            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  background: 'var(--card-el)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '3px',
                  gap: '2px',
                  marginBottom: '14px',
                }}
              >
                {['Stats', 'Jump to', 'Legend'].map((label, index) => (
                  <span
                    key={label}
                    style={{
                      ...PANEL_TAB_STYLE,
                      color: index === 0 ? 'var(--text)' : 'var(--muted)',
                      background: index === 0 ? 'var(--card-bg)' : 'transparent',
                      boxShadow: index === 0 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>

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
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}
        >
          <span style={{ ...CARD_EYEBROW_STYLE, flexShrink: 0 }}>Scale</span>
          <Skeleton height="38px" radius="var(--radius-md)" style={{ flex: 1 }} />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2px',
          }}
        >
          <span style={CARD_EYEBROW_STYLE}>Time scrubber</span>
          <Skeleton width="52px" height="27px" radius="var(--radius-md)" />
        </div>

        <Skeleton height="44px" radius="var(--radius-md)" />
      </div>
    </SkeletonScreen>
  )
}

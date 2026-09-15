import type { CSSProperties, ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import {
  SHROUD_ORDER,
  SHROUD_SIDES,
  SIDE_LABEL,
  formatBandRange,
  formatTurns,
} from '@/lib/boat/rigTune'
import { spacing } from '@/lib/utils/design'
import type { RigTuneBand } from '@/types'

interface RigTuneBandTableProps {
  /** Ascending by `low_kt` — `readRigTune` owns that order. */
  bands: RigTuneBand[]
}

const BAND_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(2),
  background: 'var(--surface-elevated)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-md)',
  padding: spacing(3),
}

const RANGE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-primary)',
}

const LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const CHIP_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  borderRadius: 'var(--radius-sm)',
  padding: '1px 6px',
  flexShrink: 0,
}

const FIGURE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
}

const UNIT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
}

/**
 * A Rig Tune Version as it is read: one card per **Wind Band**, up the wind axis.
 *
 * Both encodings are shown for all three positions on both sides, because neither derives
 * from the other — no thread pitch is recorded, so the **Turnbuckle Gap** cannot be computed
 * from **Turns From Base** or the other way round (ADR 0007). Twelve figures a band, and the
 * screen shows twelve.
 *
 * A card per band rather than one wide grid: at 390px, six columns of millimetres is a
 * horizontal scroll over the values a sailor is comparing.
 *
 * A Server Component — reading a tune is not interactive.
 */
export default function RigTuneBandTable({ bands }: RigTuneBandTableProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
      {bands.map((band) => (
        <div key={band.id} data-testid="rig-tune-band" style={BAND_STYLE}>
          <div
            style={{ display: 'flex', alignItems: 'baseline', gap: spacing(2), flexWrap: 'wrap' }}
          >
            <span style={RANGE_STYLE}>{formatBandRange(band.low_kt, band.high_kt)}</span>
            {/* Free text from whatever guide the numbers came from, and only that: rig
                "medium" is 15–20 kt, which the dashboard's classifier calls heavy, so this
                label is never matched against those bins (ADR 0007). */}
            {band.label !== null && <span style={LABEL_STYLE}>{band.label}</span>}

            {band.is_base && (
              <span
                data-testid="base-tune-mark"
                style={{
                  ...CHIP_STYLE,
                  background: 'var(--surface-base)',
                  border: '1px solid var(--surface-border)',
                  color: 'var(--text-primary)',
                }}
              >
                Base Tune
              </span>
            )}

            {band.gaps_stale && (
              <span
                data-testid="gaps-stale-mark"
                style={{
                  ...CHIP_STYLE,
                  background: 'transparent',
                  border: '1px dashed var(--state-warning)',
                  color: 'var(--state-warning)',
                }}
              >
                Gaps stale
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(2) }}>
            {SHROUD_ORDER.map((position) => (
              <div key={position}>
                <div style={EYEBROW_STYLE}>{position}</div>
                {/* Wrapping, like the header above: two cells of "Port 72 mm +1½ turns"
                    are close to 390px once the card's padding is taken off, and a squeezed
                    figure is a figure that has to be guessed at. */}
                <div style={{ display: 'flex', gap: spacing(3), flexWrap: 'wrap' }}>
                  {SHROUD_SIDES.map((side) => {
                    const setting = band.shrouds[position][side]
                    return (
                      <div
                        key={side}
                        data-testid="shroud-side"
                        style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}
                      >
                        <span style={UNIT_STYLE}>{SIDE_LABEL[side]}</span>
                        <span style={FIGURE_STYLE}>{setting.gap_mm}</span>
                        <span style={UNIT_STYLE}>mm</span>
                        {/* The base's own Turns are 0 by definition — it is what the others
                            are counted from — so they are stated rather than dressed up. */}
                        <span style={{ ...FIGURE_STYLE, color: 'var(--text-muted)' }}>
                          {formatTurns(setting.turns_from_base)}
                        </span>
                        <span style={UNIT_STYLE}>turns</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {band.note !== null && (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
              }}
            >
              {band.note}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

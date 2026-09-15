import type { CSSProperties, ReactElement } from 'react'
import {
  CALIBRATION_CHANNELS,
  CHANNEL_LABEL,
  formatMultiplier,
  formatOffset,
} from '@/lib/boat/calibration'
import type { InstrumentCalibrationPayload } from '@/types'

interface CalibrationValuesProps {
  /** The Version in force, snapshotting all four channels. */
  payload: InstrumentCalibrationPayload
}

const HEAD_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  paddingBottom: '6px',
}

const FIGURE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
  textAlign: 'right',
  padding: '8px 0',
  whiteSpace: 'nowrap',
}

/**
 * What is programmed into the display right now, channel by channel.
 *
 * Every figure is in **the display's own encoding**: a multiplier reads `1.02`, never
 * `+2%`, and an offset carries its channel's own unit. These are transcriptions off
 * the TL-25, and a converted number would not match the number on the boat.
 *
 * `AWA` and `HDG` read **no multiplier** rather than `1.00` or a dash. The display has
 * no such field for them, so `1.00` would be a figure nobody programmed and a dash
 * would read as one withheld. It is not `NotRecorded` either: nothing is missing here,
 * the channel simply corrects by an offset alone (ADR 0005).
 *
 * A Server Component: a table of figures has nothing to hold.
 */
export default function CalibrationValues({ payload }: CalibrationValuesProps): ReactElement {
  return (
    <table
      data-testid="calibration-values"
      style={{ width: '100%', borderCollapse: 'collapse' }}
    >
      <thead>
        <tr>
          <th scope="col" style={{ ...HEAD_STYLE, textAlign: 'left' }}>
            Channel
          </th>
          <th scope="col" style={{ ...HEAD_STYLE, textAlign: 'right' }}>
            Multiplier
          </th>
          <th scope="col" style={{ ...HEAD_STYLE, textAlign: 'right' }}>
            Offset
          </th>
        </tr>
      </thead>
      <tbody>
        {CALIBRATION_CHANNELS.map((channel) => {
          const { multiplier, offset } = payload[channel]

          return (
            <tr key={channel} style={{ borderTop: '1px solid var(--surface-divider)' }}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  padding: '8px 0',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--text-primary)',
                }}
              >
                {/* The code alone at 390px, with the full name available to a reader
                    who cannot see the column it sits under. */}
                <abbr title={CHANNEL_LABEL[channel]} style={{ textDecoration: 'none' }}>
                  {channel}
                </abbr>
              </th>
              <td style={FIGURE_STYLE}>
                {multiplier === undefined ? (
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontStyle: 'italic',
                      color: 'var(--text-muted)',
                    }}
                  >
                    no multiplier
                  </span>
                ) : (
                  formatMultiplier(multiplier)
                )}
              </td>
              <td style={FIGURE_STYLE}>{formatOffset(channel, offset)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

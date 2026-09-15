import type { CSSProperties, ReactElement } from 'react'
import { polarSuppression } from '@/services/boat/polarSyntheticRows'
import { spacing } from '@/lib/utils/design'
import type { PolarPayload } from '@/types'

interface PolarGridProps {
  payload: PolarPayload
}

/**
 * A **Polar** as a grid of target boat speeds: one row per true wind angle, one column per
 * true wind speed.
 *
 * Boat speed, not VMG. A polar cell is speed through the water at that angle — the number a
 * sailor compares their STW against — and the grid says so beneath itself, because reading it
 * as VMG would make every downwind figure look impossibly good.
 *
 * Angles the file fills in rather than measures are **not drawn**, and the reason is printed
 * where they would have been. The rule is applied here, inside the grid, rather than by each
 * caller: the same suppression then holds on the upload preview, on a Version's own screen and
 * on anything either of them grows into, which is what "wherever the grid is displayed" needs
 * in order to be true. `polarSyntheticRows` explains how the rows are told apart; the stored
 * payload keeps every one of them.
 */
export default function PolarGrid({ payload }: PolarGridProps): ReactElement {
  const { firstTrustworthyTwa, suppressedTwa, reason } = polarSuppression(payload)
  const suppressed = new Set(suppressedTwa)

  const rows = payload.twa_axis
    .map((twa, index) => ({ twa, speeds: payload.boat_speed[index] }))
    .filter(({ twa }) => !suppressed.has(twa))

  return (
    <div data-testid="polar-grid">
      {reason !== null && (
        <p data-testid="polar-suppression-note" style={NOTE_STYLE}>
          {reason} The grid starts at {firstTrustworthyTwa}°.
        </p>
      )}

      {/* Horizontal scroll rather than a smaller type size: nine wind speeds do not fit a
          390px screen at a readable size, and a polar is read a cell at a time. */}
      <div style={{ overflowX: 'auto', marginTop: spacing(2) }}>
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th scope="col" style={{ ...HEAD_CELL_STYLE, ...STICKY_STYLE }}>
                TWA \ TWS
              </th>
              {payload.tws_axis.map((tws) => (
                <th key={tws} scope="col" style={HEAD_CELL_STYLE}>
                  {formatAxis(tws)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ twa, speeds }) => (
              <tr key={twa} data-testid="polar-row" data-twa={twa}>
                <th scope="row" style={{ ...ROW_HEAD_STYLE, ...STICKY_STYLE }}>
                  {formatAxis(twa)}°
                </th>
                {speeds.map((speed, column) => (
                  <td key={payload.tws_axis[column]} style={CELL_STYLE}>
                    {formatBoatSpeed(speed)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...NOTE_STYLE, marginTop: spacing(2) }}>
        Target boat speed in knots — speed through the water at that angle, not VMG. Wind speeds
        across the top, wind angles down the side.
      </p>
    </div>
  )
}

/**
 * An axis value as the file gave it: `4`, `12.5`. Never padded to a decimal place the file did
 * not use, because an axis is a label and `4.0 kn` of wind is not a thing anybody wrote.
 */
function formatAxis(value: number): string {
  return String(value)
}

/**
 * A boat speed, padded to two decimals so a column of them reads as a column.
 *
 * Padding only. A value carrying more precision than two decimals is shown in full rather than
 * rounded to fit — the file said it, so the screen says it.
 */
function formatBoatSpeed(speed: number): string {
  const written = String(speed)
  const decimals = written.includes('.') ? written.split('.')[1].length : 0
  return decimals <= 2 ? speed.toFixed(2) : written
}

const TABLE_STYLE: CSSProperties = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
}

const HEAD_CELL_STYLE: CSSProperties = {
  padding: '6px 10px',
  textAlign: 'right',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--surface-border)',
  background: 'var(--surface-raised)',
}

const ROW_HEAD_STYLE: CSSProperties = {
  padding: '6px 10px',
  textAlign: 'right',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--surface-divider)',
  background: 'var(--surface-raised)',
}

/** The angle column stays put while the wind speeds scroll, or a cell means nothing. */
const STICKY_STYLE: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  borderRight: '1px solid var(--surface-border)',
}

const CELL_STYLE: CSSProperties = {
  padding: '6px 10px',
  textAlign: 'right',
  borderBottom: '1px solid var(--surface-divider)',
}

const NOTE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

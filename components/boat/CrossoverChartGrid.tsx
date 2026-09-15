import type { CSSProperties, ReactElement } from 'react'
import { crossoverDefinitionUsage } from '@/services/boat/crossoverPayload'
import { spacing } from '@/lib/utils/design'
import type { CrossoverChartPayload } from '@/types'

interface CrossoverChartGridProps {
  payload: CrossoverChartPayload
}

/**
 * A **Crossover Chart** as a grid of sail choices: one row per true wind angle, one column per true
 * wind speed, each cell the sail to be carrying there.
 *
 * A cell is a *sail*, not a number, which is why nothing here is drawn as a table of figures the way
 * the Polar's grid is. The boat's own chart is 26 angles × 13 wind speeds — 338 cells — and what a
 * sailor reads off it is a shape: where the jib gives way to the A3, how far up the wind range the
 * kite survives. So the cells are small coloured blocks, and the block carries its sail number.
 *
 * **The number is always printed.** The colour is how the shape is seen; the number is how the sail
 * is identified. Colour alone would fail the night-vision theme, which is one red on purpose, and
 * would fail anyone who cannot separate the hues.
 *
 * At 390px this fits without scrolling and without shrinking below a readable size: thirteen 24px
 * cells and a 40px angle column come to 352px. A chart wider than the boat's scrolls sideways with
 * the angle column pinned, because a cell whose row you cannot see names nothing.
 *
 * The legend beneath is every definition the Version carries, **including the ones no cell calls
 * for**. A sail defined and never recommended is a real state — the boat's own chart defines one
 * and the storm jib may be another — and the count says so rather than the row disappearing
 * (`crossoverDefinitionUsage`, derived at read per ADR 0009).
 */
export default function CrossoverChartGrid({ payload }: CrossoverChartGridProps): ReactElement {
  const usage = crossoverDefinitionUsage(payload)

  // Band by position in this Version's own definitions list, not by sail number: the numbers are
  // qtVlm's and need not start at 1 or be contiguous, so indexing a palette by them would leave
  // gaps in the palette and give two charts of the same boat different colours.
  const bandOf = new Map(usage.map((entry, index) => [entry.definition.number, band(index)]))
  const labelOf = new Map(usage.map((entry) => [entry.definition.number, entry.definition.label]))

  return (
    <div data-testid="crossover-chart-grid">
      <div style={{ overflowX: 'auto', marginTop: spacing(2) }}>
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th scope="col" style={{ ...CORNER_STYLE, ...STICKY_STYLE }}>
                °\kn
              </th>
              {payload.tws_axis.map((tws) => (
                <th key={tws} scope="col" style={HEAD_CELL_STYLE}>
                  {formatAxis(tws)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payload.twa_axis.map((twa, row) => (
              <tr key={twa} data-testid="crossover-chart-row" data-twa={twa}>
                <th scope="row" style={{ ...ROW_HEAD_STYLE, ...STICKY_STYLE }}>
                  {formatAxis(twa)}
                </th>
                {(payload.cells[row] ?? []).map((sail, column) => (
                  <td
                    key={payload.tws_axis[column] ?? column}
                    data-testid="crossover-chart-cell"
                    data-sail={sail}
                    // The sail said in words as well as drawn, for the one cell being pointed at.
                    // A grid of 338 numbers is unreadable if every one has to be looked up.
                    title={`${formatAxis(twa)}° at ${formatAxis(
                      payload.tws_axis[column] ?? 0
                    )} kn — ${labelOf.get(sail) ?? `sail ${sail}`}`}
                    style={{ ...CELL_STYLE, background: bandOf.get(sail) ?? UNKNOWN_BAND }}
                  >
                    {sail}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...NOTE_STYLE, marginTop: spacing(2) }}>
        The sail to be carrying at each wind angle and wind speed. Wind speeds in knots across the
        top, wind angles down the side.
      </p>

      <ul data-testid="crossover-chart-legend" style={LEGEND_STYLE}>
        {usage.map((entry, index) => (
          <li
            key={entry.definition.number}
            data-testid="crossover-chart-legend-row"
            data-sail={entry.definition.number}
            style={LEGEND_ROW_STYLE}
          >
            <span aria-hidden="true" style={{ ...SWATCH_STYLE, background: band(index) }}>
              {entry.definition.number}
            </span>
            <span style={LEGEND_LABEL_STYLE}>{entry.definition.label}</span>
            {/* Nought is the answer worth printing: a definition no cell calls for is an
                inventory entry the chart never recommends, which is not the same as an absent
                definition and is not a mistake. */}
            <span data-testid="crossover-chart-legend-cells" style={LEGEND_COUNT_STYLE}>
              {entry.cells === 0
                ? 'never recommended'
                : entry.cells === 1
                  ? '1 cell'
                  : `${entry.cells} cells`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** How many sail bands the stylesheet defines. Beyond it the tints repeat. */
const BANDS = 8

function band(index: number): string {
  return `var(--sail-band-${(index % BANDS) + 1})`
}

/**
 * A cell whose sail no definition defines — which the payload schema refuses, so nothing that
 * reached the database can show it. Drawn rather than hidden all the same: a payload written before
 * a rule tightened must still render, and an unnamed sail is better shown as unnamed than dropped.
 */
const UNKNOWN_BAND = 'var(--surface-divider)'

/**
 * An axis value as the file gave it: `6`, `12.5`. Never padded to a decimal place the file did not
 * use, because an axis is a label and `6.0 kn` of wind is not a thing anybody wrote.
 */
function formatAxis(value: number): string {
  return String(value)
}

const TABLE_STYLE: CSSProperties = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
}

/** 24px of cell and 40px of angle column: thirteen wind speeds land inside 390px. */
const CELL_WIDTH = 24

const HEAD_CELL_STYLE: CSSProperties = {
  width: CELL_WIDTH,
  minWidth: CELL_WIDTH,
  padding: '4px 0',
  textAlign: 'center',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--surface-border)',
  background: 'var(--surface-raised)',
}

const CORNER_STYLE: CSSProperties = {
  ...HEAD_CELL_STYLE,
  width: 40,
  minWidth: 40,
  padding: '4px 4px',
  // Small enough for `°\kn` to sit in the corner without widening the angle column.
  fontSize: '0.5625rem',
}

const ROW_HEAD_STYLE: CSSProperties = {
  width: 40,
  minWidth: 40,
  padding: '0 6px',
  textAlign: 'right',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-muted)',
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
  width: CELL_WIDTH,
  minWidth: CELL_WIDTH,
  // 22px of height: a row a finger can be run along, and 26 of them still fit a phone screen.
  height: 22,
  textAlign: 'center',
  color: 'var(--text-primary)',
  border: '1px solid var(--surface-raised)',
}

const NOTE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
}

const LEGEND_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: `${spacing(3)} 0 0`,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing(2),
}

const LEGEND_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing(2),
}

const SWATCH_STYLE: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-primary)',
  border: '1px solid var(--surface-border)',
  borderRadius: 'var(--radius-sm)',
}

const LEGEND_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
  minWidth: 0,
}

const LEGEND_COUNT_STYLE: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
}

'use client'

import type { CSSProperties, ReactElement } from 'react'
import {
  GRID_BLEED_CLASS,
  GRID_CORNER_STYLE,
  GRID_HEAD_STYLE,
  GRID_ROW_HEAD_STYLE,
  GRID_STICKY_STYLE,
  GRID_TABLE_STYLE,
  SAIL_SELECTION_LAYERS,
  cellSentence,
  isFillerAnchored,
  isGhost,
  type CellView,
  type SailSelectionLayer,
  type SailSelectionLayerSpec,
} from '@/components/analysis/sail-selection-chrome'
import { radius, spacing } from '@/lib/utils/design'
import { cellKey } from '@/services/analysis/sail-selection'
import type { SailRegionLabel, SailRegions } from '@/services/boat/crossoverSailRegions'

interface SailSelectionGridProps {
  /** Row-major, every cell of the chart, with its figures already folded. */
  views: readonly CellView[]
  twa_axis: readonly number[]
  tws_axis: readonly number[]
  layer: SailSelectionLayerSpec
  /** Which definition number is drawn in which band — the chart's own, shared with Boat Setup. */
  bands: ReadonlyMap<number, string>
  /** The chart's sail regions, drawn on a layer that `draws_regions`. */
  regions: SailRegions
  /** The `cellKey` of the cell whose breakdown is open, or null. */
  selected: string | null
  onSelect: (key: string | null) => void
}

/**
 * The boat's **Crossover Chart** as a grid, with one of four quantities laid over it.
 *
 * **One quantity per grid.** Coverage, percent of target and agreement do not fit in a cell 27px
 * wide, so the screen stops trying: the same grid is drawn four times and a cell prints one
 * number. The thumbnails above are the switcher, so comparing coverage against performance is a
 * glance up rather than a decoding exercise (ADR 0030).
 *
 * **The grid takes the full width of its pane**, out through the page's own padding on a phone,
 * with `table-layout: fixed` — so thirteen wind-speed columns divide a 390px phone between them at
 * ~27px each with no sideways scroll, and the angle column stays pinned for anything narrower.
 *
 * **On the Chart layer a sail is named once per region**, not numbered per cell: a name does not
 * fit 27px, and a region of several cells does hold one (`crossoverSailRegions`). The name is
 * printed across the region's label rectangle, every region is outlined so its shape survives the
 * night-vision theme's flattened colours, and a region too small for its name keeps its number.
 *
 * A cell is a `<button>` and a tap **never navigates**: the rows arrived once and the breakdown is
 * a re-render (ADR 0029). Its accessible name is the cell's sentence rather than its glyph, because
 * `≠` read aloud is not an answer to anything.
 */
export default function SailSelectionGrid({
  views,
  twa_axis,
  tws_axis,
  layer,
  bands,
  regions,
  selected,
  onSelect,
}: SailSelectionGridProps): ReactElement {
  return (
    <div
      data-testid="sail-selection-grid"
      data-layer={layer.id}
      className={GRID_BLEED_CLASS}
      style={SCROLL_STYLE}
    >
      <table style={GRID_TABLE_STYLE}>
        <thead>
          <tr>
            <th scope="col" style={{ ...GRID_CORNER_STYLE, ...GRID_STICKY_STYLE }}>
              °\kn
            </th>
            {tws_axis.map((tws) => (
              <th key={tws} scope="col" style={GRID_HEAD_STYLE}>
                {tws}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {twa_axis.map((twa, row) => (
            <tr key={twa} data-testid="sail-selection-row" data-twa={twa}>
              <th scope="row" style={{ ...GRID_ROW_HEAD_STYLE, ...GRID_STICKY_STYLE }}>
                {twa}
              </th>
              {tws_axis.map((tws, column) => {
                // Row-major and complete, which `getSailSelectionData` guarantees and
                // `sail-selection.test.ts` pins — so the cell is at its own index and there is no
                // lookup to miss. A map keyed on the same arithmetic would only be able to fail.
                const view = views[row * tws_axis.length + column]
                const key = cellKey(row, column)
                const ghost = isGhost(view, layer)
                const open = selected === key
                const index = layer.draws_regions ? regions.region[row]?.[column] ?? null : null
                const named: SailRegionLabel | null =
                  index === null ? null : regions.labels[index] ?? null
                const anchor = named !== null && named.row === row && named.column === column
                const edges = layer.draws_regions ? regions.edges[row]?.[column] ?? null : null
                // A named region's cells are identified by the name drawn across the region, so
                // that is what they print: the name, never a blank (ADR 0030).
                const print = named === null ? layer.print(view) : named.label

                return (
                  <td key={tws} style={CELL_WRAP_STYLE}>
                    <button
                      type="button"
                      data-testid="sail-selection-cell"
                      data-cell={key}
                      data-twa={twa}
                      data-tws={tws}
                      data-print={print}
                      data-ghost={ghost ? 'true' : undefined}
                      aria-pressed={open}
                      title={cellSentence(view, layer)}
                      aria-label={cellSentence(view, layer)}
                      onClick={() => onSelect(open ? null : key)}
                      style={{
                        ...CELL_STYLE,
                        // Longhand throughout: mixing `border` with `borderStyle` makes React warn
                        // and the two disagree on re-render, which is how a dotted ghost comes out
                        // solid after a tap (`chrome.ts`).
                        borderStyle: ghost ? 'dotted' : 'solid',
                        borderWidth: open ? 2 : 1,
                        borderColor: open
                          ? 'var(--text-accent)'
                          : ghost
                            ? 'var(--text-muted)'
                            : 'var(--surface-raised)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ ...FILL_STYLE, background: layer.tint(view, bands) }}
                      />
                      {edges !== null && (
                        <span
                          aria-hidden="true"
                          style={{
                            ...EDGE_STYLE,
                            borderTopWidth: edges.top ? 1 : 0,
                            borderRightWidth: edges.right ? 1 : 0,
                            borderBottomWidth: edges.bottom ? 1 : 0,
                            borderLeftWidth: edges.left ? 1 : 0,
                          }}
                        />
                      )}
                      {named !== null && anchor && (
                        <span
                          aria-hidden="true"
                          data-testid="sail-selection-region-name"
                          style={{
                            ...REGION_NAME_STYLE,
                            // Measured from this cell's border edge, so `columns` cells of it is
                            // exactly the rectangle: every cell is the same width and 24px tall.
                            width: `calc(${named.columns} * (100% + 2px))`,
                            height: named.rows * CELL_HEIGHT,
                          }}
                        >
                          {named.label}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        style={{
                          ...PRINT_STYLE,
                          // Italic says Filler-Anchored: a shape, because the night-vision theme
                          // flattens every colour this cell could have used (ADR 0036).
                          fontStyle: isFillerAnchored(view, layer) ? 'italic' : 'normal',
                        }}
                      >
                        {named === null ? print : ''}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The four grids at thumbnail size, which are the switcher.
 *
 * Small multiples: read as shapes, tapped to enlarge. Colour alone here, with no print — a 2px
 * cell has no room for a digit — which is sound because the thumbnail is a *control* and the grid
 * it switches to is where the facts are. Each is labelled in words, and the labels are what a
 * screen reader and a night-vision reader both get.
 */
export function SailSelectionThumbnails({
  views,
  tws_axis,
  layer,
  bands,
  onSelect,
}: {
  views: readonly CellView[]
  tws_axis: readonly number[]
  /** The open layer's id, which is all a thumbnail needs: each draws its own. */
  layer: SailSelectionLayer
  bands: ReadonlyMap<number, string>
  onSelect: (layer: SailSelectionLayer) => void
}): ReactElement {
  return (
    <ul data-testid="sail-selection-layers" style={THUMBS_STYLE}>
      {SAIL_SELECTION_LAYERS.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            data-testid="sail-selection-layer"
            data-layer={entry.id}
            aria-pressed={entry.id === layer}
            onClick={() => onSelect(entry.id)}
            style={{
              ...THUMB_STYLE,
              borderColor: entry.id === layer ? 'var(--text-accent)' : 'var(--surface-border)',
            }}
          >
            <span style={THUMB_LABEL_STYLE}>{entry.name}</span>
            <span
              aria-hidden="true"
              style={{
                ...THUMB_GRID_STYLE,
                gridTemplateColumns: `repeat(${tws_axis.length}, 1fr)`,
              }}
            >
              {views.map((view) => (
                <span
                  key={cellKey(view.cell.row, view.cell.column)}
                  style={{ ...THUMB_CELL_STYLE, background: entry.tint(view, bands) }}
                />
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The grid is the screen's subject, so on a phone it takes the whole width: out through the page's
 * own padding (`GRID_BLEED_CLASS`). `overflowX` keeps a sideways scroll as the fallback below 390px
 * rather than crushing the cells, with the angle column pinned so a cell always has a row to belong
 * to.
 */
const SCROLL_STYLE: CSSProperties = { overflowX: 'auto' }

const CELL_WRAP_STYLE: CSSProperties = { padding: 0 }

/** 24px of height: a row a finger can be run along, and 26 of them still fit a phone screen. */
const CELL_HEIGHT = 24

const CELL_STYLE: CSSProperties = {
  position: 'relative',
  display: 'block',
  width: '100%',
  height: CELL_HEIGHT,
  padding: 0,
  boxSizing: 'border-box',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
}

const FILL_STYLE: CSSProperties = { position: 'absolute', inset: 0 }

/** A region boundary: drawn over the cell's own border, so neighbours' edges meet in one line. */
const EDGE_STYLE: CSSProperties = {
  position: 'absolute',
  inset: -1,
  borderStyle: 'solid',
  borderColor: 'var(--text-secondary)',
  pointerEvents: 'none',
}

/**
 * A region's name, lifted over the cells it spans so the cells after it in the row cannot paint
 * over it, and transparent to taps so each of those cells is still its own button.
 */
const REGION_NAME_STYLE: CSSProperties = {
  position: 'absolute',
  top: -1,
  left: -1,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 2px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  // A button does not wrap its text, and this name is placed on the strength of wrapping.
  whiteSpace: 'normal',
  textAlign: 'center',
  // The grid's own print, the same face and size as every other layer's numbers and glyphs.
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  lineHeight: '12px',
  color: 'var(--text-primary)',
  pointerEvents: 'none',
}

const PRINT_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
}

/** Four across, one row: small enough to compare at a glance, big enough to tap. */
const THUMBS_STYLE: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: spacing(1),
}

const THUMB_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 4,
  borderRadius: radius('sm'),
  borderWidth: 1,
  borderStyle: 'solid',
  background: 'var(--surface-raised)',
  cursor: 'pointer',
}

const THUMB_LABEL_STYLE: CSSProperties = {
  display: 'block',
  marginBottom: 3,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-xs)',
  textAlign: 'center',
  color: 'var(--text-primary)',
}

const THUMB_GRID_STYLE: CSSProperties = { display: 'grid', gap: 0 }

const THUMB_CELL_STYLE: CSSProperties = { display: 'block', height: 2 }

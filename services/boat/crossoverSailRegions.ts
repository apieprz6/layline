/**
 * Where a **Crossover Chart**'s sails sit as shapes, and where each one's name can be printed.
 *
 * A Sail Definition's label is up to twenty characters — "Main + Reaching Spin" — and a Sail
 * Selection cell is 27px wide on a 390px phone, so a name cannot be printed per cell. It can be
 * printed per **region**: the chart is a handful of contiguous blocks of one sail each, and a block
 * spanning several cells has room for its name the way a map has room for a country's.
 *
 * So the chart is cut into regions (cells of one sail number joined edge to edge), each region's
 * name is placed in the rectangle inside it that holds the name best, and a region with no such
 * rectangle — the lone Reaching Spin cell at 80° and 6 kt, a sliver one column wide — keeps its
 * sail number, with the number named in the legend.
 *
 * ## Colour is still not the carrier
 *
 * In night vision the eight sail bands are only two hues, red and amber (ADR 0030, ADR 0043), so
 * a region's cells outside its label rectangle are identified by the region's **edges**: every
 * side a cell shares with a different sail is reported here, and the grid draws it. A region reads
 * as an outlined shape with its name inside, whatever the tokens resolve to.
 *
 * Isomorphic and dependency-free, like `crossoverSailBands` next door.
 */

import type { CrossoverChartPayload } from '@/types'

/** A rectangle of cells: its top-left cell and how far it runs. */
export interface CellRect {
  row: number
  column: number
  rows: number
  columns: number
}

/** One region whose name fits inside it, and the rectangle it is printed across. */
export interface SailRegionLabel extends CellRect {
  sail_number: number
  label: string
}

/** Which sides of a cell border a different sail, or the chart's own edge. */
export interface CellEdges {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

export interface SailRegions {
  /** Row-major, like the chart's cells: the region each cell belongs to, or null for no sail. */
  region: (number | null)[][]
  /** By region index: the label rectangle, or null where the name fits nowhere inside it. */
  labels: (SailRegionLabel | null)[]
  /** Row-major: which of each cell's sides is a region boundary. */
  edges: CellEdges[][]
}

/**
 * Whether a name fits a rectangle of cells, at the phone's cell size.
 *
 * The 390px viewport is the one checked against (AGENTS.md): a wider screen has wider cells, so a
 * name that fits here fits everywhere. 10px JetBrains Mono is six pixels a character, so four
 * characters to a 27px cell is exact with a little to spare; a 24px row holds two 12px lines.
 */
export const CHARS_PER_CELL = 4
export const LINES_PER_ROW = 2

/**
 * How many lines a name wraps to in `columns` cells, or null where a single word is too wide.
 *
 * Greedy, at word boundaries, which is how the browser will wrap it.
 */
export function wrappedLines(label: string, columns: number): number | null {
  const width = columns * CHARS_PER_CELL
  const words = label.split(/\s+/).filter((word) => word !== '')
  if (words.some((word) => word.length > width)) return null

  let lines = 0
  let current = -1
  for (const word of words) {
    if (current === -1 || current + 1 + word.length > width) {
      lines += 1
      current = word.length
    } else {
      current += 1 + word.length
    }
  }

  return lines
}

/**
 * The chart's regions, each one's label rectangle, and every cell's boundary sides.
 *
 * `labelOf` names a sail number, or returns null where no Definition does — a region of an unnamed
 * sail is never labelled, and keeps the number it prints today.
 */
export function crossoverSailRegions(
  payload: Pick<CrossoverChartPayload, 'cells'>,
  labelOf: (sail: number) => string | null
): SailRegions {
  const cells = payload.cells
  const rowCount = cells.length
  const columnCount = Math.max(0, ...cells.map((row) => row.length))
  const at = (row: number, column: number): number | null => cells[row]?.[column] ?? null

  const region: (number | null)[][] = cells.map((row) => row.map(() => null))
  const members: [number, number][][] = []

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const sail = at(row, column)
      if (sail === null || region[row][column] !== null) continue

      // A flood fill, four-way: cells meeting only at a corner are two regions, because a label
      // cannot run through a corner.
      const index = members.length
      const held: [number, number][] = []
      const stack: [number, number][] = [[row, column]]
      region[row][column] = index

      while (stack.length > 0) {
        const [r, c] = stack.pop() as [number, number]
        held.push([r, c])
        for (const [nr, nc] of [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ]) {
          if (at(nr, nc) === sail && region[nr][nc] === null) {
            region[nr][nc] = index
            stack.push([nr, nc])
          }
        }
      }

      members.push(held)
    }
  }

  const inRegion = (index: number, row: number, column: number): boolean =>
    region[row]?.[column] === index

  const labels = members.map((held, index): SailRegionLabel | null => {
    const [firstRow, firstColumn] = held[0]
    const sail = at(firstRow, firstColumn) as number
    const label = labelOf(sail)
    if (label === null) return null

    // Every rectangle inside the region, from every top-left cell: 338 cells, so this is a few
    // thousand rectangles at most. The best is the one the name wraps to fewest lines in — a name
    // on one line reads at a glance — and then the largest, so the name sits in the region's body
    // rather than in a corner of it.
    let best: { rect: CellRect; lines: number } | null = null

    for (const [top, left] of held) {
      let widest = Number.POSITIVE_INFINITY
      for (let bottom = top; inRegion(index, bottom, left); bottom += 1) {
        let width = 0
        while (width < widest && inRegion(index, bottom, left + width)) width += 1
        widest = width

        const rows = bottom - top + 1
        for (let columns = 1; columns <= widest; columns += 1) {
          const lines = wrappedLines(label, columns)
          if (lines === null || lines > rows * LINES_PER_ROW) continue

          const area = rows * columns
          if (
            best === null ||
            lines < best.lines ||
            (lines === best.lines && area > best.rect.rows * best.rect.columns)
          ) {
            best = { rect: { row: top, column: left, rows, columns }, lines }
          }
        }
      }
    }

    return best === null ? null : { ...best.rect, sail_number: sail, label }
  })

  const edges = cells.map((cellRow, row) =>
    cellRow.map((_, column): CellEdges => {
      const own = region[row][column]
      const differs = (r: number, c: number): boolean => (region[r]?.[c] ?? null) !== own

      return {
        top: differs(row - 1, column),
        right: differs(row, column + 1),
        bottom: differs(row + 1, column),
        left: differs(row, column - 1),
      }
    })
  )

  return { region, labels, edges }
}

/**
 * `crossoverSailRegions` with each region named by the chart's own Sail Definitions, which is what
 * the Chart layer draws: the screen and the MCP tool both read regions through this.
 */
export function namedSailRegions(
  payload: Pick<CrossoverChartPayload, 'cells' | 'sail_definitions'>
): SailRegions {
  const labels = new Map(payload.sail_definitions.map((each) => [each.number, each.label]))
  return crossoverSailRegions(payload, (sail) => labels.get(sail) ?? null)
}

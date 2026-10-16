import { describeBoatSetup, ownCrossoverChart } from '@/services/analysis/__tests__/boat-setup'
import { crossoverSailRegions, wrappedLines } from '@/services/boat/crossoverSailRegions'
import type { CrossoverChartPayload } from '@/types'

/**
 * Where the Sail Selection Screen's Chart layer prints each sail's name.
 *
 * A name is placed once per region, inside the rectangle that holds it on the fewest lines, and a
 * region with no such rectangle keeps its number — so the cases worth pinning are the edges of
 * "holds": a word too wide for any width, a region meeting another only at a corner, and the
 * owner's own chart, where every one of the seven regions turned out to have room.
 */

const NAMES = new Map([
  [1, 'Main + Jib 1'],
  [2, 'Main + Jib 2'],
  [6, 'Main + Reaching Spin'],
])
const labelOf = (sail: number): string | null => NAMES.get(sail) ?? null

describe('wrappedLines', () => {
  it('wraps at word boundaries, four characters to a cell', () => {
    expect(wrappedLines('Main + Jib 1', 3)).toBe(1)
    expect(wrappedLines('Main + Jib 1', 2)).toBe(2)
    expect(wrappedLines('Main + Jib 1', 1)).toBe(4)
  })

  it('refuses a width a single word is wider than', () => {
    expect(wrappedLines('Main + Reaching Spin', 1)).toBeNull()
    expect(wrappedLines('Main + Reaching Spin', 2)).toBe(3)
  })
})

describe('crossoverSailRegions', () => {
  const CHART: Pick<CrossoverChartPayload, 'cells'> = {
    cells: [
      [1, 1, 1, 2],
      [1, 1, 1, 6],
      [6, 1, 6, 2],
      [2, 2, 1, 1],
    ],
  }

  it('joins cells of one sail edge to edge, never at a corner', () => {
    const { region } = crossoverSailRegions(CHART, labelOf)

    // The 6 at the bottom meets the 6 at the right only at a corner: two regions, not one.
    expect(region).toEqual([
      [0, 0, 0, 1],
      [0, 0, 0, 2],
      [3, 0, 4, 5],
      [6, 6, 7, 7],
    ])
  })

  it('names a region in the rectangle that holds the name on the fewest lines', () => {
    const { labels } = crossoverSailRegions(CHART, labelOf)

    expect(labels[0]).toEqual({
      row: 0,
      column: 0,
      rows: 2,
      columns: 3,
      sail_number: 1,
      label: 'Main + Jib 1',
    })
    // Two cells wide and one row tall: "Main +" over "Jib 2".
    expect(labels[6]).toMatchObject({ row: 3, column: 0, rows: 1, columns: 2 })
  })

  it('leaves a region its name does not fit unnamed', () => {
    const { labels } = crossoverSailRegions(CHART, labelOf)

    // One cell: "Main + Jib 2" needs four lines and a 24px row holds two.
    expect(labels[1]).toBeNull()
    expect(labels[5]).toBeNull()
    // "Reaching" is eight characters and one cell holds four.
    expect(labels[2]).toBeNull()
    expect(labels[3]).toBeNull()
    expect(labels[4]).toBeNull()
  })

  it('never names a sail no Definition names', () => {
    const { labels } = crossoverSailRegions({ cells: [[9, 9, 9, 9]] }, labelOf)

    expect(labels).toEqual([null])
  })

  it('marks every side a cell shares with another region, and the chart’s own edge', () => {
    const { edges } = crossoverSailRegions(CHART, labelOf)

    expect(edges[0][1]).toEqual({ top: true, right: false, bottom: false, left: false })
    expect(edges[1][2]).toEqual({ top: false, right: true, bottom: true, left: false })
  })
})

describeBoatSetup('the owner’s own chart', () => {
  it('has room for every sail’s name in every region', () => {
    const chart = ownCrossoverChart()
    const names = new Map(chart.sail_definitions.map((each) => [each.number, each.label]))
    const { labels } = crossoverSailRegions(chart, (sail) => names.get(sail) ?? null)

    expect(labels.map((label) => label?.label ?? null)).toEqual([
      'Main + Jib 1',
      'Main + Jib 2',
      'Reef + Jib 2',
      'Reef + Jib 3',
      'Main + Jib 3',
      'Main + Reaching Spin',
      'Main + A2',
    ])
  })
})

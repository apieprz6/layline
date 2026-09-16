import { crossoverDefinitionUsage } from '@/services/boat/crossoverDefinitionUsage'
import type { CrossoverChartPayload } from '@/types'

/**
 * How much of the chart each sail accounts for — the legend's numbers.
 *
 * Derived from the payload every time it is asked for (ADR 0009), so the interesting cases are the
 * ones a stored count would have got wrong: a definition no cell calls for, which is a real state
 * and keeps its row, and the definitions' own order, which is qtVlm's and is not the numbers'.
 */

const CHART: CrossoverChartPayload = {
  twa_axis: [40, 80, 120],
  tws_axis: [8, 12, 16],
  cells: [
    [1, 1, 2],
    [6, 6, 2],
    [8, 8, 6],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 2, label: 'Main + Jib 2' },
    { number: 6, label: 'Main + A3' },
    { number: 8, label: 'Main + A2' },
  ],
}

describe('crossoverDefinitionUsage', () => {
  it('counts the cells each definition is called for by, in the definitions own order', () => {
    const usage = crossoverDefinitionUsage(CHART)

    expect(usage).toEqual([
      { definition: { number: 1, label: 'Main + Jib 1' }, cells: 2 },
      { definition: { number: 2, label: 'Main + Jib 2' }, cells: 2 },
      { definition: { number: 6, label: 'Main + A3' }, cells: 3 },
      { definition: { number: 8, label: 'Main + A2' }, cells: 2 },
    ])
  })

  it('reports zero for a definition no cell references', () => {
    const usage = crossoverDefinitionUsage({
      ...CHART,
      sail_definitions: [
        { number: 1, label: 'Main + Jib 1' },
        { number: 2, label: 'Main + Jib 2' },
        { number: 6, label: 'Main + A3' },
        { number: 7, label: 'Reef + A3' },
        { number: 8, label: 'Main + A2' },
      ],
    })

    expect(usage.find((entry) => entry.definition.number === 7)?.cells).toBe(0)
  })
})

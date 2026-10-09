/**
 * What the boat flew against what the **Crossover Chart** called for, row by row.
 *
 * Two claims carry this suite.
 *
 * **Agreement is an integer comparison, in one vocabulary.** A **Sail Configuration** names a
 * **Sail Definition** *number* of the Version the Race points at, and so does the chart's own cell
 * (ADR 0023) — so this compares numbers, never names, because a match on names would make "Main +
 * A2" and "Main+A2" two different sails.
 *
 * **There are four ways to have no verdict and they are different facts.** A gap in the archive, a
 * sail the chart cannot name, a race with no chart at all, and the edge of the chart's own axes
 * each get their own answer, because the readout says each of them in its own words and a single
 * "no" would flatten a decision the sailor made into a shrug.
 *
 * A *difference* is not a fault, and nothing here treats it as one: the chart says what was
 * suggested, the Configuration says what was up, and the two are compared and never conflated
 * (CONTEXT.md).
 */

import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { compareSailToChart, type FlownSail } from '@/services/analysis/sail-agreement'
import type { CrossoverChartPayload } from '@/types'

/**
 * A chart with two sails and a crossover at 12 knots: Jib 1 below it, Jib 3 above.
 *
 * Its first TWS column is 6 knots, so anything under that is below the chart's own axis — which is
 * the fourth no-verdict case, and a real one: four rows of this archive sit under their chart's
 * first column (ADR 0028).
 */
const CHART: CrossoverChartPayload = {
  twa_axis: [40, 90, 135],
  tws_axis: [6, 12],
  cells: [
    [1, 3],
    [1, 3],
    [1, 3],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 3, label: 'Main + Jib 3' },
  ],
}

const LOOKUP = crossoverLookup(CHART)

/** One Sail Configuration, as the Race holds it: a stamp, a Definition number, resolved words. */
function flown(over: Partial<FlownSail> = {}): FlownSail {
  return { at: '2026-06-20T16:00:00', definition_number: 1, label: 'Main + Jib 1', ...over }
}

/** A row at 16:30, close-hauled in the wind speed given. */
function row(tws: number | null, twa: number | null = 45) {
  return { row_time: '2026-06-20T16:30:00', twa, tws }
}

describe('what the chart says about a row', () => {
  it('agrees where the sail flown is the one the cell names', () => {
    const verdict = compareSailToChart(row(8), { lookup: LOOKUP, entries: [flown()] })

    expect(verdict.agreement).toBe('agrees')
    expect(verdict.flown).toBe('Main + Jib 1')
    expect(verdict.recommended).toBe('Main + Jib 1')
  })

  it('differs where it is not, and says both sides', () => {
    // 14 knots is over the crossover: the chart wants Jib 3 and the boat is carrying Jib 1. That
    // is a decision somebody made on the water, and the overlay's job is to find it, not judge it.
    const verdict = compareSailToChart(row(14), { lookup: LOOKUP, entries: [flown()] })

    expect(verdict.agreement).toBe('differs')
    expect(verdict.flown).toBe('Main + Jib 1')
    expect(verdict.recommended).toBe('Main + Jib 3')
  })

  it('compares numbers rather than names', () => {
    // The same sail, spelled differently in the Testimony than in the chart. A match on names
    // would call this a disagreement; ADR 0023 says the number is the identity.
    const verdict = compareSailToChart(row(8), {
      lookup: LOOKUP,
      entries: [flown({ label: 'main+jib1' })],
    })

    expect(verdict.agreement).toBe('agrees')
  })

  it('reads the Configuration in force, not the first one', () => {
    // A race is a list of changes with no initial value beside it (ADR 0010), so what was up at
    // 16:30 is whatever was last recorded at or before it.
    const entries = [
      flown({ at: '2026-06-20T16:00:00', definition_number: 1, label: 'Main + Jib 1' }),
      flown({ at: '2026-06-20T16:20:00', definition_number: 3, label: 'Main + Jib 3' }),
    ]

    expect(compareSailToChart(row(14), { lookup: LOOKUP, entries }).agreement).toBe('agrees')
    expect(compareSailToChart(row(8), { lookup: LOOKUP, entries }).agreement).toBe('differs')
  })
})

describe('the four ways there is no verdict', () => {
  it('says a race with no Crossover Chart Version has no vocabulary at all', () => {
    // And it can hold no Sail Configurations either, so there is nothing on either side (ADR 0023).
    expect(compareSailToChart(row(8), null).agreement).toBe('no_chart_version')
  })

  it('says nobody wrote down what was flying, only when nobody did', () => {
    // An empty list is legal and ordinary: it means the race is not remembered, not that the boat
    // sailed bare-headed (ADR 0010).
    expect(
      compareSailToChart(row(8), { lookup: LOOKUP, entries: [] }).agreement
    ).toBe('no_sail_recorded')
  })

  it('carries the earliest testimony backwards, which is ADR 0010’s rule and not this module’s', () => {
    // A row *before* the first entry resolves to it: the sails were up before the sailor got round
    // to saying so. This matters here because the alternative — calling it "nobody wrote it down" —
    // would make the first stretch of every annotated race read as unrecorded, and because the rule
    // belongs to `entryInForce`, which the amend flow's charts resolve through too. One rule, two
    // screens.
    const later = flown({ at: '2026-06-20T17:00:00' })

    expect(compareSailToChart(row(8), { lookup: LOOKUP, entries: [later] }).agreement).toBe(
      'agrees'
    )
  })

  it('says what was flying has no name in the chart, and keeps the words anyway', () => {
    // A Configuration may be a note instead of a Definition, because the boat flew something the
    // chart does not name. There is no integer to compare, and the nearest Definition would be
    // Layline deciding what was up.
    const verdict = compareSailToChart(row(8), {
      lookup: LOOKUP,
      entries: [flown({ definition_number: null, label: 'the old delivery main' })],
    })

    expect(verdict.agreement).toBe('sail_unnamed')
    expect(verdict.flown).toBe('the old delivery main')
    expect(verdict.recommended).toBeNull()
  })

  it('says the row sits below the chart’s own axes', () => {
    // A floor lookup with no floor is missing rather than zero (ADR 0028).
    expect(
      compareSailToChart(row(3), { lookup: LOOKUP, entries: [flown()] }).agreement
    ).toBe('no_chart_cell')
  })

  it('stands the floor above the top column, because a threshold is not a ceiling', () => {
    // 40 knots is past the chart's last column, and that column is still the answer: everything
    // has collapsed to the small jib and stays collapsed (ADR 0028).
    expect(
      compareSailToChart(row(40), { lookup: LOOKUP, entries: [flown()] }).agreement
    ).toBe('differs')
  })

  it('says a blank channel is blank rather than a disagreement', () => {
    expect(
      compareSailToChart(row(null), { lookup: LOOKUP, entries: [flown()] }).agreement
    ).toBe('no_reading')
    expect(
      compareSailToChart(row(8, null), { lookup: LOOKUP, entries: [flown()] }).agreement
    ).toBe('no_reading')
  })
})

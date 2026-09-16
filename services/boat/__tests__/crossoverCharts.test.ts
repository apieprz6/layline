/**
 * Which Crossover Chart Version a race was sailed under, and why the answer is never "the newest".
 *
 * ADR 0012's rule, applied to the one pointer ADR 0023 made load-bearing: a Race freezes the Version
 * that was current when it was sailed, so the sails it names keep the words the chart had *then*. The
 * wizard writes that answer at upload; nothing resolves it again at read.
 *
 * The two properties this suite is the record of are both refusals to guess. A recording from before
 * the first chart existed resolves to nothing — a chart cannot be backdated onto a race sailed before
 * it — and a chart minted next winter is not in force over a race sailed last summer.
 */

import { chartInForceOn } from '@/services/boat/crossoverCharts'
import type { CrossoverChartChoice } from '@/types'

const chart = (version_number: number, effective_from: string): CrossoverChartChoice => ({
  version_id: `v${version_number}`,
  version_number,
  effective_from,
  definitions: [{ number: 1, label: 'Main + Jib 1' }],
})

const CHARTS = [chart(2, '2026-06-01'), chart(1, '2026-05-01'), chart(3, '2026-10-01')]

describe('the Crossover Chart Version in force on a day', () => {
  it('is the latest Version that had taken effect by then', () => {
    expect(chartInForceOn(CHARTS, '2026-07-22 18:00:00')?.version_number).toBe(2)
  })

  it('counts a Version effective on the day itself as in force', () => {
    // `effective_from` is the day the sailor says the chart took effect, so a race that day was
    // sailed under it.
    expect(chartInForceOn(CHARTS, '2026-06-01 09:00:00')?.version_number).toBe(2)
  })

  it('is not the newest Version, which is the whole point of freezing a pointer', () => {
    // v3 exists. A June race was not sailed under it, and resolving to it at read would rewrite
    // what that race says its sails were (ADR 0012).
    expect(chartInForceOn(CHARTS, '2026-06-30 19:00:00')?.version_number).toBe(2)
  })

  it('resolves to nothing for a recording from before the first chart', () => {
    // Backdating v1 onto an April race would be Layline asserting a vocabulary the boat did not have
    // yet. The Race records no chart Version instead, and holds no Sail Configurations.
    expect(chartInForceOn(CHARTS, '2026-04-30 19:00:00')).toBeNull()
  })

  it('resolves to nothing when there are no Versions at all', () => {
    expect(chartInForceOn([], '2026-07-22 18:00:00')).toBeNull()
  })

  it('takes the higher Version number when two took effect on one day', () => {
    // Re-entering a chart the same day it was first entered is a correction, and the correction is
    // the later Version.
    const sameDay = [chart(4, '2026-05-01'), chart(1, '2026-05-01')]

    expect(chartInForceOn(sameDay, '2026-05-02 12:00:00')?.version_number).toBe(4)
  })

  it('reads a naive stamp and a bare calendar date the same way', () => {
    expect(chartInForceOn(CHARTS, '2026-07-22')?.version_id).toBe('v2')
    expect(chartInForceOn(CHARTS, '2026-07-22T18:00:00')?.version_id).toBe('v2')
  })

  it('refuses a stamp carrying an offset, rather than resolving one', () => {
    // The recording's clock has no offset (ADR 0008). A `Z` here means somebody converted it, and
    // the day it landed on is no longer the day the boat sailed.
    expect(() => chartInForceOn(CHARTS, '2026-07-22T18:00:00Z')).toThrow(/clock|offset/i)
  })

  it('leaves the given list in the order it was given', () => {
    chartInForceOn(CHARTS, '2026-07-22 18:00:00')
    expect(CHARTS.map((each) => each.version_number)).toEqual([2, 1, 3])
  })
})

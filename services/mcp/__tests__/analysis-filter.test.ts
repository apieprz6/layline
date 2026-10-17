import { filterFromArgument } from '../analysis-filter'
import { VOCABULARY } from '@/components/analysis/__tests__/fixture'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'

const POLAR = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

describe('filterFromArgument', () => {
  it('reads no filter as the whole archive, Not recorded included', () => {
    expect(filterFromArgument(undefined, POLAR)).toEqual({
      ok: true,
      filter: { buckets: {}, range: null },
    })
    expect(filterFromArgument({}, POLAR)).toEqual({
      ok: true,
      filter: { buckets: {}, range: null },
    })
  })

  it('takes buckets by the screen’s own ids, and sails by their Sail Definition label', () => {
    const read = filterFromArgument(
      { pos: ['upwind'], sail: ['Main + Jib 1', 'not-recorded'], sea: [] },
      POLAR
    )

    // An empty list is untouched, exactly as on the screen: no key at all.
    expect(read).toEqual({
      ok: true,
      filter: { buckets: { pos: ['upwind'], sail: ['Main + Jib 1', 'not-recorded'] }, range: null },
    })
  })

  it('takes a day range on the dimension that owns one', () => {
    expect(
      filterFromArgument({ dayRange: { from: '2026-06-01', to: '2026-06-30' } }, POLAR)
    ).toEqual({ ok: true, filter: { buckets: {}, range: { from: '2026-06-01', to: '2026-06-30' } } })
  })

  it('refuses a dimension the tool does not offer, listing the ones it does', () => {
    const read = filterFromArgument({ wind: ['medium'] }, POLAR)

    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.message).toContain('"wind"')
    expect(read.message).toContain('pos, sail, sea, time, when')
  })

  it('refuses a bucket the dimension does not hold, listing the ones it does', () => {
    const read = filterFromArgument({ sail: ['#1'] }, POLAR)

    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.message).toContain('"#1"')
    expect(read.message).toContain(
      'not-recorded, note-only, Main + Jib 1, Main + Jib 2, Reef + Jib 2'
    )
  })

  it('refuses a malformed or back-to-front day range rather than guessing', () => {
    expect(filterFromArgument({ dayRange: { from: '2026-07-01', to: '2026-06-01' } }, POLAR).ok).toBe(false)
    expect(filterFromArgument({ dayRange: { from: 'June', to: '2026-06-30' } }, POLAR).ok).toBe(false)
  })

  it('refuses a day range beside month buckets, which say the same thing two ways', () => {
    const read = filterFromArgument(
      { when: ['2026-06'], dayRange: { from: '2026-06-01', to: '2026-06-30' } },
      POLAR
    )

    expect(read.ok).toBe(false)
  })

  it('refuses a day range on a tool whose dimensions have no continuous one', () => {
    const noWhen = analysisDimensions(['pos', 'sea'], VOCABULARY)

    const read = filterFromArgument({ dayRange: { from: '2026-06-01', to: '2026-06-30' } }, noWhen)

    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.message).toContain('pos, sea')
  })
})

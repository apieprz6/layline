/**
 * The **Analysis Filter**: bucketing a row, matching it, counting the chips, and the URL.
 *
 * Over hand-built rows rather than the owner's archive, because every claim here is about the
 * *rule* — which side of 9 knots a row falls on, what an untouched dimension means, what a stale
 * URL does. The archive's own lopsided counts are what `archive-analysis-filter.test.ts` pins.
 */

import {
  EMPTY_FILTER,
  NOTE_ONLY,
  NOT_RECORDED,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
  bucketCounts,
  bucketOf,
  clearDimension,
  isNarrowed,
  matchedRows,
  matchesFilter,
  recordedRowsState,
  setDayRange,
  setRecordedRows,
  summariseDimension,
  toggleBucket,
} from '@/services/analysis/filter'
import {
  filterFromSearchParams,
  filterToSearchParams,
} from '@/services/analysis/filter-url'
import type { AnalysisDimension, AnalysisFilter, MatchableRow, RowSail } from '@/types'

const VOCABULARY = {
  sails: ['Main + Jib 1', 'Main + Jib 2', 'Reef + Jib 2'],
  months: ['2026-06', '2026-07'],
}

const DIMENSIONS = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, VOCABULARY)

let nextIndex = 0

/** A row with nothing recorded, overridden field by field. */
function row(over: Partial<MatchableRow> = {}): MatchableRow {
  nextIndex += 1
  return {
    race_id: 'race-a',
    row_index: nextIndex,
    day: '2026-06-03',
    day_seconds: 19 * 3600,
    tws: 11,
    twa: 42,
    sea_state: 'calm',
    sail: { recorded: 'definition', label: 'Main + Jib 1' } satisfies RowSail,
    countable: true,
    interval_seconds: 30,
    sog: 6,
    efficiency: {
      row_index: nextIndex,
      target_speed: { knots: 6.5, filler_anchored: false },
      polar_efficiency: 6 / 6.5,
      vmg_zone: 'upwind',
      vmg: 4.4,
      target_vmg: { estimated_knots: 4.8, filler_anchored: false },
      vmg_efficiency: 4.4 / 4.8,
    },
    ...over,
  }
}

const narrowed = (over: Partial<AnalysisFilter['buckets']>): AnalysisFilter => ({
  ...EMPTY_FILTER,
  buckets: over,
})

describe('the dimension registry', () => {
  it('offers all six dimensions on the Polar performance screen, in rail order', () => {
    expect(DIMENSIONS.map((each) => each.id)).toEqual(['wind', 'pos', 'sail', 'sea', 'time', 'when'])
  })

  it('gives every dimension a Not recorded bucket, and marks it as about the record', () => {
    for (const dimension of DIMENSIONS) {
      const bucket = dimension.buckets.find((each) => each.id === NOT_RECORDED)
      expect(bucket).toBeDefined()
      expect(bucket?.about_the_record).toBe(true)
      expect(bucket?.label).toBe('Not recorded')
    }
  })

  it('puts Not recorded first in the two dimensions where it is the largest bucket', () => {
    // ADR 0029: a treatment that buries it as a trailing chip understates the biggest thing in
    // the archive. Sea State and Sail Configuration are the two that are half unannotated.
    for (const id of ['sea', 'sail'] as const) {
      const dimension = DIMENSIONS.find((each) => each.id === id)
      expect(dimension?.buckets[0].id).toBe(NOT_RECORDED)
    }
  })

  it('leaves it last where a row cannot lack a value, so it heads nothing it cannot hold', () => {
    for (const id of ['wind', 'pos', 'time', 'when'] as const) {
      const dimension = DIMENSIONS.find((each) => each.id === id)
      expect(dimension?.buckets.at(-1)?.id).toBe(NOT_RECORDED)
    }
  })

  it('renders every sail the vocabulary defines, plus Note only and Not recorded', () => {
    const sail = DIMENSIONS.find((each) => each.id === 'sail')
    expect(sail?.buckets.map((each) => each.id)).toEqual([
      NOT_RECORDED,
      NOTE_ONLY,
      'Main + Jib 1',
      'Main + Jib 2',
      'Reef + Jib 2',
    ])
    expect(sail?.buckets.length).toBe(5)
  })

  it('derives the when buckets from the archive and offers the Race range below them', () => {
    const when = DIMENSIONS.find((each) => each.id === 'when')
    expect(when?.buckets.map((each) => each.label)).toEqual(['Jun 2026', 'Jul 2026', 'Not recorded'])
    expect(when?.continuous).toBe(true)
  })

  it('uses the four wind bands AGENTS.md already defines, and says their knots', () => {
    const wind = DIMENSIONS.find((each) => each.id === 'wind')
    expect(wind?.buckets.map((each) => each.label)).toEqual([
      'Light (0–8 kt)',
      'Medium (9–15 kt)',
      'Heavy (16–22 kt)',
      'Storm (23+ kt)',
      'Not recorded',
    ])
    expect(wind?.continuous).toBe(false)
  })

  it('leaves out a dimension the screen does not offer', () => {
    const five = analysisDimensions(['wind', 'pos', 'sea', 'time', 'when'], VOCABULARY)
    expect(five.map((each) => each.id)).not.toContain('sail')
  })

  it('says in as many words that Note only is the vocabulary running out, not a defect', () => {
    const noteOnly = DIMENSIONS.find((each) => each.id === 'sail')?.buckets.find(
      (each) => each.id === NOTE_ONLY
    )
    expect(noteOnly?.footnote).toMatch(/Crossover Chart/)
  })

  it('says that time of day is a fixed clock and not sunrise', () => {
    const time = DIMENSIONS.find((each) => each.id === 'time')
    expect(time?.buckets.some((each) => each.footnote?.includes('06:00'))).toBe(true)
  })
})

describe('which bucket a row falls in', () => {
  it('reads the wind bands at 9, 16 and 23 knots, so a fraction cannot fall between two', () => {
    expect(bucketOf(row({ tws: 8.9 }), 'wind')).toBe('light')
    expect(bucketOf(row({ tws: 9 }), 'wind')).toBe('medium')
    expect(bucketOf(row({ tws: 15.9 }), 'wind')).toBe('medium')
    expect(bucketOf(row({ tws: 16 }), 'wind')).toBe('heavy')
    expect(bucketOf(row({ tws: 22.9 }), 'wind')).toBe('heavy')
    expect(bucketOf(row({ tws: 23 }), 'wind')).toBe('storm')
  })

  it('has no wind bucket for a row that recorded no wind', () => {
    expect(bucketOf(row({ tws: null }), 'wind')).toBe(NOT_RECORDED)
  })

  it('cuts point of sail at 70 and 135 degrees, on either tack', () => {
    expect(bucketOf(row({ twa: 70 }), 'pos')).toBe('upwind')
    expect(bucketOf(row({ twa: -70 }), 'pos')).toBe('upwind')
    expect(bucketOf(row({ twa: 70.1 }), 'pos')).toBe('reach')
    expect(bucketOf(row({ twa: -134 }), 'pos')).toBe('reach')
    expect(bucketOf(row({ twa: 135 }), 'pos')).toBe('downwind')
    expect(bucketOf(row({ twa: -180 }), 'pos')).toBe('downwind')
    expect(bucketOf(row({ twa: null }), 'pos')).toBe(NOT_RECORDED)
  })

  it('tells day from night on a fixed clock', () => {
    expect(bucketOf(row({ day_seconds: 6 * 3600 }), 'time')).toBe('day')
    expect(bucketOf(row({ day_seconds: 6 * 3600 - 1 }), 'time')).toBe('night')
    expect(bucketOf(row({ day_seconds: 20 * 3600 - 1 }), 'time')).toBe('day')
    expect(bucketOf(row({ day_seconds: 20 * 3600 }), 'time')).toBe('night')
  })

  it('reads the Sea State the annotation resolved onto the row, or its absence', () => {
    expect(bucketOf(row({ sea_state: 'moderate' }), 'sea')).toBe('moderate')
    expect(bucketOf(row({ sea_state: null }), 'sea')).toBe(NOT_RECORDED)
  })

  it('tells a named sail from a note-only Configuration from no Configuration at all', () => {
    expect(bucketOf(row({ sail: { recorded: 'definition', label: 'Main + A2' } }), 'sail')).toBe(
      'Main + A2'
    )
    expect(bucketOf(row({ sail: { recorded: 'note-only' } }), 'sail')).toBe(NOTE_ONLY)
    expect(bucketOf(row({ sail: { recorded: 'not-recorded' } }), 'sail')).toBe(NOT_RECORDED)
  })

  it('buckets when by the month of the row’s own day', () => {
    expect(bucketOf(row({ day: '2026-09-04' }), 'when')).toBe('2026-09')
  })
})

describe('matching a row', () => {
  const medium = row({ tws: 11 })
  const heavy = row({ tws: 18 })

  it('matches everything while nothing is narrowed', () => {
    expect(matchesFilter(medium, EMPTY_FILTER, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ sea_state: null }), EMPTY_FILTER, DIMENSIONS)).toBe(true)
  })

  it('treats an empty selection as untouched, not as nothing selected', () => {
    expect(matchesFilter(medium, narrowed({ wind: [] }), DIMENSIONS)).toBe(true)
  })

  it('is multi-select within a dimension', () => {
    const filter = narrowed({ wind: ['medium', 'heavy'] })
    expect(matchesFilter(medium, filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(heavy, filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ tws: 4 }), filter, DIMENSIONS)).toBe(false)
  })

  it('narrowing to a real value excludes the unannotated rows, which is what narrowing means', () => {
    const filter = narrowed({ sea: ['calm'] })
    expect(matchesFilter(row({ sea_state: 'calm' }), filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ sea_state: null }), filter, DIMENSIONS)).toBe(false)
  })

  it('can isolate one gap, which is how a sailor audits what is worth annotating', () => {
    const filter = narrowed({ sea: [NOT_RECORDED] })
    expect(matchesFilter(row({ sea_state: null }), filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ sea_state: 'rough' }), filter, DIMENSIONS)).toBe(false)
  })

  it('ands across dimensions', () => {
    const filter = narrowed({ wind: ['medium'], sea: ['rough'] })
    expect(matchesFilter(row({ tws: 11, sea_state: 'rough' }), filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ tws: 11, sea_state: 'calm' }), filter, DIMENSIONS)).toBe(false)
  })

  it('ignores a dimension the screen does not offer, however the URL was narrowed', () => {
    const five = analysisDimensions(['wind', 'pos', 'sea', 'time', 'when'], VOCABULARY)
    const filter = narrowed({ sail: ['Main + Jib 2'] })
    expect(matchesFilter(row({ sail: { recorded: 'note-only' } }), filter, five)).toBe(true)
  })

  it('ignores the dimension it is told to, which is what a chip count is for', () => {
    const filter = narrowed({ wind: ['storm'] })
    expect(matchesFilter(medium, filter, DIMENSIONS, ['wind'])).toBe(true)
  })

  it('narrows to a day range, inclusive at both ends', () => {
    const filter = setDayRange(EMPTY_FILTER, { from: '2026-06-03', to: '2026-06-20' })
    expect(matchesFilter(row({ day: '2026-06-03' }), filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ day: '2026-06-20' }), filter, DIMENSIONS)).toBe(true)
    expect(matchesFilter(row({ day: '2026-06-21' }), filter, DIMENSIONS)).toBe(false)
  })

  it('keeps every row it matched, in the order it was given them', () => {
    const rows = [row({ tws: 4 }), medium, heavy]
    expect(matchedRows(rows, narrowed({ wind: ['medium', 'heavy'] }), DIMENSIONS)).toEqual([
      medium,
      heavy,
    ])
  })
})

describe('narrowing and un-narrowing', () => {
  it('toggles a bucket on and off', () => {
    const on = toggleBucket(EMPTY_FILTER, 'wind', 'medium')
    expect(on.buckets.wind).toEqual(['medium'])
    expect(isNarrowed(on, 'wind')).toBe(true)
    expect(toggleBucket(on, 'wind', 'medium')).toEqual(EMPTY_FILTER)
  })

  it('never mutates the filter it was given', () => {
    const before = narrowed({ wind: ['medium'] })
    toggleBucket(before, 'wind', 'heavy')
    expect(before.buckets.wind).toEqual(['medium'])
  })

  it('abandons a day range when a month is picked, because they say one thing twice', () => {
    const ranged = setDayRange(EMPTY_FILTER, { from: '2026-06-03', to: '2026-06-20' })
    expect(toggleBucket(ranged, 'when', '2026-07').range).toBeNull()
  })

  it('abandons the month chips when a range is set', () => {
    const months = narrowed({ when: ['2026-06'] })
    expect(isNarrowed(setDayRange(months, { from: '2026-07-01', to: '2026-07-31' }), 'when')).toBe(
      true
    )
    expect(setDayRange(months, { from: '2026-07-01', to: '2026-07-31' }).buckets.when).toBeUndefined()
  })

  it('clears a dimension back to untouched, range and all', () => {
    const ranged = setDayRange(narrowed({ wind: ['storm'] }), {
      from: '2026-06-03',
      to: '2026-06-20',
    })
    const cleared = clearDimension(ranged, 'when')
    expect(cleared.range).toBeNull()
    expect(isNarrowed(cleared, 'when')).toBe(false)
    expect(cleared.buckets.wind).toEqual(['storm'])
  })
})

describe('what a chip says it is narrowed to', () => {
  const spec = (id: AnalysisDimension) =>
    DIMENSIONS.find((each) => each.id === id) ?? DIMENSIONS[0]

  it('says Any while the dimension is untouched', () => {
    expect(summariseDimension(EMPTY_FILTER, spec('wind'))).toBe('Any')
  })

  it('names one or two buckets and counts more', () => {
    expect(summariseDimension(narrowed({ wind: ['medium'] }), spec('wind'))).toBe('Medium (9–15 kt)')
    expect(summariseDimension(narrowed({ sea: ['calm', 'slight'] }), spec('sea'))).toBe(
      'Calm (0–1 ft), Slight (1–2 ft)'
    )
    expect(
      summariseDimension(narrowed({ sea: ['calm', 'slight', 'moderate'] }), spec('sea'))
    ).toBe('3 of 5')
  })

  it('says the range in the sailor’s own words rather than in ISO', () => {
    const ranged = setDayRange(EMPTY_FILTER, { from: '2026-06-03', to: '2026-09-04' })
    expect(summariseDimension(ranged, spec('when'))).toBe('Jun 3 → Sep 4')
  })
})

describe('what each chip would do: the per-bucket counts', () => {
  const rows = [
    row({ race_id: 'a', tws: 4, sea_state: 'calm' }),
    row({ race_id: 'a', tws: 11, sea_state: 'calm' }),
    row({ race_id: 'b', tws: 11, sea_state: null }),
    row({ race_id: 'b', tws: 18, sea_state: 'rough' }),
  ]

  it('counts rows and the races they came from, per bucket', () => {
    const counts = bucketCounts(rows, EMPTY_FILTER, DIMENSIONS, 'wind')
    expect(counts.get('medium')).toBe(2)
    expect(counts.get('light')).toBe(1)
    expect(counts.get('storm')).toBe(0)
  })

  it('counts the Not recorded bucket like any other, so the ledger and the chip agree', () => {
    expect(bucketCounts(rows, EMPTY_FILTER, DIMENSIONS, 'sea').get(NOT_RECORDED)).toBe(1)
  })

  it('applies every other dimension but not its own, so the number predicts the tap', () => {
    // Narrowed to Calm: Medium holds one row, not two. And the wind chips must not read their own
    // narrowing back to themselves, or every unselected band would say zero.
    const counts = bucketCounts(rows, narrowed({ sea: ['calm'], wind: ['light'] }), DIMENSIONS, 'wind')
    expect(counts.get('medium')).toBe(1)
    expect(counts.get('light')).toBe(1)
  })

  it('has an entry for every bucket in the vocabulary, including ones the boat never raced', () => {
    const counts = bucketCounts(rows, EMPTY_FILTER, DIMENSIONS, 'sail')
    expect([...counts.keys()].sort()).toEqual(
      [NOT_RECORDED, NOTE_ONLY, 'Main + Jib 1', 'Main + Jib 2', 'Reef + Jib 2'].sort()
    )
    expect(counts.get('Reef + Jib 2')).toBe(0)
  })
})

describe('the ledger’s one switch, read from the buckets rather than held beside them', () => {
  it('reads included while nothing is narrowed', () => {
    expect(recordedRowsState(EMPTY_FILTER, DIMENSIONS)).toBe('included')
  })

  it('excludes the record buckets across every dimension at once', () => {
    const excluded = setRecordedRows(EMPTY_FILTER, DIMENSIONS, false)
    expect(recordedRowsState(excluded, DIMENSIONS)).toBe('excluded')
    expect(matchesFilter(row({ sea_state: null }), excluded, DIMENSIONS)).toBe(false)
    expect(matchesFilter(row({ sail: { recorded: 'note-only' } }), excluded, DIMENSIONS)).toBe(false)
    expect(matchesFilter(row(), excluded, DIMENSIONS)).toBe(true)
  })

  it('keeps a narrowing the sailor already made when it excludes', () => {
    const excluded = setRecordedRows(narrowed({ sea: ['calm', NOT_RECORDED] }), DIMENSIONS, false)
    expect(excluded.buckets.sea).toEqual(['calm'])
  })

  it('reads mixed when one dimension still admits its record bucket', () => {
    const half = setRecordedRows(EMPTY_FILTER, DIMENSIONS, false)
    const back = toggleBucket(half, 'sea', NOT_RECORDED)
    expect(recordedRowsState(back, DIMENSIONS)).toBe('mixed')
  })

  it('switching back on returns an untouched dimension to untouched, not to every chip lit', () => {
    const roundTrip = setRecordedRows(setRecordedRows(EMPTY_FILTER, DIMENSIONS, false), DIMENSIONS, true)
    expect(roundTrip).toEqual(EMPTY_FILTER)
  })

  it('leaves out the dimensions a row cannot lack a value for', () => {
    // Every row has a timestamp, so enumerating `time` and `when`'s real values would light every
    // chip on two dimensions and write every one into the URL to exclude nothing.
    const excluded = setRecordedRows(EMPTY_FILTER, DIMENSIONS, false)
    expect(excluded.buckets.time).toBeUndefined()
    expect(excluded.buckets.when).toBeUndefined()
    expect(excluded.buckets.sea).toEqual(['calm', 'slight', 'moderate', 'rough'])
  })

  it('switching back on re-admits the record buckets beside a real narrowing', () => {
    const narrowedThenExcluded = setRecordedRows(narrowed({ sea: ['calm'] }), DIMENSIONS, false)
    const readmitted = setRecordedRows(narrowedThenExcluded, DIMENSIONS, true)
    expect(readmitted.buckets.sea).toEqual(['calm', NOT_RECORDED])
  })
})

describe('the URL a narrowed view is still a link to', () => {
  it('writes nothing while nothing is narrowed', () => {
    expect(filterToSearchParams(EMPTY_FILTER, DIMENSIONS).toString()).toBe('')
  })

  it('round-trips a multi-select narrowing, sail labels and all', () => {
    const filter: AnalysisFilter = {
      buckets: { wind: ['medium', 'heavy'], sail: ['Main + Jib 1'], sea: [NOT_RECORDED] },
      range: null,
    }
    const params = filterToSearchParams(filter, DIMENSIONS)
    expect(params.getAll('wind')).toEqual(['medium', 'heavy'])

    const back = filterFromSearchParams(paramsRecord(params), DIMENSIONS)
    expect(back.buckets.wind).toEqual(['medium', 'heavy'])
    expect(back.buckets.sail).toEqual(['Main + Jib 1'])
    expect(back.buckets.sea).toEqual([NOT_RECORDED])
  })

  it('round-trips a day range', () => {
    const ranged = setDayRange(EMPTY_FILTER, { from: '2026-06-03', to: '2026-09-04' })
    const back = filterFromSearchParams(paramsRecord(filterToSearchParams(ranged, DIMENSIONS)), DIMENSIONS)
    expect(back.range).toEqual({ from: '2026-06-03', to: '2026-09-04' })
  })

  it('drops a bucket id it does not recognise rather than narrowing to nothing', () => {
    const back = filterFromSearchParams({ wind: ['medium', 'hurricane'] }, DIMENSIONS)
    expect(back.buckets.wind).toEqual(['medium'])
  })

  it('drops a dimension the screen does not offer', () => {
    const five = analysisDimensions(['wind', 'pos', 'sea', 'time', 'when'], VOCABULARY)
    expect(filterFromSearchParams({ sail: ['Main + Jib 1'] }, five).buckets.sail).toBeUndefined()
  })

  it('reads a single value as well as a repeated one, since one param is a bare string', () => {
    expect(filterFromSearchParams({ wind: 'heavy' }, DIMENSIONS).buckets.wind).toEqual(['heavy'])
  })

  it('refuses a half-written or malformed range rather than guessing the other end', () => {
    expect(filterFromSearchParams({ from: '2026-06-03' }, DIMENSIONS).range).toBeNull()
    expect(
      filterFromSearchParams({ from: 'yesterday', to: '2026-09-04' }, DIMENSIONS).range
    ).toBeNull()
    expect(
      filterFromSearchParams({ from: '2026-09-04', to: '2026-06-03' }, DIMENSIONS).range
    ).toBeNull()
  })
})

describe('what must hold over any row set, not just a hand-picked one', () => {
  /** Rows spread across every corner the bucketing has a rule for, absences included. */
  const spread: MatchableRow[] = [
    row(),
    row({ tws: null }),
    row({ tws: 0 }),
    row({ tws: 8.9 }),
    row({ tws: 40 }),
    row({ twa: null }),
    row({ twa: 0 }),
    row({ twa: -180 }),
    row({ sea_state: null }),
    row({ sea_state: 'rough' }),
    row({ sail: { recorded: 'not-recorded' } }),
    row({ sail: { recorded: 'note-only' } }),
    row({ sail: { recorded: 'definition', label: 'Main + Jib 2' } }),
    row({ day: '2026-07-22', day_seconds: 0, race_id: 'b' }),
    row({ day: '2026-07-22', day_seconds: 23 * 3600 + 3599, race_id: 'b' }),
  ]

  it('puts every row in exactly one bucket of every dimension, with none left over', () => {
    for (const dimension of DIMENSIONS) {
      const counts = bucketCounts(spread, EMPTY_FILTER, DIMENSIONS, dimension.id)
      const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
      // Every row accounted for means no row can be silently dropped by a narrowing it did not
      // fail — which is the one thing an absence-handling filter has to get right.
      expect(total).toBe(spread.length)
    }
  })

  it('never answers with a bucket the vocabulary does not hold', () => {
    for (const dimension of DIMENSIONS) {
      const known = dimension.buckets.map((bucket) => bucket.id)
      for (const each of spread) expect(known).toContain(bucketOf(each, dimension.id))
    }
  })

  it('selecting every bucket of a dimension matches the same rows as touching nothing', () => {
    for (const dimension of DIMENSIONS) {
      const all = { buckets: { [dimension.id]: dimension.buckets.map((b) => b.id) }, range: null }
      expect(matchedRows(spread, all, DIMENSIONS)).toEqual(matchedRows(spread, EMPTY_FILTER, DIMENSIONS))
    }
  })

  it('survives a round trip through the URL whatever is selected', () => {
    for (const dimension of DIMENSIONS) {
      for (const bucket of dimension.buckets) {
        const filter = toggleBucket(EMPTY_FILTER, dimension.id, bucket.id)
        const back = filterFromSearchParams(
          paramsRecord(filterToSearchParams(filter, DIMENSIONS)),
          DIMENSIONS
        )
        expect(back).toEqual(filter)
      }
    }
  })
})

/** `URLSearchParams` as Next hands a page its `searchParams`: one key, one value or many. */
function paramsRecord(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    out[key] = values.length === 1 ? values[0] : values
  }
  return out
}

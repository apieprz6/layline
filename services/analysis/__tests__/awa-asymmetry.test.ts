/**
 * Apparent Wind Asymmetry and Tack Pairs, as rules rather than as measurements.
 *
 * The archive's own figures are pinned in `archive-instrument-tuning.test.ts`, which needs the
 * owner's recordings; these are the rules those figures come from. The rule with the most riding on
 * it is the last `describe`: there is no figure here spanning upwind and downwind, and nothing
 * returned may be read as a **Measured Offset**.
 */

import {
  ASYMMETRY_CAVEAT,
  DOWNWIND_MIN_AWA_DEG,
  MAX_PAIR_GAP_SECONDS,
  MIN_SEGMENT_ROWS,
  UPWIND_MAX_AWA_DEG,
  awaAsymmetryByEra,
  eraAwaAsymmetry,
  findTackPairs,
  findTackSegments,
  raceAwaAsymmetry,
} from '@/services/analysis/awa-asymmetry'
import { calibrationEras } from '@/services/analysis/calibration-eras'
import type { AsymmetryReadableRow } from '@/services/analysis/awa-asymmetry'
import type { CalibrationEra, RaceAwaAsymmetry, RaceAwaAsymmetryResult } from '@/types'

const ERA: CalibrationEra = calibrationEras([], 'HDG')[0]

/** The 30-second cadence ten of the archive's eleven measured files were logged at. */
function at(index: number): string {
  const seconds = index * 30
  const clock = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  return `2026-06-03 ${clock.map((part) => String(part).padStart(2, '0')).join(':')}`
}

let nextRow = 0

/** `count` readable rows holding one signed apparent wind angle, from `fromIndex`. */
function holding(
  awaSigned: number,
  count: number,
  fromIndex: number,
  over: Partial<AsymmetryReadableRow> = {}
): AsymmetryReadableRow[] {
  return Array.from({ length: count }, (_, offset) => {
    nextRow += 1
    return {
      row_index: nextRow,
      row_time: at(fromIndex + offset),
      countable: true,
      quality: { not_water_referenced: false },
      // Stored unsigned, 0..360, the way the recording writes it.
      awa_calc: (awaSigned < 0 ? awaSigned + 360 : awaSigned).toFixed(1),
      sog: '6.0',
      ...over,
    }
  })
}

function race(rows: AsymmetryReadableRow[], over: { race_id?: string; window_start?: string } = {}) {
  return { race_id: 'race-1', window_start: '2026-06-03 19:00:00', rows, ...over }
}

/** The figure, or a thrown test failure — the refusals have their own assertions below. */
function measured(rows: AsymmetryReadableRow[], over = {}): RaceAwaAsymmetry {
  const result = raceAwaAsymmetry(race(rows, over))
  if (!result.ok) throw new Error(`expected a figure, got ${result.reason}`)
  return result.asymmetry
}

/** A starboard beat at 36° and a port beat at 46° — port holding ten degrees wider. */
function leaningPort(fromIndex = 0): AsymmetryReadableRow[] {
  return [...holding(36, 3, fromIndex), ...holding(-46, 3, fromIndex + 3)]
}

describe('finding a steady segment', () => {
  it('is three consecutive readable rows on one tack at one point of sail', () => {
    const segments = findTackSegments(holding(40, MIN_SEGMENT_ROWS, 0))

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      tack: 'starboard',
      point_of_sail: 'upwind',
      held_angle_deg: 40,
    })
    expect(segments[0].row_indexes).toHaveLength(3)
  })

  it('and never two', () => {
    expect(findTackSegments(holding(40, MIN_SEGMENT_ROWS - 1, 0))).toHaveLength(0)
  })

  it('breaks where the tack changes and where the point of sail does', () => {
    const rows = [...holding(40, 3, 0), ...holding(-45, 3, 3), ...holding(-150, 3, 6)]
    const segments = findTackSegments(rows)

    expect(segments.map((segment) => [segment.tack, segment.point_of_sail])).toEqual([
      ['starboard', 'upwind'],
      ['port', 'upwind'],
      ['port', 'downwind'],
    ])
  })

  it('reads a reaching run and then discards it, so a beat either side of one is two segments', () => {
    const rows = [...holding(40, 3, 0), ...holding(80, 4, 3), ...holding(42, 3, 7)]
    const segments = findTackSegments(rows)

    // Both segments are starboard upwind; without the reach between them this would be one.
    expect(segments).toHaveLength(2)
    expect(segments.every((segment) => segment.point_of_sail === 'upwind')).toBe(true)
  })

  it('puts both boundary angles in reaching, which is never paired', () => {
    // Strict inequalities, exactly as the prior art has them: 50° and 110° are reaching, and the
    // band between them is where a held angle says least about where the wind is.
    expect(findTackSegments(holding(UPWIND_MAX_AWA_DEG, 3, 0))).toHaveLength(0)
    expect(findTackSegments(holding(DOWNWIND_MIN_AWA_DEG, 3, 0))).toHaveLength(0)
    expect(findTackSegments(holding(UPWIND_MAX_AWA_DEG - 1, 3, 0))).toHaveLength(1)
    expect(findTackSegments(holding(DOWNWIND_MIN_AWA_DEG + 1, 3, 0))).toHaveLength(1)
  })

  it('counts rows it may read, so a tack’s own excluded rows do not split a beat', () => {
    const rows = [
      ...holding(40, 3, 0),
      ...holding(40, 2, 3, { countable: false }),
      ...holding(42, 3, 5),
    ]

    // One segment, not two: consecutive among the readable rows, as the prior art groups them. The
    // pairing step's own gap test is what refuses a pair spanning a dead feed.
    expect(findTackSegments(rows)).toHaveLength(1)
  })

  it('reads no row that is not Countable, nor one below the speed gate', () => {
    expect(findTackSegments(holding(40, 3, 0, { countable: false }))).toHaveLength(0)
    expect(findTackSegments(holding(40, 3, 0, { sog: '3.4' }))).toHaveLength(0)
    expect(findTackSegments(holding(40, 3, 0, { sog: null }))).toHaveLength(0)
  })

  it('reads no Not Water-Referenced row, whose apparent wind was computed from GPS', () => {
    // A gate Countable deliberately does not apply and this check must: where `STW` is blank qtVlm
    // substituted something for it, so the only column this check reads is built on a value
    // nothing recorded.
    const rows = holding(40, 3, 0, { quality: { not_water_referenced: true } })

    expect(findTackSegments(rows)).toHaveLength(0)
  })

  it('holds the mean of its own rows’ angles, signed', () => {
    const segments = findTackSegments([...holding(-40, 1, 0), ...holding(-44, 2, 1)])

    expect(segments[0].held_angle_deg).toBeCloseTo(-42.667, 3)
    expect(segments[0].tack).toBe('port')
  })
})

describe('pairing two tacks', () => {
  it('is half the difference between the angles the two tacks held', () => {
    const pairs = findTackPairs(findTackSegments(leaningPort()))

    // Starboard held 36°, port held 46°: the asymmetry is −5°, and port reads 10° wider. The
    // vendor procedure's own arithmetic, in the signed convention.
    expect(pairs).toHaveLength(1)
    expect(pairs[0].asymmetry_deg).toBeCloseTo(-5, 10)
    expect(pairs[0].starboard.held_angle_deg).toBeCloseTo(36, 10)
    expect(pairs[0].port.held_angle_deg).toBeCloseTo(-46, 10)
    expect(pairs[0].point_of_sail).toBe('upwind')
  })

  it('refuses two segments at different points of sail', () => {
    const rows = [...holding(36, 3, 0), ...holding(-150, 3, 3)]

    // A starboard beat against a port run is not a comparison of anything: an asymmetry is only
    // read between two tacks at a matched point of sail.
    expect(findTackPairs(findTackSegments(rows))).toHaveLength(0)
  })

  it('refuses two segments on the same tack', () => {
    const rows = [...holding(36, 3, 0), ...holding(80, 3, 3), ...holding(38, 3, 6)]

    expect(findTackPairs(findTackSegments(rows))).toHaveLength(0)
  })

  it('refuses a partner more than five minutes later, and stops looking there', () => {
    const justInside = [...holding(36, 3, 0), ...holding(-46, 3, 12)]
    const justOutside = [...holding(36, 3, 0), ...holding(-46, 3, 13)]

    // The second segment starts 300s and then 330s after the first one ends — the gap is measured
    // between the segments, from the first's last row to the second's first. A gap that long is a
    // different beat in different wind, and the prior art stops rather than skips on — which is
    // also what keeps a pair from spanning a dead feed.
    expect(findTackPairs(findTackSegments(justInside))[0].gap_seconds).toBe(MAX_PAIR_GAP_SECONDS)
    expect(findTackPairs(findTackSegments(justOutside))).toHaveLength(0)
  })

  it('uses each segment once, taking the first partner that fits', () => {
    const rows = [...holding(36, 3, 0), ...holding(-46, 3, 3), ...holding(80, 3, 6), ...holding(-48, 3, 9)]
    const pairs = findTackPairs(findTackSegments(rows))

    expect(pairs).toHaveLength(1)
    expect(pairs[0].port.held_angle_deg).toBeCloseTo(-46, 10)
  })

  it('pairs each point of sail on its own, down the Race', () => {
    const rows = [
      ...leaningPort(0),
      ...holding(-150, 3, 6),
      ...holding(160, 3, 9),
      ...leaningPort(12),
    ]
    const pairs = findTackPairs(findTackSegments(rows))

    expect(pairs.map((pair) => pair.point_of_sail)).toEqual(['upwind', 'downwind', 'upwind'])
  })
})

describe('one Race’s Apparent Wind Asymmetry', () => {
  it('states which tack reads wider, and by twice the asymmetry', () => {
    const asymmetry = measured(leaningPort())

    expect(asymmetry.upwind).toMatchObject({
      point_of_sail: 'upwind',
      wider_tack: 'port',
      pair_count: 1,
    })
    expect(asymmetry.upwind?.asymmetry_deg).toBeCloseTo(-5, 10)
    // Twice, because the asymmetry is half the difference: printing the 5 as the gap between the
    // tacks would halve the finding.
    expect(asymmetry.upwind?.wider_by_deg).toBeCloseTo(10, 10)
  })

  it('carries the angle each tack actually held, which is what the Tack Dial draws', () => {
    const asymmetry = measured(leaningPort())

    // The dial is a picture of how wide each tack sailed, so it needs the two angles and not only
    // the gap between them. Reconstructing them from the Asymmetry would mean inventing a centre
    // angle the boat never held — the figure would be right and the drawing a fabrication.
    expect(asymmetry.upwind?.held_deg).toEqual({ starboard: 36, port: 46 })
  })

  it('keeps the held angles and the Asymmetry one arithmetic', () => {
    const upwind = measured(leaningPort()).upwind

    // Half the difference, positive where starboard reads wider — the same identity the pair-level
    // figure has, so a dial drawn from the angles can never disagree with the number beside it.
    expect((upwind!.held_deg.starboard - upwind!.held_deg.port) / 2).toBeCloseTo(
      upwind!.asymmetry_deg,
      10
    )
  })

  it('carries the caveat that says why it is not a Measured Offset', () => {
    const asymmetry = measured(leaningPort())

    expect(asymmetry.caveat).toBe(ASYMMETRY_CAVEAT)
    expect(asymmetry.upwind?.caveat).toBe(ASYMMETRY_CAVEAT)
    expect(ASYMMETRY_CAVEAT).toContain('not a Measured Offset')
  })

  it('leaves the point of sail it never paired null, and not zero', () => {
    const asymmetry = measured(leaningPort())

    // A Race that only beat has no downwind figure. Zero would read as a measured symmetry.
    expect(asymmetry.downwind).toBe(null)
  })

  it('refuses a Race with too few readable rows to hold two segments', () => {
    const result = raceAwaAsymmetry(race(holding(40, MIN_SEGMENT_ROWS * 2 - 1, 0)))

    expect(result).toMatchObject({ ok: false, reason: 'too-few-rows', row_count: 5 })
  })

  it('refuses a Race whose rows never held a steady angle long enough', () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      holding(index % 2 === 0 ? 36 : -46, 1, index)
    ).flat()

    expect(raceAwaAsymmetry(race(rows))).toMatchObject({
      ok: false,
      reason: 'too-few-segments',
      segment_count: 0,
    })
  })

  it('refuses a Race whose segments never paired', () => {
    const rows = [
      ...holding(36, 3, 0),
      ...holding(80, 3, 3),
      ...holding(38, 3, 6),
      ...holding(80, 3, 9),
      ...holding(40, 3, 12),
    ]

    // Three steady starboard beats either side of two reaches, and never a port one to compare.
    expect(raceAwaAsymmetry(race(rows))).toMatchObject({
      ok: false,
      reason: 'no-pairs',
      segment_count: 3,
    })
  })
})

describe('an Era’s Asymmetry', () => {
  const asym = (rows: AsymmetryReadableRow[], race_id: string, window_start: string) =>
    raceAwaAsymmetry(race(rows, { race_id, window_start }))

  /** `count` upwind Tack Pairs, each a starboard beat at 36° against a port one at `portAngle`. */
  function sides(portAngle: number, count: number, fromIndex: number): AsymmetryReadableRow[] {
    return Array.from({ length: count }, (_, pair) => [
      ...holding(36, 3, fromIndex + pair * 6),
      ...holding(portAngle, 3, fromIndex + pair * 6 + 3),
    ]).flat()
  }

  it('averages each Race’s own figure, and never pools their pairs', () => {
    // Four pairs at −5° in one Race, one pair at −15° in another: every Race equal gives −10,
    // where pooling five pairs would give −7. A long Race buys no extra influence.
    const many = asym(sides(-46, 4, 0), 'distance-race', '2026-06-01 09:00:00')
    const one = asym([...holding(15, 3, 0), ...holding(-45, 3, 3)], 'beer-can', '2026-06-10 19:00:00')
    const era = eraAwaAsymmetry(ERA, [many, one])

    expect(era.upwind?.asymmetry_deg).toBeCloseTo(-10, 10)
    expect(era.upwind?.pair_count).toBe(5)
    expect(era.upwind?.race_count).toBe(2)
    expect(era.upwind?.race_figures.map((figure) => figure.race_id)).toEqual([
      'distance-race',
      'beer-can',
    ])
  })

  it('weights the held angles the dial draws the same way it weights the figure', () => {
    // Starboard held 36° in the four-pair Race and 15° in the one-pair Race: every Race equal
    // gives 25.5°, where pooling five pairs would give 31.8° and put the ray somewhere the boat
    // spent one beat. The two rays must move with the number between them.
    const many = asym(sides(-46, 4, 0), 'distance-race', '2026-06-01 09:00:00')
    const one = asym([...holding(15, 3, 0), ...holding(-45, 3, 3)], 'beer-can', '2026-06-10 19:00:00')
    const era = eraAwaAsymmetry(ERA, [many, one])

    expect(era.upwind?.held_deg).toEqual({ starboard: 25.5, port: 45.5 })
    expect((era.upwind!.held_deg.starboard - era.upwind!.held_deg.port) / 2).toBeCloseTo(
      era.upwind!.asymmetry_deg,
      10
    )
  })

  it('keeps upwind and downwind apart, and offers no figure across the two', () => {
    const rows = [
      ...holding(36, 3, 0),
      ...holding(-46, 3, 3),
      ...holding(-150, 3, 6),
      ...holding(160, 3, 9),
    ]
    const era = eraAwaAsymmetry(ERA, [asym(rows, 'r1', '2026-06-01 19:00:00')])

    // Port 10° wider upwind, starboard 10° wider downwind — leaning opposite ways, which is the
    // case a mean of the two would report as a symmetric instrument.
    expect(era.upwind?.wider_tack).toBe('port')
    expect(era.downwind?.wider_tack).toBe('starboard')
    expect(era.upwind?.asymmetry_deg).toBeCloseTo(-5, 10)
    expect(era.downwind?.asymmetry_deg).toBeCloseTo(5, 10)

    // The rule, as a shape: nothing returned spans the two points of sail, so no renderer can read
    // one off this without writing the average itself (ADR 0035).
    expect(Object.keys(era).sort()).toEqual([
      'caveat',
      'downwind',
      'era',
      'excluded',
      'race_count',
      'races',
      'upwind',
    ])
  })

  it('carries a Race that produced nothing as an exclusion, never as a zero', () => {
    const era = eraAwaAsymmetry(ERA, [
      asym(leaningPort(), 'measured', '2026-06-01 19:00:00'),
      asym(
        [...holding(36, 3, 0), ...holding(80, 3, 3), ...holding(38, 3, 6)],
        'unpaired',
        '2026-06-08 19:00:00'
      ),
    ])

    expect(era.races.map((r) => r.race_id)).toEqual(['measured'])
    expect(era.excluded).toMatchObject([{ race_id: 'unpaired', reason: 'no-pairs' }])
    expect(era.upwind?.asymmetry_deg).toBeCloseTo(-5, 10)
    expect(era.upwind?.race_count).toBe(1)
  })

  it('never averages across a Calibration Era boundary', () => {
    const eras = calibrationEras(
      [
        {
          entry: 'event',
          date: '2026-07-04',
          event: {
            id: 'event-1',
            artifact_id: 'artifact-1',
            kind: 'instrument_calibration',
            occurred_on: '2026-07-04',
            type: 'autocompensation',
            channels: ['HDG'],
            note: 'swung the compass',
            created_by: 'admin-1',
            created_at: '2026-07-05T02:00:00Z',
            updated_at: '2026-07-05T02:00:00Z',
          },
        },
      ],
      'HDG'
    )
    const results: RaceAwaAsymmetryResult[] = [
      asym(leaningPort(), 'june', '2026-06-03 19:00:00'),
      asym([...holding(26, 3, 0), ...holding(-46, 3, 3)], 'july', '2026-07-22 19:00:00'),
    ]

    const byEra = awaAsymmetryByEra(eras, results)

    expect(byEra).toHaveLength(2)
    expect(byEra[0].upwind?.asymmetry_deg).toBeCloseTo(-5, 10)
    expect(byEra[1].upwind?.asymmetry_deg).toBeCloseTo(-10, 10)
    expect(byEra[1].era.from_date).toBe('2026-07-04')
  })
})

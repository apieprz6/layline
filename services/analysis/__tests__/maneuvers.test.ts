/**
 * Maneuvers and the Countable test, as rules rather than as measurements.
 *
 * The archive's own figures are pinned in `archive-maneuvers.test.ts`, which needs the owner's
 * recordings; these are the rules those figures come from, written over the parser's output so a
 * rule that disagrees with a real file fails here.
 */

import { analysisRows, isCountable, notCountableReason } from '@/services/analysis/countable'
import {
  MANEUVER_DETECTOR_VERSION,
  MANEUVER_WINDOW_AFTER,
  MANEUVER_WINDOW_BEFORE,
  ZONE_BOUNDARY_DEG,
  classifyFlip,
  detectManeuvers,
} from '@/services/analysis/maneuvers'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { AnalysisRow, Maneuver, TranscriptionManeuvers, TranscriptionQuality } from '@/types'

const HEADER = 'Date;Longitude;Latitude;COG;SOG;TWA;STW;CTW'

interface Row {
  /** Rows sharing a fix repeat each other's position, course and speed verbatim. */
  fix: number
  twa: string
  sog?: string
  stw?: string
}

/** A row at a fresh fix, sailing at five knots on the given `TWA`. */
function on(twa: number | '', fix: number, over: Partial<Row> = {}): Row {
  return { fix, twa: `${twa === '' ? '' : twa.toFixed(1)}`, ...over }
}

function file(rows: Row[]): string {
  const lines = rows.map((row, index) => {
    const seconds = 30 * index
    const time = `19:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    return [
      `06/03/2026 ${time}`,
      `-87.61237${8000 + row.fix}`,
      `41.88459${8000 + row.fix}`,
      `${200 + row.fix}.9`,
      row.sog ?? `5.${row.fix % 10}`,
      row.twa,
      row.stw ?? '5.2',
      '218.0',
    ].join(';')
  })
  return [HEADER, ...lines, ''].join('\n')
}

function assessed(rows: Row[]): {
  quality: TranscriptionQuality
  maneuvers: TranscriptionManeuvers
} {
  const outcome = parseQtvlmRecording(file(rows))
  if (!outcome.ok) {
    throw new Error(`expected a Transcription, got ${outcome.reason}: ${outcome.message}`)
  }
  const quality = assessRowQuality(outcome.transcription.rows)
  return { quality, maneuvers: detectManeuvers(outcome.transcription.rows, quality) }
}

/** The label each row ended up with, in order. */
function labels(rows: Row[]): (Maneuver | null)[] {
  return assessed(rows).maneuvers.rows.map((row) => row.maneuver_window)
}

/** A boat sailing `count` rows on one `TWA`, from fix `from`. */
function steady(twa: number, count: number, from: number): Row[] {
  return Array.from({ length: count }, (_, offset) => on(twa, from + offset))
}

describe('classifying a TWA sign flip', () => {
  it('calls a flip between two close-hauled angles a tack', () => {
    expect(classifyFlip(42, -40)).toBe('tack')
  })

  it('calls a flip between two running angles a gybe', () => {
    expect(classifyFlip(-150, 160)).toBe('gybe')
  })

  it('calls a flip from one side of the beam to the other a rounding, however it averages', () => {
    // Both from 06-06-26-nood. Averaged, the first lands at 79° and the prior art called it a
    // tack; the second at 95.5° and it was called a gybe. Same event, a beat to a run in one
    // sample, and the label decided by where the arithmetic fell (LAY-140).
    expect(classifyFlip(-154, 4)).toBe('rounding')
    expect(classifyFlip(28, -163)).toBe('rounding')
  })

  it('keeps a wide-angle tack or gybe as one, which a big-swing rule would not', () => {
    // 113° and 94° of heading change without leaving their side of the beam (LAY-140).
    expect(classifyFlip(132, -115)).toBe('gybe')
    expect(classifyFlip(-58, 36)).toBe('tack')
  })

  it('reads the beam itself as upwind, at the boundary the tack/gybe split already drew', () => {
    expect(ZONE_BOUNDARY_DEG).toBe(90)
    expect(classifyFlip(90, -40)).toBe('tack')
    expect(classifyFlip(-90, 150)).toBe('rounding')
  })
})

describe('finding the flips in a recording', () => {
  it('classifies every sign flip, at the row on the new side', () => {
    const { maneuvers } = assessed([
      ...steady(42, 4, 1),
      ...steady(-40, 6, 5),
      ...steady(-150, 6, 11),
      ...steady(155, 6, 17),
      ...steady(-40, 4, 23),
    ])

    expect(maneuvers.flips.map(({ row_index, maneuver }) => [row_index, maneuver])).toEqual([
      [5, 'tack'],
      [17, 'gybe'],
      [23, 'rounding'],
    ])
    // The angles it read, verbatim, so a page can show why.
    expect(maneuvers.flips[0]).toMatchObject({ twa_before: '42.0', twa_after: '-40.0' })
  })

  it('reads no flip across a blank or a zero, since neither has a side', () => {
    const { maneuvers } = assessed([
      on(42, 1),
      on('', 2),
      on(-40, 3),
      on(0, 4),
      on(40, 5),
    ])

    expect(maneuvers.flips).toEqual([])
  })

  it('states the rules that found them', () => {
    const { maneuvers } = assessed(steady(42, 2, 1))

    expect(maneuvers).toMatchObject({
      detector_version: MANEUVER_DETECTOR_VERSION,
      window_before: 1,
      window_after: 3,
      zone_boundary_deg: 90,
    })
  })
})

describe('a Maneuver Window', () => {
  it('is one row before the flip and three after, because recovery is the slow half', () => {
    expect([MANEUVER_WINDOW_BEFORE, MANEUVER_WINDOW_AFTER]).toEqual([1, 3])
    expect(labels([...steady(42, 4, 1), ...steady(-40, 6, 5)])).toEqual([
      null,
      null,
      null,
      'tack',
      'tack',
      'tack',
      'tack',
      'tack',
      null,
      null,
    ])
  })

  it('stops at the ends of the recording', () => {
    expect(labels([on(42, 1), on(-40, 2), on(-40, 3)])).toEqual(['tack', 'tack', 'tack'])
  })

  it('belongs to the later flip where two overlap', () => {
    // A tack straight into a rounding: the rows after the second flip are recovering from it.
    expect(
      labels([on(42, 1), on(-40, 2), on(-40, 3), on(150, 4), on(150, 5), on(150, 6), on(150, 7)])
    ).toEqual(['tack', 'tack', 'rounding', 'rounding', 'rounding', 'rounding', 'rounding'])
  })

  it('is never anchored on a Frozen row, which has no heading to flip', () => {
    // Rows 3–5 repeat row 2's fix verbatim: the feed died, and the TWA on them is no reading.
    const { quality, maneuvers } = assessed([
      on(42, 1),
      on(42, 2),
      on(-40, 2),
      on(-40, 2),
      on(-40, 2),
      on(-40, 6),
    ])

    expect(quality.rows.map((row) => row.frozen)).toEqual([false, false, true, true, true, false])
    expect(maneuvers.flips).toEqual([])
  })

  it('never claims a Frozen row, and claims the live ones either side of it', () => {
    // A tack at row 3, then the feed dies on rows 5–6 — inside the three rows after the flip.
    const { quality, maneuvers } = assessed([
      on(42, 1),
      on(42, 2),
      on(-40, 3),
      on(-40, 4),
      on(-40, 4),
      on(-40, 4),
      on(-40, 7),
    ])

    expect(quality.rows.map((row) => row.frozen)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ])
    expect(maneuvers.rows.map((row) => row.maneuver_window)).toEqual([
      null,
      'tack',
      'tack',
      'tack',
      null,
      null,
      null,
    ])
  })

  it('claims a Low-Speed row, and the row stays Low-Speed', () => {
    // The collision the prior art's single STATUS column resolved by dropping the maneuver.
    const { quality, maneuvers } = assessed([
      on(42, 1),
      on(-40, 2, { sog: '1.4' }),
      on(-40, 3),
    ])

    expect(quality.rows[1].low_speed).toBe(true)
    expect(maneuvers.rows[1].maneuver_window).toBe('tack')
  })
})

describe('Countable', () => {
  /** A row's facts, with every test passed unless overridden. */
  function facts(
    over: Partial<AnalysisRow['quality']> = {},
    maneuverWindow: Maneuver | null = null
  ): Pick<AnalysisRow, 'quality' | 'maneuver_window'> {
    return {
      quality: {
        row_index: 1,
        row_time: '2026-06-03 19:00:00',
        frozen: false,
        not_water_referenced: false,
        low_speed: false,
        gap_seconds: 30,
        ...over,
      },
      maneuver_window: maneuverWindow,
    }
  }

  it('is a sailing row on a steady course', () => {
    expect(isCountable(facts())).toBe(true)
  })

  it('is not a Frozen row, a Low-Speed row, or a row inside any Maneuver Window', () => {
    expect(isCountable(facts({ frozen: true }))).toBe(false)
    expect(isCountable(facts({ low_speed: true }))).toBe(false)
    expect(isCountable(facts({}, 'tack'))).toBe(false)
    expect(isCountable(facts({}, 'gybe'))).toBe(false)
    expect(isCountable(facts({}, 'rounding'))).toBe(false)
  })

  it('does not turn on Not Water-Referenced, which says what the wind columns mean', () => {
    expect(isCountable(facts({ not_water_referenced: true }))).toBe(true)
  })

  it('names which of the three reasons excluded a row, and nothing for a row they did not', () => {
    // Said once here rather than in each check that wants to count its exclusions, so two screens
    // cannot disagree about why a row was left out.
    expect(notCountableReason(facts())).toBeNull()
    expect(notCountableReason(facts({ frozen: true }))).toBe('frozen')
    expect(notCountableReason(facts({ low_speed: true }))).toBe('low_speed')
    expect(notCountableReason(facts({}, 'gybe'))).toBe('maneuver_window')
  })

  it('names the first reason where a row holds two, which Frozen always is', () => {
    // 48 rows of the archive are both Low-Speed and inside a Maneuver Window, and both facts
    // survive on the row (ADR 0025) — this answers with one of them because a count has to put
    // each row in one bucket, and says which.
    expect(notCountableReason(facts({ frozen: true, low_speed: true }, 'tack'))).toBe('frozen')
    expect(notCountableReason(facts({ low_speed: true }, 'tack'))).toBe('low_speed')
  })
})

describe('the rows a performance metric reads', () => {
  it('carry Row Quality and the Maneuver Window as separate facts, and the verdict beside them', () => {
    const { quality, maneuvers } = assessed([
      on(42, 1),
      on(42, 2),
      on(-40, 3, { sog: '1.4' }),
      on(-40, 4),
      on(-40, 5),
      on(-40, 6),
      on(-40, 7),
    ])

    const rows = analysisRows(quality, maneuvers)

    expect(rows[2]).toEqual({
      row_index: 3,
      row_time: quality.rows[2].row_time,
      quality: quality.rows[2],
      maneuver_window: 'tack',
      countable: false,
    })
    expect(rows[2].quality.low_speed).toBe(true)
    expect(rows.map((row) => row.countable)).toEqual([true, false, false, false, false, false, true])
  })

  it('refuses Row Quality and Maneuvers computed over different rows', () => {
    const { quality } = assessed(steady(42, 3, 1))
    const { maneuvers } = assessed(steady(42, 4, 1))

    expect(() => analysisRows(quality, maneuvers)).toThrow()
    expect(() =>
      analysisRows(quality, {
        ...maneuvers,
        rows: maneuvers.rows.slice(1),
      })
    ).toThrow()
  })
})

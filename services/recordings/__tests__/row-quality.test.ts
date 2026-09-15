/**
 * Row Quality and Gap Seconds, as rules rather than as measurements.
 *
 * The archive's own figures are pinned in `archive-row-quality.test.ts`, which needs the
 * owner's recordings; these are the rules those figures come from, written over the parser's
 * output rather than hand-built rows so a rule that disagrees with a real file fails here.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  DROPOUT_MIN_ROWS,
  LOW_SPEED_SOG_KNOTS,
  ROW_QUALITY_DETECTOR_VERSION,
  assessRowQuality,
  withinRaceWindow,
} from '@/services/recordings/row-quality'
import { parseQtvlmRecording } from '@/services/recordings/qtvlm'
import type { TranscriptionQuality } from '@/types'

const HEADER = 'Date;Longitude;Latitude;COG;SOG;TWS;STW;CTW'

/** The channels a quality test can vary. Anything else in the file is beside the point. */
interface Cells {
  lon: string
  lat: string
  cog: string
  sog: string
  tws: string
  stw: string
  ctw: string
}

interface Row extends Partial<Cells> {
  time: string
}

/**
 * A fix, numbered. Two rows built from the same `fix` are verbatim duplicates of each other —
 * which is what a Dropout is — and two built from different ones moved, in position, course and
 * speed at once, the way a sailing boat does.
 */
function at(time: string, fix: number, over: Partial<Cells> = {}): Row {
  return {
    time,
    lon: `-87.61237${8000 + fix}`,
    lat: `41.88459${8000 + fix}`,
    cog: `${220 + fix}.9`,
    sog: `5.${fix}`,
    tws: '9.7',
    stw: '3.6',
    ctw: '218.0',
    ...over,
  }
}

/** The file those rows make, LF-terminated the way qtVlm writes one. */
function file(rows: Row[]): string {
  const lines = rows.map((row) =>
    [
      `06/03/2026 ${row.time}`,
      row.lon ?? '',
      row.lat ?? '',
      row.cog ?? '',
      row.sog ?? '',
      row.tws ?? '',
      row.stw ?? '',
      row.ctw ?? '',
    ].join(';')
  )
  return [HEADER, ...lines, ''].join('\n')
}

function quality(rows: Row[]): TranscriptionQuality {
  const outcome = parseQtvlmRecording(file(rows))
  if (!outcome.ok) {
    throw new Error(`expected a Transcription, got ${outcome.reason}: ${outcome.message}`)
  }
  return assessRowQuality(outcome.transcription.rows)
}

function frozenFlags(rows: Row[]): boolean[] {
  return quality(rows).rows.map((row) => row.frozen)
}

describe('a Dropout', () => {
  it('marks the rows that repeat a fix, and not the row they repeat', () => {
    // The feed died after the second row: the logger kept writing, with that row's position,
    // course and speed verbatim, until it came back. Only the copies are fabricated.
    expect(
      frozenFlags([
        at('19:00:00', 1),
        at('19:00:30', 2),
        at('19:01:00', 2),
        at('19:01:30', 2),
        at('19:02:00', 3),
      ])
    ).toEqual([false, false, true, true, false])
  })

  it('needs a run of two repeats, so one duplicate row is not a Dropout', () => {
    // A boat parked in a hole can log the same fix twice; the archive's minimum observed move
    // below 1.5 knots is 0.78m, so a run is what tells a dead feed from a slow boat.
    expect(DROPOUT_MIN_ROWS).toBe(2)
    expect(
      frozenFlags([at('19:00:00', 1), at('19:00:30', 2), at('19:01:00', 2), at('19:01:30', 3)])
    ).toEqual([false, false, false, false])
  })

  it('is not claimed of rows that only ever agreed about nothing', () => {
    // An empty field is the instrument saying nothing, not the logger repeating itself, so two
    // blanks are two absences and never the evidence (ADR 0008). Position moves in all four rows
    // here; the only thing they have in common is a channel none of them reported.
    expect(
      frozenFlags([
        at('19:00:00', 1, { sog: '' }),
        at('19:00:30', 2, { sog: '' }),
        at('19:01:00', 3, { sog: '' }),
        at('19:01:30', 4, { sog: '' }),
      ])
    ).toEqual([false, false, false, false])
  })

  it('survives a blank sample in the middle of it, rather than vanishing', () => {
    // The feed dies in stages: the fix latches, and then a channel stops reporting altogether.
    // Read as a change, that blank would end the dropout and leave two runs of one repeat each —
    // reporting a wholly fabricated stretch as a clean track, which is this ticket's whole hazard.
    expect(
      frozenFlags([
        at('19:00:00', 1),
        at('19:00:30', 2),
        at('19:01:00', 2),
        at('19:01:30', 2, { sog: '' }),
        at('19:02:00', 2),
        at('19:02:30', 2),
        at('19:03:00', 3),
      ])
    ).toEqual([false, false, true, true, true, true, false])
  })

  it('still needs two verbatim repeats, which a blank is not', () => {
    // A blank breaks nothing and proves nothing either. One repeat plus two silent rows is not a
    // latched feed, so nothing here is claimed.
    expect(
      frozenFlags([
        at('19:00:00', 1),
        at('19:00:30', 2),
        at('19:01:00', 2, { sog: '' }),
        at('19:01:30', 2, { sog: '' }),
        at('19:02:00', 3),
      ])
    ).toEqual([false, false, false, false, false])
  })

  it('is a run of any length once it is two long', () => {
    expect(
      frozenFlags([
        at('19:00:00', 1),
        at('19:00:30', 2),
        at('19:01:00', 2),
        at('19:01:30', 2),
        at('19:02:00', 2),
        at('19:02:30', 2),
      ])
    ).toEqual([false, false, true, true, true, true])
  })

  it('needs every one of position, course and speed to repeat', () => {
    // A boat drifting sideways on a stopped log holds COG and SOG while its position moves.
    // That is a reading, not a repeat.
    expect(
      frozenFlags([
        at('19:00:00', 1),
        at('19:00:30', 2),
        at('19:01:00', 2, { lat: '41.8846000000' }),
        at('19:01:30', 2, { lat: '41.8846000000' }),
      ])
    ).toEqual([false, false, false, false])
  })
})

/** A dropout with two frozen rows in the middle, which several tests below measure against. */
const DROPOUT = [
  at('19:00:00', 1),
  at('19:00:30', 2),
  at('19:01:00', 2),
  at('19:01:30', 2),
  at('19:02:00', 3),
]

describe('the channels a Dropout is read from', () => {
  /** A recording under a header of the caller's choosing, which is the point of these tests. */
  function assessed(header: string, rows: string[]) {
    const outcome = parseQtvlmRecording([header, ...rows, ''].join('\n'))
    if (!outcome.ok) throw new Error(`expected a Transcription, got ${outcome.reason}`)
    return assessRowQuality(outcome.transcription.rows)
  }

  it('are the ones the recording actually fed, so a boat logging no COG is still read', () => {
    // The parser accepts `Date;Longitude;Latitude;SOG;HEEL;RUDDER;TRIM;LEEWAY`, with no `COG` in
    // it at all. Requiring the column outright would report every such recording as dropout-free
    // forever, which is the one output indistinguishable from a clean track.
    const quality = assessed('Date;Longitude;Latitude;SOG', [
      '06/03/2026 19:00:00;-87.6123781;41.8845981;5.1',
      '06/03/2026 19:00:30;-87.6123782;41.8845982;5.2',
      '06/03/2026 19:01:00;-87.6123782;41.8845982;5.2',
      '06/03/2026 19:01:30;-87.6123782;41.8845982;5.2',
    ])

    expect(quality.dropout_channels).toEqual(['latitude', 'longitude', 'sog'])
    expect(quality.rows.map((row) => row.frozen)).toEqual([false, false, true, true])
  })

  it('are none at all without position, because SOG alone is not evidence of anything', () => {
    // Two consecutive samples of 5.2 knots is an ordinary afternoon. A page reads the empty list
    // and says detection was not possible, rather than reading zero dropouts as good news.
    const quality = assessed('Date;Longitude;Latitude;COG;SOG', [
      '06/03/2026 19:00:00;;;220.9;5.2',
      '06/03/2026 19:00:30;;;220.9;5.2',
      '06/03/2026 19:01:00;;;220.9;5.2',
    ])

    expect(quality.dropout_channels).toEqual([])
    expect(quality.rows.map((row) => row.frozen)).toEqual([false, false, false])
  })

  it('are all four for a recording that feeds all four', () => {
    expect(quality(DROPOUT).dropout_channels).toEqual(['latitude', 'longitude', 'cog', 'sog'])
  })
})

describe('Gap Seconds', () => {
  it('measures from the previous non-Frozen row, so a Dropout is an hours-long step', () => {
    // Rows 3 and 4 are copies of row 2, so row 5 is 90 seconds from the last thing measured
    // even though it is 30 seconds after the row above it.
    expect(quality(DROPOUT).rows.map((row) => row.gap_seconds)).toEqual([null, 30, 30, 60, 90])
  })

  it('is null only for the first row in hand, which never repeats anything', () => {
    const gaps = quality(DROPOUT).rows.map((row) => row.gap_seconds)

    expect(gaps[0]).toBeNull()
    expect(gaps.slice(1).every((gap) => gap !== null)).toBe(true)
  })

  it('reads the cadence, not a fixed interval, when nothing froze', () => {
    // 06-20-26-chi-wauk logs on event triggers rather than a timer: 45 seconds, then 75.
    expect(
      quality([at('19:00:00', 1), at('19:00:45', 2), at('19:02:00', 3)]).rows.map(
        (row) => row.gap_seconds
      )
    ).toEqual([null, 45, 75])
  })
})

describe('Low-Speed', () => {
  it('is SOG below two knots, and two knots itself is sailing', () => {
    expect(LOW_SPEED_SOG_KNOTS).toBe(2)
    expect(
      quality([
        at('19:00:00', 1, { sog: '1.9' }),
        at('19:00:30', 2, { sog: '2.0' }),
        at('19:01:00', 3, { sog: '0.0' }),
      ]).rows.map((row) => row.low_speed)
    ).toEqual([true, false, true])
  })

  it('is not claimed of a row whose SOG the instrument never reported', () => {
    // Missing is missing. A blank read as zero would call a boat at 6 knots stationary because
    // its GPS dropped one sample (ADR 0008).
    expect(
      quality([at('19:00:00', 1, { sog: '' }), at('19:00:30', 2)]).rows.map((row) => row.low_speed)
    ).toEqual([false, false])
  })
})

describe('Not Water-Referenced', () => {
  it('is either of STW and CTW missing, which is the stored column’s own predicate', () => {
    expect(
      quality([
        at('19:00:00', 1),
        at('19:00:30', 2, { stw: '' }),
        at('19:01:00', 3, { ctw: '' }),
        at('19:01:30', 4, { stw: '', ctw: '' }),
      ]).rows.map((row) => row.not_water_referenced)
    ).toEqual([false, true, true, true])
  })

  it('negates the very expression the stored generated column is defined by', () => {
    // The one figure ADR 0009 says to read from the database rather than compute, computed here
    // because a Transcription has no stored column yet. Two definitions of one fact, so this
    // reads the migration and fails if they stop being each other's negation — a race page
    // showing a flag that disagrees with the column would be silent otherwise.
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/20260910183000_create_race_archive_and_boat_setup.sql'
      ),
      'utf8'
    )

    expect(migration).toContain('water_referenced  BOOLEAN GENERATED ALWAYS AS\n' +
      '                          (stw IS NOT NULL AND ctw IS NOT NULL) STORED')
  })

  it('is true throughout a recording whose header has no such column at all', () => {
    // A boat with no paddlewheel logs no `STW` column, which is not the same file shape as a
    // boat whose paddlewheel went quiet — and is the same fact about every one of its rows.
    const outcome = parseQtvlmRecording(
      [
        'Date;Longitude;Latitude;COG;SOG;TWS',
        '06/03/2026 19:00:00;-87.6123781;41.8845981;220.9;5.1;9.7',
        '06/03/2026 19:00:30;-87.6123782;41.8845982;221.9;5.2;9.8',
        '',
      ].join('\n')
    )
    if (!outcome.ok) throw new Error(`expected a Transcription, got ${outcome.reason}`)

    expect(
      assessRowQuality(outcome.transcription.rows).rows.map((row) => row.not_water_referenced)
    ).toEqual([true, true])
  })
})

describe('the three states', () => {
  it('are computed independently, so one row carries all three at once', () => {
    // The prior art's single `STATUS` field could hold one of these and kept whichever was
    // assigned last, which cost 34 rows across 5 recordings their maneuver marker (ADR 0009).
    const frozenAndSlowAndBlind = { sog: '1.5', stw: '', ctw: '' }
    const assessed = quality([
      at('19:00:00', 1),
      at('19:00:30', 2, frozenAndSlowAndBlind),
      at('19:01:00', 2, frozenAndSlowAndBlind),
      at('19:01:30', 2, frozenAndSlowAndBlind),
    ]).rows

    expect(assessed[2]).toEqual({
      row_index: 3,
      row_time: '2026-06-03T19:01:00',
      frozen: true,
      not_water_referenced: true,
      low_speed: true,
      gap_seconds: 30,
    })
  })

  it('describe the rows they were given, in that order', () => {
    const assessed = quality(DROPOUT).rows

    expect(assessed.map((row) => row.row_index)).toEqual([1, 2, 3, 4, 5])
    expect(assessed.map((row) => row.row_time)).toEqual([
      '2026-06-03T19:00:00',
      '2026-06-03T19:00:30',
      '2026-06-03T19:01:00',
      '2026-06-03T19:01:30',
      '2026-06-03T19:02:00',
    ])
  })
})

describe('a Race Window', () => {
  const window = { window_start: '2026-06-03 19:01:00', window_finish: '2026-06-03 19:02:00' }

  it('is applied after detection, so a Dropout that began before the start is still marked', () => {
    const inWindow = withinRaceWindow(quality(DROPOUT), window)

    expect(inWindow.rows.map((row) => row.row_index)).toEqual([3, 4, 5])
    expect(inWindow.rows.map((row) => row.frozen)).toEqual([true, true, false])
  })

  it('finds what clipping first cannot: the same rows, assessed alone, look clean', () => {
    // This is the regression the ordering exists for. Row 3 has nothing above it to repeat and
    // row 4 is then a lone duplicate, so a clipped recording reports a spotless track.
    const clippedFirst = quality(DROPOUT.slice(2))

    expect(clippedFirst.rows.map((row) => row.frozen)).toEqual([false, false, false])
  })

  it('keeps Gap Seconds measured across its own start', () => {
    // The first in-window row is 30 seconds after a row nobody is looking at any more, and
    // saying null here would let a rate calculation treat the start as a fresh beginning.
    expect(withinRaceWindow(quality(DROPOUT), window).rows.map((row) => row.gap_seconds)).toEqual([
      30, 60, 90,
    ])
  })

  it('refuses a bound that is not a real date rather than rolling it over', () => {
    // A window is typed by a sailor. `2026-06-31` read as 1 July would select another day's rows,
    // or none, and report neither — so it is refused where the mistake can still be corrected.
    expect(() =>
      withinRaceWindow(quality(DROPOUT), {
        window_start: '2026-06-31 19:00:00',
        window_finish: '2026-06-31 19:02:00',
      })
    ).toThrow('not a real date and time')

    expect(() =>
      withinRaceWindow(quality(DROPOUT), {
        window_start: '2026-06-03 19:00',
        window_finish: '2026-06-03 19:02:00',
      })
    ).toThrow('not a naive timestamp')
  })

  it('includes a row on either bound, because a row at the start is in the race', () => {
    const inWindow = withinRaceWindow(quality(DROPOUT), {
      window_start: '2026-06-03T19:00:30',
      window_finish: '2026-06-03T19:01:30',
    })

    expect(inWindow.rows.map((row) => row.row_index)).toEqual([2, 3, 4])
  })
})

describe('the rules a page states', () => {
  it('travel with the figures, through the window filter as well', () => {
    const whole = quality(DROPOUT)
    const inWindow = withinRaceWindow(whole, {
      window_start: '2026-06-03 19:00:00',
      window_finish: '2026-06-03 19:02:00',
    })

    for (const assessed of [whole, inWindow]) {
      expect(assessed.detector_version).toBe(ROW_QUALITY_DETECTOR_VERSION)
      expect(assessed.low_speed_sog_knots).toBe(LOW_SPEED_SOG_KNOTS)
      expect(assessed.dropout_min_rows).toBe(DROPOUT_MIN_ROWS)
    }
  })

  it('are named, so a figure on screen can say which detector produced it', () => {
    expect(ROW_QUALITY_DETECTOR_VERSION).toMatch(/^row-quality\/\d+$/)
  })
})

/**
 * Row Quality, over the recordings its figures were measured on.
 *
 * These are the regression guard, and they are pinned counts rather than shapes on purpose. The
 * upstream detector's rulings moved for 829 rows in a single commit; a rule that drifts here would
 * change what a race page says about a race that has already been read, and the only way to notice
 * is to write down what the archive measures today and fail when it stops measuring that.
 *
 * Every figure below was computed independently of this implementation, by running the prior art's
 * pandas rules over the same thirteen files. The rules in `row-quality.test.ts` are what these
 * numbers are meant to come out of; if a count here changes, one of those rules changed.
 *
 * Needs the owner's recordings, so it skips loudly without them — see `archive.ts`.
 */

import {
  archiveFilenames,
  describeArchive,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import {
  LOW_SPEED_SOG_KNOTS,
  assessRowQuality,
  withinRaceWindow,
} from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { RowQuality } from '@/types'

/** Quality over the whole recording, which is the only order it is ever computed in. */
function wholeRecording(filename: string): RowQuality[] {
  return assessRowQuality(transcribe(filename).transcription.rows).rows
}

/** And then, and only then, the rows inside the race. */
function insideTheRace(filename: string): RowQuality[] {
  return withinRaceWindow(assessRowQuality(transcribe(filename).transcription.rows), {
    ...raceWindowFor(filename),
  }).rows
}

function frozen(rows: RowQuality[]): RowQuality[] {
  return rows.filter((row) => row.frozen)
}

/** The number of Dropouts, which is not the number of frozen rows. */
function dropoutBlocks(rows: RowQuality[]): RowQuality[][] {
  const blocks: RowQuality[][] = []
  for (const [index, row] of rows.entries()) {
    if (!row.frozen) continue
    if (index > 0 && rows[index - 1].frozen) blocks[blocks.length - 1].push(row)
    else blocks.push([row])
  }
  return blocks
}

describeArchive('the archive, read as Row Quality', () => {
  it('is 4,088 rows inside a race window, 870 of them Frozen', () => {
    const inWindow = archiveFilenames.flatMap(insideTheRace)

    expect(inWindow).toHaveLength(4088)
    expect(frozen(inWindow)).toHaveLength(870)
  })

  it('holds a recording that is half fabricated and looks complete', () => {
    // 09-04-2026-chicago-st-joe: 18:50 on 4 September to 08:30 on 5 September, 13.68 hours, and
    // the feed died repeatedly. Nothing about that is a reason to refuse the file; everything
    // about it is a reason for the page to say so (ADR 0009).
    const inWindow = insideTheRace('09-04-2026-chicago-st-joe.csv')

    expect(inWindow).toHaveLength(1636)
    expect(frozen(inWindow)).toHaveLength(815)
    expect(frozen(inWindow).length / inWindow.length).toBeCloseTo(0.498, 3)
  })

  it('holds a recording whose Dropout hides behind its race window', () => {
    // 09-02-2026-beer-can froze after the finish, so clipping first sees a spotless 42-row race
    // and the recording as a whole is more than half fabrication. This file has been through the
    // prior art's pipeline looking clean.
    const whole = wholeRecording('09-02-2026-beer-can.csv')

    expect(whole).toHaveLength(275)
    expect(frozen(whole)).toHaveLength(146)
    expect(frozen(whole).length / whole.length).toBeCloseTo(0.531, 3)
    expect(frozen(insideTheRace('09-02-2026-beer-can.csv'))).toHaveLength(0)
  })

  it('holds a recording whose first in-window sample repeats the row before the start', () => {
    // 06-20-26-chi-wauk. Row 56 is the first row inside the window and it is a verbatim copy of
    // row 55, which is not — the row that made detection-before-windowing measurable.
    const inWindow = insideTheRace('06-20-26-chi-wauk.csv')
    const first = inWindow[0]

    expect(first.row_index).toBe(56)
    expect(first.frozen).toBe(true)
    // 120 seconds back to row 54, the last row that was measured rather than repeated, across
    // the start of the race. A cadence-shaped 75 here would be a rate computed on fabrication.
    expect(first.gap_seconds).toBe(120)
  })

  it('would lose that row to clipping first, and only that row', () => {
    // The whole cost of getting the order wrong, in one number: 869 against 870. It is worth
    // pinning because it is small — a rule that quietly reverted would look almost right.
    const clippedFirst = archiveFilenames.flatMap((filename) => {
      const window = raceWindowFor(filename)
      const start = wallClockSeconds(window.window_start)
      const finish = wallClockSeconds(window.window_finish)
      const clipped = transcribe(filename).transcription.rows.filter((row) => {
        const at = wallClockSeconds(row.row_time)
        return at >= start && at <= finish
      })

      return assessRowQuality(clipped).rows
    })

    expect(frozen(clippedFirst)).toHaveLength(869)
  })
})

describeArchive('why a speed gate cannot stand in for a Dropout', () => {
  it('is that the feed latched at a sailing speed on 856 of the 870 frozen rows', () => {
    const frozenRows = frozen(archiveFilenames.flatMap(insideTheRace))

    expect(frozenRows.filter((row) => !row.low_speed)).toHaveLength(856)
    expect(frozenRows.filter((row) => row.low_speed)).toHaveLength(14)
  })

  it('and that on the half-fabricated race it would flag none of them at all', () => {
    const frozenRows = frozen(insideTheRace('09-04-2026-chicago-st-joe.csv'))

    expect(frozenRows).toHaveLength(815)
    expect(frozenRows.filter((row) => row.low_speed)).toHaveLength(0)
    expect(LOW_SPEED_SOG_KNOTS).toBe(2)
  })
})

describeArchive('why water_referenced cannot stand in either', () => {
  it('agrees with Frozen on 845 of 870 rows, which is agreement by coincidence', () => {
    const inWindow = archiveFilenames.flatMap(insideTheRace)
    const frozenRows = frozen(inWindow)

    expect(frozenRows.filter((row) => row.not_water_referenced)).toHaveLength(845)
    // The frozen-but-live rows: the feed repeated a fix while the paddlewheel still reported.
    expect(frozenRows.filter((row) => !row.not_water_referenced)).toHaveLength(25)
    // And in the other direction it fires on 90 rows that are nothing of the kind — a boat whose
    // log went quiet is not a boat whose feed died.
    expect(inWindow.filter((row) => !row.frozen && row.not_water_referenced)).toHaveLength(90)
  })

  it('and undercounts every Dropout that opens on a row still carrying live instruments', () => {
    // 19 of the archive's 22 dropout blocks open with a verbatim duplicate whose `STW` and `CTW`
    // are still reporting, so the substitution misses each of those blocks' first row.
    const blocks = archiveFilenames.flatMap((filename) => dropoutBlocks(wholeRecording(filename)))

    expect(blocks).toHaveLength(22)
    expect(blocks.filter((block) => !block[0].not_water_referenced)).toHaveLength(19)
  })
})

describeArchive('Gap Seconds, across the archive', () => {
  it('reads hours across the seam of a Dropout', () => {
    // 8,790 seconds — two and a half hours — between two rows 30 seconds apart in the file, on
    // the St Joe race. Anything differencing adjacent rows reads that as one ordinary step.
    const gaps = wholeRecording('09-04-2026-chicago-st-joe.csv').map((row) => row.gap_seconds)

    expect(Math.max(...gaps.map((gap) => gap ?? 0))).toBe(8790)
  })

  it('is null for the first row of every recording and for no other row', () => {
    for (const filename of archiveFilenames) {
      const rows = wholeRecording(filename)

      expect(rows[0].gap_seconds).toBeNull()
      expect(rows.slice(1).filter((row) => row.gap_seconds === null)).toHaveLength(0)
    }
  })

  it('never goes backwards, because no recording’s clock did', () => {
    // Thirteen seasons of Lake Michigan racing and no autumn fall-back mid-recording, which
    // `describeRecording` states as zero backwards steps. A negative gap here would mean the
    // rows are not in the order the file wrote them.
    const gaps = archiveFilenames.flatMap((filename) =>
      wholeRecording(filename).map((row) => row.gap_seconds)
    )

    expect(gaps.filter((gap) => gap !== null && gap < 0)).toHaveLength(0)
  })
})

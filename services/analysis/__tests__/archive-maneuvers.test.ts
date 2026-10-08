/**
 * Maneuvers and Countable, over the recordings their figures were measured on.
 *
 * The regression guard, pinned as counts rather than shapes, for the same reason Row Quality's is
 * (`archive-row-quality.test.ts`): these numbers decide what a race page says about a race that has
 * already been read, and the only way to notice a rule drifting is to write down what the archive
 * measures today and fail when it stops measuring that.
 *
 * Needs the owner's recordings, so it skips loudly without them — see `archive.ts`.
 *
 * ## On the two sets of cached figures these tests had to choose between
 *
 * ADR 0009 states 263 rows inside a Maneuver Window at a (1,1) span and 415 at (1,3).
 * `docs/research/lay-140-maneuver-detection.md` reports 229 and 367 for the same two spans and says
 * its numbers supersede the ADR's, blaming drift in the sibling repo it measured.
 *
 * It is not drift. This implementation reproduces **the ADR's** 263 and 415 exactly, clip-first,
 * and the research's own six-row sweep table (155 / 229 / 299 / 367 / 431 / 430) is reproduced
 * exactly too — by counting only those rows the prior art's single `STATUS` column would still be
 * carrying a maneuver label on, i.e. dropping every row where Low-Speed took precedence. That is 34
 * rows at (1,1) and 48 at (1,3), and the 34 is precisely the "34 rows across 5 recordings" ADR 0009
 * identifies as having lost their maneuver marker to exactly that bug. The research's measuring
 * script inherited the defect its own prose tells this ticket not to inherit, so its window-cost
 * figures are understated and its flip counts — which the bug cannot touch — are right.
 *
 * So: flips are pinned at the research's 93 / 56 / 28 / 9, window rows at the ADR's 415, and the
 * 48 rows that are both Low-Speed and in a Maneuver Window are pinned as their own assertion
 * below, because they are the measurable proof that the two axes stayed independent here.
 */

import {
  archiveFilenames,
  describeArchive,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import {
  MANEUVER_WINDOW_AFTER,
  MANEUVER_WINDOW_BEFORE,
  detectManeuvers,
} from '@/services/analysis/maneuvers'
import { assessRowQuality } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { AnalysisRow, Maneuver, ManeuverFlip, TranscriptionRow } from '@/types'

/**
 * One recording, assessed the only order this is ever computed in: both axes over the whole
 * Transcription, joined, and only then filtered to the Race Window.
 */
function race(filename: string): {
  rows: AnalysisRow[]
  flips: ManeuverFlip[]
  sog: Map<number, string | null>
  whole: AnalysisRow[]
} {
  const rows = transcribe(filename).transcription.rows
  const quality = assessRowQuality(rows)
  const maneuvers = detectManeuvers(rows, quality)
  const whole = analysisRows(quality, maneuvers)
  const inWindow = analysisRowsWithin(whole, raceWindowFor(filename))
  const inside = new Set(inWindow.map((row) => row.row_index))

  return {
    rows: inWindow,
    flips: maneuvers.flips.filter((flip) => inside.has(flip.row_index)),
    sog: new Map(rows.map((row) => [row.row_index, row.sog])),
    whole,
  }
}

/** Every recording's in-window rows, which is the archive as a season of racing. */
function everyRace(): AnalysisRow[] {
  return archiveFilenames.flatMap((filename) => race(filename).rows)
}

/** Every in-window flip across the archive. */
function everyFlip(): ManeuverFlip[] {
  return archiveFilenames.flatMap((filename) => race(filename).flips)
}

function counting(flips: ManeuverFlip[]): Record<Maneuver, number> {
  const counts: Record<Maneuver, number> = { tack: 0, gybe: 0, rounding: 0 }
  for (const flip of flips) counts[flip.maneuver] += 1
  return counts
}

describeArchive('the archive, read as Maneuvers', () => {
  it('is 93 sign flips inside a race window: 56 tacks, 28 gybes, 9 roundings', () => {
    const flips = everyFlip()

    expect(flips).toHaveLength(93)
    expect(counting(flips)).toEqual({ tack: 56, gybe: 28, rounding: 9 })
  })

  it('finds the nine roundings the prior art was forcing into a tack or a gybe', () => {
    // Every one of these changes point of sail inside a single 30-second sample, and averaging the
    // two sides put each of them on an arbitrary side of 90°. The first two are the canonical
    // examples from both ADR 0009 and LAY-140: same event, opposite labels, 16.5° of arithmetic
    // apart. A rounding's speed loss is a different phenomenon and must not enter a tack-cost or
    // gybe-cost population, which is the whole reason the third label exists.
    const roundings = everyFlip()
      .filter((flip) => flip.maneuver === 'rounding')
      .map((flip) => `${flip.twa_before} -> ${flip.twa_after}`)

    expect(roundings).toEqual([
      '28.0 -> -163.0',
      '-154.0 -> 4.0',
      '93.0 -> -24.0',
      '-24.0 -> 151.0',
      '36.0 -> -167.0',
      '-101.0 -> 49.0',
      '-80.0 -> 170.0',
      '-134.0 -> 48.0',
      '-87.0 -> 173.0',
    ])
  })

  it('reproduces ADR 0009’s 415 in-window rows inside a Maneuver Window, clipping first', () => {
    // The ADR's figure, and the one this implementation agrees with — see the header. Measured the
    // ADR's own way, which is the prior art's order: clip to the window, then detect.
    const clipFirst = archiveFilenames.flatMap((filename) => {
      const window = raceWindowFor(filename)
      const start = wallClockSeconds(window.window_start)
      const finish = wallClockSeconds(window.window_finish)
      const rows: TranscriptionRow[] = transcribe(filename).transcription.rows.filter((row) => {
        const at = wallClockSeconds(row.row_time)
        return at >= start && at <= finish
      })
      const quality = assessRowQuality(rows)
      return analysisRows(quality, detectManeuvers(rows, quality))
    })

    expect(clipFirst.filter((row) => row.maneuver_window !== null)).toHaveLength(415)
  })

  it('and finds 9 more rows than that by detecting before filtering, which is the right order', () => {
    // 424 against 415. Those nine rows are inside a race and recovering from a flip that happened
    // before the gun: the boat was still coming out of a tack when the race started, and clipping
    // first cannot see the flip that says so. Same reasoning as Row Quality's detect-then-filter
    // (ADR 0009), and the same shape of answer — a small number worth pinning, because a rule that
    // quietly reverted to clipping first would look almost right.
    const inWindow = everyRace()

    expect(inWindow).toHaveLength(4088)
    expect(inWindow.filter((row) => row.maneuver_window !== null)).toHaveLength(424)
  })

  it('never labels a Frozen row, across all 870 of them', () => {
    // A Frozen row's `TWA` is a repeated copy, not a heading: it may neither anchor a flip nor be
    // claimed by a window. The one Row Quality state that gates maneuver detection at all.
    const inWindow = everyRace()
    const frozen = inWindow.filter((row) => row.quality.frozen)

    expect(frozen).toHaveLength(870)
    expect(frozen.filter((row) => row.maneuver_window !== null)).toHaveLength(0)
  })
})

describeArchive('Maneuver and Row Quality as independent axes', () => {
  it('is 48 rows that are both Low-Speed and inside a Maneuver Window, both facts surviving', () => {
    // The collision the prior art's single `STATUS` column resolved by dropping the maneuver, and
    // the measurable proof that nothing here resolves it: these rows carry both. They are also
    // exactly the 48 rows that make the research document's 367 differ from the ADR's 415.
    const inWindow = everyRace()
    const both = inWindow.filter((row) => row.quality.low_speed && row.maneuver_window !== null)

    expect(inWindow.filter((row) => row.quality.low_speed)).toHaveLength(158)
    expect(both).toHaveLength(48)
    // Not one of them is Countable — two independent reasons, and either alone would do it.
    expect(both.filter((row) => row.countable)).toHaveLength(0)
  })

  it('leaves 2,698 of the archive’s 4,088 in-window rows Countable', () => {
    // What every performance metric in this map actually gets to read: two thirds of a season.
    // 870 Frozen, 158 Low-Speed and 424 in a Maneuver Window, overlapping as they do.
    const inWindow = everyRace()

    expect(inWindow.filter((row) => row.countable)).toHaveLength(2698)
  })

  it('never needs Not Water-Referenced to exclude a row, on this archive', () => {
    // Worth knowing, because it is not obvious that the rule can leave this axis out. All 935
    // in-window rows whose `STW`/`CTW` went quiet are already excluded for one of the three real
    // reasons: 845 are Frozen and the other 90 are every one of them Low-Speed, the paddlewheel
    // having stopped reporting because the boat stopped moving through the water.
    //
    // So on this archive the choice costs nothing, and `maneuvers.test.ts` is where the rule itself
    // is pinned — Not Water-Referenced says what the wind columns mean, not whether the boat was
    // sailing, and a future recording where the log fails on a moving boat must stay Countable.
    const quiet = everyRace().filter((row) => row.quality.not_water_referenced)

    expect(quiet).toHaveLength(935)
    expect(quiet.filter((row) => row.quality.frozen)).toHaveLength(845)
    expect(quiet.filter((row) => !row.quality.frozen && !row.quality.low_speed)).toHaveLength(0)
  })
})

describeArchive('why a Maneuver Window reaches three rows past the flip', () => {
  /**
   * How many rows after each flip of this kind the boat took to get back to 90% of the `SOG` it
   * held going in — the measurement the asymmetric span rests on.
   *
   * Baseline is the mean `SOG` of the up-to-3 rows before the flip; the search runs from the flip
   * row itself out to 8 rows past it. Roundings are left out: a change of point of sail has no
   * pre-maneuver speed to return to, which is the same reason they are a third label.
   */
  function recoveryRows(kind: 'tack' | 'gybe'): (number | null)[] {
    return archiveFilenames.flatMap((filename) => {
      const { flips, sog, whole } = race(filename)
      const at = new Map(whole.map((row, index) => [row.row_index, index]))

      return flips
        .filter((flip) => flip.maneuver === kind)
        .map((flip) => {
          const flipAt = at.get(flip.row_index)
          if (flipAt === undefined) {
            throw new Error(`flip at row ${flip.row_index} is not in its own recording`)
          }

          const before: number[] = []
          for (let back = 1; back <= 3; back += 1) {
            const row = whole[flipAt - back]
            const speed = row ? sog.get(row.row_index) : null
            if (speed !== null && speed !== undefined) before.push(Number(speed))
          }
          if (before.length === 0) return null

          const baseline = before.reduce((sum, speed) => sum + speed, 0) / before.length
          for (let ahead = 0; ahead <= 8; ahead += 1) {
            const row = whole[flipAt + ahead]
            if (!row) break
            const speed = sog.get(row.row_index)
            if (speed === null || speed === undefined) continue
            if (Number(speed) >= 0.9 * baseline) return ahead
          }
          return null
        })
    })
  }

  /** Share of the flips with speed data either side that had recovered by `rows` past the flip. */
  function recoveredBy(kind: 'tack' | 'gybe', rows: number): number {
    // The nulls are the flips with no speed to compare, which are left out of the denominator
    // rather than counted as failures to recover — 5 tacks and 2 gybes across the archive.
    const measured = recoveryRows(kind).flatMap((recovery) => (recovery === null ? [] : [recovery]))
    return measured.filter((recovery) => recovery <= rows).length / measured.length
  }

  it('is that one row past it leaves a quarter of tacks and gybes still slow', () => {
    expect(MANEUVER_WINDOW_AFTER).toBe(3)
    // The prior art's span. 78% and 77%: the rest are rows a performance metric would be reading
    // as the boat's steady-state speed while it was still accelerating out of a turn.
    expect(recoveredBy('tack', 1)).toBeCloseTo(0.78, 2)
    expect(recoveredBy('gybe', 1)).toBeCloseTo(0.77, 2)
  })

  it('and three rows past it leaves about a tenth', () => {
    // 94% of tacks and 92% of gybes recovered — the measurement that chose this span. (LAY-140
    // reports 88% for gybes; it counts one of the 26 as recovering a row later than this does, and
    // its tack figures match to the row. The conclusion is the same either way.)
    expect(recoveredBy('tack', 3)).toBeCloseTo(0.94, 2)
    expect(recoveredBy('gybe', 3)).toBeCloseTo(0.92, 2)
  })

  it('and a fourth row would buy almost nothing, which is why the span stops', () => {
    // 98% and 96%, for 69 more excluded rows across the archive — the knee in the curve is here.
    expect(recoveredBy('tack', 4)).toBeCloseTo(0.98, 2)
    expect(recoveredBy('gybe', 4)).toBeCloseTo(0.96, 2)
  })

  it('while the turn itself is brief, which is why only one row before it', () => {
    // The other half of the asymmetry: a boat one row out from a flip is still at 94% of the speed
    // it held three rows earlier (LAY-140's median). Nothing measured asks the span to grow here.
    expect(MANEUVER_WINDOW_BEFORE).toBe(1)
  })
})

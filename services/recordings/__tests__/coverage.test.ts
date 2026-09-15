/**
 * What a race says it covers, in time and never in rows.
 *
 * "6,337 rows" answers a question nobody asked: it is meaningless without the cadence and it
 * counts a dead feed's copies as evidence. Seconds are checkable against a sailor's memory of the
 * afternoon, so a race page states seconds, and this suite is where the arithmetic behind them
 * is pinned — including the identity that makes the four figures a partition of the window rather
 * than four numbers that happen to be nearby.
 */

import {
  coverageRowsFrom,
  describeDuration,
  raceCoverage,
  recordingFindings,
  statesAGap,
  windowFindings,
} from '@/services/recordings/coverage'
import { assessRowQuality, withinRaceWindow } from '@/services/recordings/row-quality'
import { raceWindowSeconds } from '@/services/recordings/race-window'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { RecordingProvenance, TranscriptionQuality } from '@/types'

import { archiveFilenames, describeArchive, raceWindowFor, transcribe } from './archive'

const START = wallClockSeconds('2026-06-03T19:00:00')

/** Rows every 30 seconds, with the named indices frozen. */
function rowsEvery30(count: number, frozenAt: number[] = []) {
  return Array.from({ length: count }, (_, index) => ({
    seconds: START + index * 30,
    frozen: frozenAt.includes(index),
  }))
}

describe('coverage in time', () => {
  it('partitions the window into lead, live, frozen and tail', () => {
    // Eleven rows over five minutes, three of them a dropout, inside a window that opens a minute
    // early and closes two minutes late.
    const rows = rowsEvery30(11, [4, 5, 6])
    const coverage = raceCoverage(rows, { start: START - 60, finish: START + 300 + 120 })

    expect(coverage.window_seconds).toBe(480)
    expect(coverage.lead_gap_seconds).toBe(60)
    expect(coverage.tail_gap_seconds).toBe(120)
    // Rows 4, 5 and 6 are copies, so the three 30-second stretches ending on them have no reading.
    expect(coverage.frozen_seconds).toBe(90)
    expect(coverage.live_seconds).toBe(210)
    expect(coverage.row_count).toBe(11)
    expect(coverage.backwards_steps).toBe(0)
  })

  it('adds up to the window exactly, which is what makes the four figures honest', () => {
    // If these did not sum, a page stating all four would be describing a window that is not the
    // one it also states — and the missing seconds would be wherever the arithmetic was loosest.
    const rows = rowsEvery30(40, [10, 11, 12, 13, 25])
    const coverage = raceCoverage(rows, { start: START - 45, finish: START + 40 * 30 + 900 })

    expect(
      coverage.lead_gap_seconds +
        coverage.live_seconds +
        coverage.frozen_seconds +
        coverage.tail_gap_seconds
    ).toBe(coverage.window_seconds)
  })

  it('states the gap to the finish where the window outlives the recording', () => {
    // 08-22-26-glr, in miniature: the logger was stopped on the dock 1,155 seconds before the
    // race was over, and the race has to say so rather than pretend it ran to the last row.
    const rows = rowsEvery30(10)
    const coverage = raceCoverage(rows, { start: START, finish: START + 9 * 30 + 1155 })

    expect(coverage.tail_gap_seconds).toBe(1155)
    expect(coverage.live_seconds).toBe(270)
  })

  it('measures only the rows inside the window, ignoring the transit either side', () => {
    // The delivery out to the start line and the sail home are in the recording and are not the
    // race. Counting them would make every coverage figure a claim about the whole afternoon.
    const rows = rowsEvery30(20)
    const coverage = raceCoverage(rows, { start: START + 300, finish: START + 480 })

    expect(coverage.row_count).toBe(7)
    expect(coverage.live_seconds).toBe(180)
    expect(coverage.lead_gap_seconds).toBe(0)
    expect(coverage.tail_gap_seconds).toBe(0)
  })

  it('reports an empty window as covering nothing rather than dividing by nothing', () => {
    // Refused before it ever gets here, but a race page reading a window from a URL is not the
    // wizard, and a zero here has to be a zero rather than a NaN.
    const coverage = raceCoverage(rowsEvery30(10), { start: START + 9000, finish: START + 9600 })

    expect(coverage.row_count).toBe(0)
    expect(coverage.live_seconds).toBe(0)
    expect(coverage.frozen_seconds).toBe(0)
    expect(coverage.lead_gap_seconds).toBe(600)
    expect(coverage.tail_gap_seconds).toBe(0)
  })

  it('counts a clock that stepped backwards instead of folding it into a duration', () => {
    // A fall-back hour repeats. A negative interval averaged into `live_seconds` would shorten the
    // race; clamped to zero it would fabricate a duration. It is counted and excluded, and the
    // partition stops holding — which the field is there to announce.
    const rows = [
      { seconds: START, frozen: false },
      { seconds: START + 30, frozen: false },
      { seconds: START - 3570, frozen: false },
      { seconds: START - 3540, frozen: false },
    ]
    const coverage = raceCoverage(rows, { start: START - 3600, finish: START + 60 })

    expect(coverage.backwards_steps).toBe(1)
    expect(coverage.live_seconds).toBe(60)
  })

  it('takes the cadence from the middle interval, so one dropout cannot move it', () => {
    // Nine rows at 30 seconds with an hour missing out of the middle. The mean interval is 480
    // seconds, which no row in this recording ever arrived at; the median is the 30 the logger was
    // actually set to.
    const rows = [
      ...rowsEvery30(5),
      ...Array.from({ length: 4 }, (_, index) => ({
        seconds: START + 3600 + index * 30,
        frozen: false,
      })),
    ]
    const coverage = raceCoverage(rows, { start: START, finish: START + 3690 })

    expect(coverage.median_interval_seconds).toBe(30)
  })

  it('has no cadence to state where the window holds one row or none', () => {
    // One row is a window with no intervals in it, so there is nothing an edge gap could be
    // compared against — and `null` says that rather than implying a cadence of zero.
    expect(
      raceCoverage(rowsEvery30(10), { start: START + 300, finish: START + 320 })
        .median_interval_seconds
    ).toBeNull()
    expect(
      raceCoverage(rowsEvery30(10), { start: START + 9000, finish: START + 9600 })
        .median_interval_seconds
    ).toBeNull()
  })
})

describe('whether an edge gap is a thing that happened', () => {
  const rows = rowsEvery30(20)

  it('withholds the reading of a gap shorter than one sampling interval', () => {
    // A drag is unsnapped, so an ordinary finish lands between two rows. Telling a sailor the
    // logger was stopped early about 12 seconds of a 30-second cadence would fire on nearly every
    // race, and a note that always fires is a note nobody reads.
    const coverage = raceCoverage(rows, { start: START - 12, finish: START + 19 * 30 + 12 })

    expect(statesAGap(coverage.lead_gap_seconds, coverage)).toBe(false)
    expect(statesAGap(coverage.tail_gap_seconds, coverage)).toBe(false)
    expect(windowFindings(coverage, { low_speed_sog_knots: 2, rows: [] })).toEqual([])
  })

  it('states a gap longer than the cadence, which is race with no rows in it', () => {
    // 08-22-26-glr again: 1,155 seconds of a 30-second cadence is a logger stopped on the dock.
    const coverage = raceCoverage(rows, { start: START, finish: START + 19 * 30 + 1155 })

    expect(statesAGap(coverage.tail_gap_seconds, coverage)).toBe(true)
    expect(
      windowFindings(coverage, { low_speed_sog_knots: 2, rows: [] }).some((finding) =>
        finding.message.includes('19m 15s')
      )
    ).toBe(true)
  })

  it('states any gap at all where there is no cadence to compare it against', () => {
    const coverage = raceCoverage(rows, { start: START + 300, finish: START + 320 })

    expect(coverage.median_interval_seconds).toBeNull()
    expect(statesAGap(coverage.tail_gap_seconds, coverage)).toBe(true)
  })

  it('is never true of a gap of nothing', () => {
    const coverage = raceCoverage(rows, { start: START, finish: START + 19 * 30 })

    expect(coverage.lead_gap_seconds).toBe(0)
    expect(statesAGap(coverage.lead_gap_seconds, coverage)).toBe(false)
  })
})

describe('a duration a sailor can read', () => {
  it('states hours and minutes for a race, and never a bare second count', () => {
    expect(describeDuration(0)).toBe('0s')
    expect(describeDuration(45)).toBe('45s')
    expect(describeDuration(90)).toBe('1m 30s')
    expect(describeDuration(600)).toBe('10m')
    expect(describeDuration(3600)).toBe('1h')
    expect(describeDuration(4980)).toBe('1h 23m')
    // Seconds are dropped above an hour: nobody reads a distance race to the second.
    expect(describeDuration(4995)).toBe('1h 23m')
  })
})

/** Rows that move every 30 seconds and feed every channel: nothing to remark on. */
function cleanRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    row_index: index + 1,
    row_time: `2026-06-03T19:${String(Math.floor(index / 2)).padStart(2, '0')}:${
      index % 2 === 0 ? '00' : '30'
    }`,
    latitude: `41.${850 + index}`,
    longitude: `-87.${550 + index}`,
    cog: '10',
    sog: String(6 + index / 100),
    stw: '6.0',
    ctw: '12',
  }))
}

describe('what a recording says about itself', () => {
  const provenance: RecordingProvenance = {
    column_set: ['Date', 'Longitude', 'Latitude', 'SOG', 'TWS', 'TWA', 'AWA (calc)'],
    row_count: 100,
    median_cadence_seconds: 30,
    largest_gap_seconds: 30,
    span_seconds: 2970,
    backwards_steps: 0,
    dead_channels: [],
    constant_channels: [],
  }

  const cleanQuality = assessRowQuality(cleanRows(20))

  function findingsFor(overrides: {
    provenance?: Partial<RecordingProvenance>
    quality?: Partial<TranscriptionQuality>
    duplicate_filenames?: string[]
  }) {
    return recordingFindings({
      provenance: { ...provenance, ...overrides.provenance },
      quality: { ...cleanQuality, ...overrides.quality },
      date_order_evidence: 'proven',
      duplicate_filenames: overrides.duplicate_filenames ?? [],
    })
  }

  it('says nothing about a clean file beyond its cadence', () => {
    const findings = findingsFor({})

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('note')
    expect(findings[0].message).toContain('30s')
  })

  it('asks for a confirmation, and only ever one, for a file already in the archive', () => {
    // The same bytes uploaded twice is nearly always a mistake and is occasionally deliberate —
    // one race sailed on two boats' loggers. So it stops and asks rather than refusing (ADR 0009).
    const findings = findingsFor({ duplicate_filenames: ['06-03-26-beer-can.csv'] })
    const confirmations = findings.filter((finding) => finding.severity === 'confirmation')

    expect(confirmations).toHaveLength(1)
    expect(confirmations[0].message).toContain('06-03-26-beer-can.csv')
  })

  it('never refuses, whatever it finds', () => {
    // The only refusals are the parse's and the window's. A note that blocked would be a third.
    const findings = findingsFor({
      provenance: { dead_channels: ['TWS', 'TWA'], largest_gap_seconds: 7200, backwards_steps: 3 },
      quality: { dropout_channels: [] },
      duplicate_filenames: ['06-03-26-beer-can.csv'],
    })

    expect(findings.some((finding) => finding.severity === 'refusal')).toBe(false)
  })

  it('names a channel the boat never fed, so a flat chart is explained', () => {
    const findings = findingsFor({ provenance: { dead_channels: ['TWA'] } })

    expect(findings.some((finding) => finding.message.includes('TWA'))).toBe(true)
  })

  it('says a gap in the recording is a gap, and how long', () => {
    const findings = findingsFor({ provenance: { largest_gap_seconds: 7200 } })

    expect(findings.some((finding) => finding.message.includes('2h'))).toBe(true)
  })

  it('says when no dropout could be looked for at all, rather than showing none', () => {
    // No position means nothing to compare, which produces the same output as a clean track. The
    // difference between "no dropouts" and "could not tell" is the whole point of ADR 0009.
    const findings = findingsFor({ quality: { dropout_channels: [] } })

    expect(findings.some((finding) => finding.message.includes('could not'))).toBe(true)
  })

  it('says when the date order was assumed rather than proven', () => {
    const findings = recordingFindings({
      provenance,
      quality: cleanQuality,
      date_order_evidence: 'assumed',
      duplicate_filenames: [],
    })

    expect(findings.some((finding) => finding.message.includes('assum'))).toBe(true)
  })
})

describe('what a window says about itself', () => {
  /** Sixty rows: a nine-row dropout in the middle, and no water reference after row 40. */
  const rows = cleanRows(60).map((row, index) => ({
    ...row,
    latitude: index >= 10 && index < 20 ? '41.85' : row.latitude,
    longitude: index >= 10 && index < 20 ? '-87.55' : row.longitude,
    sog: index >= 10 && index < 20 ? '6.2' : row.sog,
    stw: index < 40 ? row.stw : null,
    ctw: index < 40 ? row.ctw : null,
  }))

  const stored = { window_start: '2026-06-03T19:00:00', window_finish: '2026-06-03T19:29:30' }
  const wholeQuality = assessRowQuality(rows)
  const coverage = raceCoverage(coverageRowsFrom(wholeQuality), raceWindowSeconds(stored))
  const quality = withinRaceWindow(wholeQuality, stored)

  it('states the frozen share as time, not as a row count', () => {
    const frozen = windowFindings(coverage, quality).find((finding) =>
      finding.message.includes('copy')
    )

    expect(frozen).toBeDefined()
    // 270 of the window's 1,770 seconds are a dead feed. A race page must not be the place a
    // sailor learns to convert rows into minutes.
    expect(frozen?.message).toContain('4m 30s')
    expect(frozen?.message).not.toMatch(/\d+ rows/)
  })

  it('states the not-water-referenced share, because those wind figures mean something else', () => {
    expect(
      windowFindings(coverage, quality).some((finding) => finding.message.includes('water'))
    ).toBe(true)
  })

  it('is all notes', () => {
    expect(windowFindings(coverage, quality).every((each) => each.severity === 'note')).toBe(true)
  })

  it('says nothing where there is nothing to say', () => {
    const clean = cleanRows(20)
    const cleanWindow = {
      window_start: '2026-06-03T19:00:00',
      window_finish: '2026-06-03T19:09:30',
    }
    const cleanQuality = assessRowQuality(clean)

    expect(
      windowFindings(
        raceCoverage(coverageRowsFrom(cleanQuality), raceWindowSeconds(cleanWindow)),
        withinRaceWindow(cleanQuality, cleanWindow)
      )
    ).toEqual([])
  })
})

describeArchive('over the owner’s recordings and their real windows', () => {
  /** The coverage of one archive race, computed the way the race page will compute it. */
  function coverageOf(filename: string) {
    const { transcription } = transcribe(filename)
    const stored = raceWindowFor(filename)
    const quality = assessRowQuality(transcription.rows)

    return {
      stored,
      quality,
      coverage: raceCoverage(coverageRowsFrom(quality), raceWindowSeconds(stored)),
    }
  }

  it.each(archiveFilenames)('%s partitions its window into four', (filename) => {
    const { coverage } = coverageOf(filename)

    expect(coverage.row_count).toBeGreaterThan(0)
    expect(coverage.lead_gap_seconds).toBeGreaterThanOrEqual(0)
    expect(coverage.tail_gap_seconds).toBeGreaterThanOrEqual(0)

    // Every clock in the archive goes forwards, so the identity has to hold for all thirteen. A
    // recording that broke it would be announced by `backwards_steps` rather than by a shortfall
    // nobody could see.
    expect(coverage.backwards_steps).toBe(0)
    expect(
      coverage.lead_gap_seconds +
        coverage.live_seconds +
        coverage.frozen_seconds +
        coverage.tail_gap_seconds
    ).toBe(coverage.window_seconds)
  })

  it('finds the race whose window outlives its recording, and states the gap', () => {
    // Why a finish past the last row is legal rather than a refusal: it is in the archive. The
    // logger was stopped on the dock and the race still finished when it finished.
    const { coverage, quality, stored } = coverageOf('08-22-26-glr.csv')

    expect(coverage.tail_gap_seconds).toBe(1155)
    expect(
      windowFindings(coverage, withinRaceWindow(quality, stored)).some((finding) =>
        finding.message.includes('19m 15s')
      )
    ).toBe(true)
  })

  it('finds the race that is substantially a dead feed, and states it as time', () => {
    // One race in the season is around half frozen. If coverage ever stopped separating a copied
    // row from a sailed one, this is the file that would quietly start reading as a clean track.
    const worst = archiveFilenames
      .map((filename) => coverageOf(filename).coverage)
      .reduce((worse, next) =>
        next.frozen_seconds / next.window_seconds > worse.frozen_seconds / worse.window_seconds
          ? next
          : worse
      )

    expect(worst.frozen_seconds / worst.window_seconds).toBeGreaterThan(0.3)
  })
})

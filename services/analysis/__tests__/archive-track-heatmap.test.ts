/**
 * The **Race Track Heatmap** over the owner's real season, scored against the boat's own
 * certificate.
 *
 * The regression guard, pinned as counts rather than shapes, for the same reason Row Quality's,
 * Maneuvers' and Target Speed's are: these numbers decide what a race page draws, and the only way
 * to notice a rule drifting is to write down what the archive measures today and fail when it stops
 * measuring that.
 *
 * Needs the owner's recordings *and* the owner's Polar, so it skips loudly without either — see
 * `archive.ts` and `boat-setup.ts`.
 *
 * 🚨 **Both are read through `once()`, inside a test body.** Jest executes a `describe.skip`
 * callback at collection time and skips only the `it`s inside it, so a read at describe scope takes
 * the whole suite down on a machine that has neither.
 *
 * ## The two figures here that correct a document
 *
 * ADR 0033's prototype table reads this archive's Chicago–Waukegan recording as **258 rows, 64
 * scoreable**, and LAY-161's acceptance criteria quote that pair. Two of its columns reproduce
 * exactly — 82 Frozen and 23 Low-Speed — and two have moved, both for reasons the repo has already
 * decided:
 *
 *   - **113 rows are scoreable, not 64.** The 64 was measured under the single-scalar 52° floor
 *     that ADR 0036 replaced: trust is per-cell now, so a row sailed below that floor against real
 *     grid cells is scored, and one against a filler corner is scored *and flagged* rather than
 *     withheld. 31 of the 113 are **Filler-Anchored** here. Scoring 64 again would mean the floor
 *     came back.
 *   - **13 rows sit in a Maneuver Window, not 20.** `notCountableReason` gives each row one reason
 *     in its own order — Frozen, then Low-Speed, then in a Maneuver Window — so a row that is both
 *     Frozen and mid-tack is counted once, under Frozen. The prototype's 20 counted every row in a
 *     window, including ones already counted elsewhere. Both are true statements about the same
 *     recording; this suite pins the disjoint one, because that is the only accounting under which
 *     the counts under the legend add up to the race.
 *
 * Everything the ADR says about the *distance* race reproduces untouched, and it is the finding
 * that forced the **Dropout Bridge**: 815 Frozen rows out of 1,743 land on **three** positions.
 */

import { describeBoatSetup, ownPolar } from '@/services/analysis/__tests__/boat-setup'
import { analysisRows, analysisRowsWithin } from '@/services/analysis/countable'
import { detectManeuvers } from '@/services/analysis/maneuvers'
import { polarTargets } from '@/services/analysis/polar-targets'
import { readableRows } from '@/services/analysis/readable-rows'
import {
  dropoutDuration,
  raceTrackHeatmap,
  type TrackHeatmapRow,
} from '@/services/analysis/track-heatmap'
import {
  archiveFilenames,
  raceWindowFor,
  transcribe,
} from '@/services/recordings/__tests__/archive'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { RaceTrackHeatmap } from '@/types'

/** Needs the recordings as well as the certificate. */
const describeSeason = archiveFilenames.length > 0 ? describeBoatSetup : describe.skip

/** Deferred until first asked for, then kept — see the hazard at the top of this file. */
function once<T>(build: () => T): () => T {
  let cached: { value: T } | null = null
  return () => (cached ??= { value: build() }).value
}

const targets = once(() => polarTargets(ownPolar()))

/** One recording's rows with their verdicts, in the only order this is computed in. */
function trackRows(filename: string): TrackHeatmapRow[] {
  const rows = transcribe(filename).transcription.rows
  const quality = assessRowQuality(rows)

  // The same join `readRaceTrack` makes, through the same function, so what this suite measures is
  // what a race page draws rather than a parallel assembly of it.
  return readableRows(rows, analysisRows(quality, detectManeuvers(rows, quality)))
}

/** The whole recording drawn, which is the set the prototype's own table was measured over. */
function wholeRecording(filename: string): RaceTrackHeatmap {
  const heatmap = raceTrackHeatmap(trackRows(filename), targets())
  if (heatmap === null) throw new Error(`${filename} drew no track at all`)
  return heatmap
}

/** The Race Window drawn, which is what a race page actually shows. */
function raceWindow(filename: string): RaceTrackHeatmap {
  const heatmap = raceTrackHeatmap(
    analysisRowsWithin(trackRows(filename), raceWindowFor(filename)),
    targets()
  )
  if (heatmap === null) throw new Error(`${filename} drew no track inside its window`)
  return heatmap
}

const CHI_WAUK = '06-20-26-chi-wauk.csv'
const ST_JOE = '09-04-2026-chicago-st-joe.csv'

describeSeason('Chicago–Waukegan, the race a quarter of which is scoreable', () => {
  const whole = once(() => wholeRecording(CHI_WAUK))
  const window = once(() => raceWindow(CHI_WAUK))

  it('draws all 258 rows and reproduces the Frozen and Low-Speed counts exactly', () => {
    expect(whole().counts.rows).toBe(258)
    // Every one of them is on the track: a design that drew only what it can colour would draw
    // less than half of this race (ADR 0033).
    expect(whole().counts.with_fix).toBe(258)
    expect(whole().counts.frozen).toBe(82)
    expect(whole().counts.low_speed).toBe(23)
    expect(whole().counts.maneuver_window).toBe(13)
  })

  it('scores 113 of them because trust is per cell, and flags 31 as Filler-Anchored', () => {
    // The ADR's 64 was the scalar floor's answer. Under ADR 0036 a row sailed below it is scored,
    // and a row anchored on filler is scored *and marked* — never left uncoloured.
    expect(whole().counts.scored).toBe(113)
    expect(whole().counts.filler_anchored).toBe(31)
    expect(whole().counts.without_target).toBe(27)

    // 145 of 258 drawn and not scored, which is the sentence the legend states in words.
    expect(whole().counts.rows - whole().counts.scored).toBe(145)
  })

  it('accounts for every row in exactly one tally', () => {
    const { rows, scored, frozen, low_speed, maneuver_window, without_target } = whole().counts

    expect(scored + frozen + low_speed + maneuver_window + without_target).toBe(rows)
  })

  it('rings 50 frozen rows inside the window on 11 positions, and bridges every gap', () => {
    // The window is the race, and it holds 50 of the recording's 82 Frozen rows — the rest are on
    // the delivery either side. Eleven positions for fifty rows is the whole argument for the
    // bridge: a ring per row would be fifty rings nobody can see.
    expect(window().rings).toHaveLength(50)
    expect(new Set(window().rings.map((ring) => `${ring.cx},${ring.cy}`)).size).toBe(11)
    expect(window().bridges).toHaveLength(10)
  })

  it('labels the longest gap in this race 57m, which is the duration the recording measured', () => {
    const longest = window().bridges.reduce((worst, bridge) =>
      bridge.seconds > worst.seconds ? bridge : worst
    )

    expect(longest.rows).toBe(2)
    // Two rows of dropout and nearly an hour of water: exactly the case ringing alone cannot
    // report, and the number ADR 0033 uses as its own example of a label.
    expect(dropoutDuration(longest.seconds)).toBe('57m')
  })
})

describeSeason('Chicago–St Joe, the race whose feed was dead 47% of the time', () => {
  const whole = once(() => wholeRecording(ST_JOE))

  it('is 815 Frozen rows of 1,743 — and they land on three positions', () => {
    expect(whole().counts.rows).toBe(1743)
    expect(whole().counts.frozen).toBe(815)
    expect(whole().counts.frozen / whole().counts.rows).toBeCloseTo(0.47, 2)

    // The finding that forced the bridge, measured: 815 rings stacked onto three pixels. A map
    // that ringed Frozen rows and stopped there would discharge ADR 0014's obligation on paper and
    // show a clean track of a boat that was not transmitting.
    expect(whole().rings).toHaveLength(815)
    expect(new Set(whole().rings.map((ring) => `${ring.cx},${ring.cy}`)).size).toBe(3)
  })

  it('renders as rings and three labelled gaps rather than a solid line', () => {
    expect(whole().bridges).toHaveLength(3)
    expect(whole().bridges.map((bridge) => dropoutDuration(bridge.seconds))).toEqual([
      '2h11',
      '2h11',
      '2h27',
    ])
    expect(whole().bridges.map((bridge) => bridge.rows)).toEqual([261, 262, 292])

    // And no segment is drawn across any of it: 928 rows carry a live fix, in four runs, so the
    // track is 924 legs rather than one unbroken line through five hours of dead feed.
    expect(whole().segments).toHaveLength(924)
  })

  it('still scores the three quarters of it that are a measurement', () => {
    expect(whole().counts.scored).toBe(773)
    expect(whole().counts.filler_anchored).toBe(102)
  })
})

describeSeason('every race in the archive', () => {
  const season = once(() =>
    archiveFilenames.map((filename) => ({ filename, heatmap: raceWindow(filename) }))
  )

  it('draws a track for all thirteen without a single row throwing', () => {
    expect(season()).toHaveLength(13)
    expect(season().every(({ heatmap }) => heatmap.segments.length > 0)).toBe(true)
  })

  it('keeps the frame the same size whatever shape the race was', () => {
    // A 20-minute beer can and a 25nm point-to-point get the same box, so the page does not reflow
    // between races and the scale bar means something at every zoom (ADR 0033).
    expect(new Set(season().map(({ heatmap }) => `${heatmap.width}x${heatmap.height}`))).toEqual(
      new Set(['360x440'])
    )
  })

  it('accounts for every row of every race, in one tally each', () => {
    season().forEach(({ filename, heatmap }) => {
      const { rows, scored, frozen, low_speed, maneuver_window, without_target } = heatmap.counts

      expect({
        filename,
        tallied: scored + frozen + low_speed + maneuver_window + without_target,
      }).toEqual({ filename, tallied: rows })
    })
  })

  it('leaves no live fix undrawn: the legs and the runs account for all of them', () => {
    // Every row in this archive carries a position, so each race's live fixes are its rows less
    // its Frozen ones, and they are drawn as runs of joined legs — a run per dropout, plus one. A
    // run of `n` fixes is `n − 1` legs, so `live − legs` *is* the number of runs, and that it
    // equals `bridges + 1` is the arithmetic statement of "nothing fell off the track".
    season().forEach(({ filename, heatmap }) => {
      const { rows, frozen, with_fix } = heatmap.counts
      expect(with_fix).toBe(rows)

      const runs = rows - frozen - heatmap.segments.length
      expect({ filename, runs }).toEqual({ filename, runs: heatmap.bridges.length + 1 })
    })
  })

  it('plots the lone fixes this season really has rather than losing them', () => {
    // Not a hypothetical. Chicago–Waukegan's window loses its feed seventeen times, and twice it
    // comes back for exactly **one** fix before dying again. A run of one cannot be a polyline, so
    // those two rows were counted and drawn nowhere until they were plotted as points — the only
    // two rows in thirteen races where "every recorded row is drawn" was false.
    const lone = season()
      .filter(({ heatmap }) => heatmap.points.length > 0)
      .map(({ filename, heatmap }) => ({ filename, points: heatmap.points.length }))

    expect(lone).toEqual([{ filename: CHI_WAUK, points: 2 }])
  })

  it('never colours a row no metric may read', () => {
    // The one rule the whole screen rests on, asserted over the real season rather than a fixture:
    // nothing that is not a measurement borrows a step of the ramp.
    season().forEach(({ heatmap }) => {
      expect(heatmap.counts.scored).toBeLessThanOrEqual(
        heatmap.counts.rows -
          heatmap.counts.frozen -
          heatmap.counts.low_speed -
          heatmap.counts.maneuver_window
      )
    })
  })

  it('finds Filler-Anchored rows in this season, and colours every one of them', () => {
    // If this stopped being true the marker would be dead code and the certificate's filler would
    // be silently excluded again (ADR 0036).
    const flagged = season().flatMap(({ heatmap }) =>
      heatmap.segments.filter((segment) => segment.filler_anchored)
    )

    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged.every((segment) => segment.band !== null)).toBe(true)
  })
})

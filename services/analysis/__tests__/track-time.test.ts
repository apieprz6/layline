/**
 * The **Race Track Heatmap** in time: how long each overlay spent in each band, what it left
 * uncoloured and why, and the race as runs (ADR 0037, ADR 0038).
 *
 * Two claims carry this suite. **Every second of the window is somewhere**: an overlay's band time
 * and its uncoloured time are the Race Window, so nothing a sailor set is silently missing from a
 * figure. **A run is the picture the map draws**: merged, in time order, and never across a
 * Dropout or a stretch the overlay leaves uncoloured, because those are runs of their own.
 */

import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'
import type { RaceTrackHeatmap, TrackOverlayTime } from '@/types'

import { TARGETS, row, stamp } from './track-rows'

/** A minute either side of five rows at 30-second cadence: 19:00:00 to 19:02:00. */
const WINDOW = { window_start: '2026-06-03T18:59:00', window_finish: '2026-06-03T19:03:00' }

function heatmapOf(...args: Parameters<typeof raceTrackHeatmap>): RaceTrackHeatmap {
  const heatmap = raceTrackHeatmap(...args)
  if (heatmap === null) throw new Error('the fixture drew no track')
  return heatmap
}

/** The time in each band with any, as `band: seconds`. */
function bandSeconds(time: TrackOverlayTime): Record<string, number> {
  return Object.fromEntries(
    time.bands.filter((band) => band.seconds > 0).map((band) => [band.band, band.seconds])
  )
}

function uncolouredSeconds(time: TrackOverlayTime): Record<string, number> {
  return Object.fromEntries(time.uncoloured.map((part) => [part.reason, part.seconds]))
}

describe('a track’s time in each band', () => {
  const rows = [
    row(0),
    row(1, { low_speed: true, sog: '1.1' }),
    row(2, { maneuver: 'tack' }),
    row(3),
    row(4),
  ]

  it('accounts for the whole window on every overlay: band time plus uncoloured time', () => {
    const { time } = heatmapOf(rows, TARGETS, { window: WINDOW })

    expect(time.window_seconds).toBe(240)
    for (const overlay of Object.values(time.overlays)) {
      const bands = overlay.bands.reduce((total, band) => total + band.seconds, 0)
      const parts = overlay.uncoloured.reduce((total, part) => total + part.seconds, 0)

      expect(bands).toBe(overlay.coloured_seconds)
      expect(parts).toBe(overlay.uncoloured_seconds)
      expect(overlay.coloured_seconds + overlay.uncoloured_seconds).toBe(240)
    }
  })

  it('times a ratio over Countable rows only, and a reading over every live one', () => {
    const { time } = heatmapOf(rows, TARGETS, { window: WINDOW })

    // Each row is the 30 seconds it arrives at; the first arrives at nothing, the window's own
    // minute before it is the recording not yet started.
    expect(bandSeconds(time.overlays.target_speed)).toEqual({ 'track-at': 60 })
    expect(uncolouredSeconds(time.overlays.target_speed)).toEqual({
      before_first_row: 60,
      after_last_row: 60,
      low_speed: 30,
      maneuver_window: 30,
    })

    // The parked row keeps its speed over the ground: it is what the GPS recorded (ADR 0038).
    expect(bandSeconds(time.overlays.sog)).toEqual({ 'track-speed-1': 30, 'track-speed-4': 90 })
    expect(uncolouredSeconds(time.overlays.sog)).toEqual({ before_first_row: 60, after_last_row: 60 })
  })

  it('lists every step of the scale, in its own order, a step with no time in it included', () => {
    const { time } = heatmapOf(rows, TARGETS, { window: WINDOW })

    expect(time.overlays.twa.bands.map((band) => band.band)).toEqual([
      'track-port-3',
      'track-port-2',
      'track-port-1',
      'track-stbd-1',
      'track-stbd-2',
      'track-stbd-3',
    ])
    // TWA 55 is close-hauled on starboard, so the tack split is the scale's own.
    expect(bandSeconds(time.overlays.twa)).toEqual({ 'track-stbd-1': 120 })
  })

  it('carries the Filler-Anchored share of a ratio’s band time, and none on a reading', () => {
    // TWA 45 brackets the certificate's manufactured 40° row, so every target here is filler.
    const filler = [0, 1, 2].map((index) => row(index, { twa: '45' }))
    const { time } = heatmapOf(filler, TARGETS)

    expect(time.overlays.target_speed.coloured_seconds).toBe(60)
    expect(time.overlays.target_speed.filler_anchored_seconds).toBe(60)
    expect(time.overlays.sog.filler_anchored_seconds).toBe(0)
    expect(time.overlays.target_speed.bands.every((band) => band.filler_anchored_seconds === band.seconds)).toBe(true)
  })

  it('spans only the rows where no window is given', () => {
    const { time } = heatmapOf(rows, TARGETS)

    expect(time.window_seconds).toBe(120)
    expect(uncolouredSeconds(time.overlays.sog)).toEqual({})
  })

  it('states a row it would colour but cannot draw as having no position', () => {
    const { time } = heatmapOf([row(0), row(1), row(2, { positioned: false }), row(3)], TARGETS)

    expect(uncolouredSeconds(time.overlays.sog)).toEqual({ no_position: 30 })
  })

  it('keeps each of the sail overlay’s no-verdict reasons apart from Differs', () => {
    const sail = (agreement: 'differs' | 'no_sail_recorded' | 'no_chart_cell' | 'sail_unnamed') => ({
      agreement,
      flown: null,
      recommended: null,
    })
    const sailing = [
      row(0),
      { ...row(1), sail: sail('differs') },
      { ...row(2), sail: sail('no_sail_recorded') },
      { ...row(3), sail: sail('no_chart_cell') },
      { ...row(4), sail: sail('sail_unnamed') },
    ]
    const { time } = heatmapOf(sailing, TARGETS)

    expect(bandSeconds(time.overlays.sail)).toEqual({ 'track-differ': 30 })
    expect(uncolouredSeconds(time.overlays.sail)).toEqual({
      no_sail_recorded: 30,
      no_chart_cell: 30,
      sail_unnamed: 30,
    })
  })
})

describe('a track as runs', () => {
  it('merges consecutive stretches in one state, in time order, across the whole window', () => {
    const rows = [
      row(0),
      row(1, { low_speed: true, sog: '1.1' }),
      row(2, { maneuver: 'tack' }),
      row(3),
      row(4),
    ]
    const { runs } = heatmapOf(rows, TARGETS, { window: WINDOW })

    expect(runs.target_speed).toEqual([
      { from: WINDOW.window_start, to: stamp(0), seconds: 60, band: null, reason: 'before_first_row', filler_anchored_seconds: 0 },
      { from: stamp(0), to: stamp(1), seconds: 30, band: null, reason: 'low_speed', filler_anchored_seconds: 0 },
      { from: stamp(1), to: stamp(2), seconds: 30, band: null, reason: 'maneuver_window', filler_anchored_seconds: 0 },
      { from: stamp(2), to: stamp(4), seconds: 60, band: 'track-at', reason: null, filler_anchored_seconds: 0 },
      { from: stamp(4), to: WINDOW.window_finish, seconds: 60, band: null, reason: 'after_last_row', filler_anchored_seconds: 0 },
    ])
  })

  it('never bridges a Dropout: the frozen stretch is a run of its own between two in one band', () => {
    const rows = [
      row(0),
      row(1),
      row(2, { frozen: true }),
      row(3, { frozen: true }),
      row(4),
      row(5),
    ]
    const { runs } = heatmapOf(rows, TARGETS)

    // The interval landing on the first live fix is the end of the bridge, not a coloured leg.
    expect(runs.sog.map(({ from, to, band, reason }) => ({ from, to, band, reason }))).toEqual([
      { from: stamp(0), to: stamp(1), band: 'track-speed-4', reason: null },
      { from: stamp(1), to: stamp(3), band: null, reason: 'frozen' },
      { from: stamp(3), to: stamp(4), band: null, reason: 'bridged' },
      { from: stamp(4), to: stamp(5), band: 'track-speed-4', reason: null },
    ])
  })

  it('spans a Dropout’s bridge exactly with its frozen and bridged runs', () => {
    const rows = [row(0), row(1), row(2, { frozen: true }), row(3, { frozen: true }), row(4), row(5)]
    const heatmap = heatmapOf(rows, TARGETS)
    const [bridge] = heatmap.bridges
    const dropout = heatmap.runs.target_speed.filter(
      (run) => run.reason === 'frozen' || run.reason === 'bridged'
    )

    expect(dropout[0].from).toBe(bridge.from)
    expect(dropout[dropout.length - 1].to).toBe(bridge.to)
    expect(dropout.reduce((total, run) => total + run.seconds, 0)).toBe(bridge.seconds)
  })

  it('keeps the frozen time to the dead rows themselves, as the coverage readout counts it', () => {
    const rows = [row(0), row(1), row(2, { frozen: true }), row(3, { frozen: true }), row(4), row(5)]
    const { time } = heatmapOf(rows, TARGETS)

    expect(uncolouredSeconds(time.overlays.sog)).toEqual({ frozen: 60, bridged: 30 })
  })

  it('agrees with the overlay’s own time: the runs in a band sum to the band', () => {
    const rows = [row(0), row(1), row(2, { frozen: true }), row(3), row(4, { sog: '3.5' }), row(5)]
    const heatmap = heatmapOf(rows, TARGETS, { window: WINDOW })

    for (const band of heatmap.time.overlays.sog.bands) {
      const inRuns = heatmap.runs.sog
        .filter((run) => run.band === band.band)
        .reduce((total, run) => total + run.seconds, 0)
      expect(inRuns).toBe(band.seconds)
    }
  })
})

describe('a Dropout, as the map bridges it', () => {
  it('states when the bridge starts and lands, beside its duration', () => {
    const rows = [row(0), row(1), row(2, { frozen: true }), row(3, { frozen: true }), row(4)]
    const heatmap = heatmapOf(rows, TARGETS)

    expect(heatmap.bridges).toHaveLength(1)
    expect(heatmap.bridges[0]).toMatchObject({ from: stamp(1), to: stamp(4), seconds: 90, rows: 2 })
  })
})

describe('Testimony the map could not place', () => {
  it('is still stated, with what the sailor said and when', () => {
    const heatmap = heatmapOf([row(0), row(1), row(2)], TARGETS, {
      annotations: [
        { at: stamp(1), lane: 'sail', label: 'Main + A2' },
        { at: '2026-06-03T21:00:00', lane: 'sea', label: 'Choppy' },
      ],
    })

    expect(heatmap.annotations.map((annotation) => annotation.label)).toEqual(['Main + A2'])
    expect(heatmap.unplaced_annotations).toEqual([
      { at: '2026-06-03T21:00:00', lane: 'sea', label: 'Choppy' },
    ])
  })
})

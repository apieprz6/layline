/**
 * The projection the chart stack draws from.
 *
 * Two claims are load-bearing enough that the ticket names them, and both are about not
 * fabricating: a missing value must reach the chart as missing rather than as a zero, and an
 * angle's axis must be a fact about the file rather than about whichever rows happen to be
 * inside the window. The rest of this suite is the arrays lining up row for row, because every
 * mark on both charts is drawn by index.
 */

import {
  RACE_CHANNELS,
  raceChannel,
  raceChartAxis,
  raceChartSeries,
  raceChartSpans,
} from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import { wallClockSeconds } from '@/services/recordings/wall-clock'
import type { Transcription, TranscriptionChannels, TranscriptionRow } from '@/types'

import { archiveFilenames, describeArchive, transcribe } from './archive'

const BLANK: TranscriptionChannels = {
  longitude: null,
  latitude: null,
  cog: null,
  sog: null,
  twd: null,
  tws: null,
  twa: null,
  gwd: null,
  gws: null,
  ctw: null,
  stw: null,
  pol: null,
  pre: null,
  xte: null,
  rpm: null,
  twa_calc: null,
  awa_calc: null,
  aws_calc: null,
  alarm: null,
  observations: null,
}

/** A row at a whole minute past 19:00, carrying only what a test names. */
function row(index: number, values: Partial<TranscriptionChannels> = {}): TranscriptionRow {
  const at = `2026-06-03T19:${String(index - 1).padStart(2, '0')}:00`
  return {
    ...BLANK,
    ...values,
    row_index: index,
    date_verbatim: at,
    row_time: at,
    extras: null,
  }
}

function transcriptionOf(
  rows: TranscriptionRow[]
): Pick<Transcription, 'rows' | 'first_row_time' | 'last_row_time'> {
  return {
    rows,
    first_row_time: rows[0].row_time,
    last_row_time: rows[rows.length - 1].row_time,
  }
}

/** A projection of rows, with Row Quality assessed over those same rows. */
function project(rows: TranscriptionRow[]) {
  return raceChartSeries(transcriptionOf(rows), assessRowQuality(rows))
}

describe('a missing value stays missing', () => {
  it('draws a blank channel as absent rather than as zero', () => {
    // `Number('')` and `Number(null)` are both 0, which would put this boat on the equator and
    // its wind dead ahead. Every one of these has to survive as null.
    const series = project([
      row(1, { latitude: '41.85', longitude: '-87.55', sog: '6.2', tws: '11.4', twa: '45' }),
      row(2, { latitude: '41.86', longitude: '-87.54' }),
      row(3, { latitude: '41.87', longitude: '-87.53', sog: '6.4', tws: '11.9', twa: '47' }),
    ])

    expect(series.channels.sog).toEqual([6.2, null, 6.4])
    expect(series.channels.tws).toEqual([11.4, null, 11.9])
    expect(series.channels.twa).toEqual([45, null, 47])
    // Not one channel in the file fed AWA, and a dead channel is absent throughout, not flat zero.
    expect(series.channels.awa).toEqual([null, null, null])
  })

  it('keeps a negative wind angle, because −1 is an angle and not a sentinel', () => {
    const series = project([
      row(1, { twa: '-1', awa_calc: '-1' }),
      row(2, { twa: '0', awa_calc: '0' }),
    ])

    expect(series.channels.twa).toEqual([-1, 0])
    expect(series.channels.awa).toEqual([-1, 0])
  })

  it('drops a position that is absent without shifting the rows after it', () => {
    const series = project([
      row(1, { latitude: '41.85', longitude: '-87.55' }),
      row(2),
      row(3, { latitude: '41.87', longitude: '-87.53' }),
    ])

    expect(series.latitude).toEqual([41.85, null, 41.87])
    expect(series.longitude).toEqual([-87.55, null, -87.53])
  })
})

describe('an angle axis is a fact about the file', () => {
  it('signs a channel the file writes negative anywhere, not only inside the window', () => {
    // One port-tack sample at the very top of a recording whose race is sailed on starboard. The
    // axis has to be −180..180 for the whole recording, or cropping the window would rescale it.
    const series = project([row(1, { twa: '-42' }), row(2, { twa: '38' }), row(3, { twa: '41' })])

    expect(series.signed.twa).toBe(true)
  })

  it('leaves a channel unsigned where the file never writes one', () => {
    const series = project([row(1, { awa_calc: '38' }), row(2, { awa_calc: '150' })])

    expect(series.signed.awa).toBe(false)
  })

  it('never signs a speed, whatever a stray sample says', () => {
    // A negative speed over ground is not a direction, so a signed axis would only hand half the
    // chart to a bad sample.
    const series = project([row(1, { sog: '-0.1' }), row(2, { sog: '6.2' })])

    expect(series.signed.sog).toBe(false)
    expect(series.signed.tws).toBe(false)
    // The value itself is still what the file said. Nothing here clamps.
    expect(series.channels.sog).toEqual([-0.1, 6.2])
  })
})

describe('every array describes the same rows', () => {
  const rows = [
    row(1, { latitude: '41.85', longitude: '-87.55', cog: '10', sog: '6.2', stw: '6.0', ctw: '12' }),
    row(2, { latitude: '41.85', longitude: '-87.55', cog: '10', sog: '6.2' }),
    row(3, { latitude: '41.85', longitude: '-87.55', cog: '10', sog: '6.2' }),
    row(4, { latitude: '41.87', longitude: '-87.53', cog: '14', sog: '6.4', stw: '6.1', ctw: '15' }),
  ]

  it('is the same length throughout, so index means one row on both charts', () => {
    const series = project(rows)

    expect(series.row_seconds).toHaveLength(rows.length)
    expect(series.latitude).toHaveLength(rows.length)
    expect(series.longitude).toHaveLength(rows.length)
    expect(series.frozen).toHaveLength(rows.length)
    expect(series.not_water_referenced).toHaveLength(rows.length)
    expect(series.low_speed).toHaveLength(rows.length)
    for (const channel of RACE_CHANNELS) {
      expect(series.channels[channel.key]).toHaveLength(rows.length)
    }
  })

  it('carries the Dropout through, so the map can ring it and the chart can hatch it', () => {
    const series = project(rows)

    // Rows 2 and 3 repeat row 1's position, course and speed verbatim: a dead feed, not a boat
    // sitting still, and both charts have to break their line through them.
    expect(series.frozen).toEqual([false, true, true, false])
    expect(series.dropout_channels).toEqual(['latitude', 'longitude', 'cog', 'sog'])
  })

  it('carries not-water-referenced through, which is what the blue wash marks', () => {
    expect(project(rows).not_water_referenced).toEqual([false, true, true, false])
  })

  it('carries Low-Speed through, so Review states it rather than the race page finding it later', () => {
    // Independent of Frozen on purpose: a drifting boat is slow and alive, and a dead feed at
    // six knots is neither. The wizard needs both flags to say what the race page will say.
    const series = project([row(1, { sog: '0.4' }), row(2, { sog: '6.2' })])

    expect(series.low_speed).toEqual([true, false])
    expect(series.frozen).toEqual([false, false])
  })

  it('refuses Row Quality that describes a different number of rows', () => {
    // Silently zipping a short assessment against the rows would ring the wrong boats.
    expect(() => raceChartSeries(transcriptionOf(rows), assessRowQuality(rows.slice(0, 2)))).toThrow(
      'the charts would mark the wrong rows Frozen'
    )
  })
})

describe('the shared time axis', () => {
  it('is absolute seconds in the recording’s own frame, so both charts read one number', () => {
    const rows = [row(1), row(2), row(3)]
    const series = project(rows)

    expect(series.row_seconds).toEqual(rows.map((each) => wallClockSeconds(each.row_time)))
    expect(series.row_seconds[1] - series.row_seconds[0]).toBe(60)
  })

  it('restates the recording’s bounds as the stamps they are', () => {
    const series = project([row(1), row(2)])

    expect(series.first_row_time).toBe('2026-06-03T19:00:00')
    expect(series.last_row_time).toBe('2026-06-03T19:01:00')
  })

  it('pads past the last row, because a window is allowed to reach past it', () => {
    // The whole reason the axis is not clamped: 08-22-26-glr's finish is 19 minutes past its last
    // row, and clamped, the finish handle would jam at the row and that gap would be undraggable.
    const axis = raceChartAxis({ row_seconds: [0, 30, 60] })

    expect(axis.first).toBe(0)
    expect(axis.last).toBe(60)
    // Ten minutes is the floor, so a two-minute recording still has room to drag into.
    expect(axis.min).toBe(-600)
    expect(axis.max).toBe(660)
  })

  it('scales its slack to a long recording rather than leaving it at ten minutes', () => {
    const axis = raceChartAxis({ row_seconds: [1_000, 37_000] })

    expect(axis.min).toBe(1_000 - 3_600)
    expect(axis.max).toBe(37_000 + 3_600)
  })

  it('bounds by time and not by file position, so a clock that steps back stays on the axis', () => {
    // An autumn fall-back repeats an hour, and the last row by position is then not the latest by
    // time. Taking file order would put an hour of the track off the end of the axis.
    const axis = raceChartAxis({ row_seconds: [7_200, 10_800, 7_200] })

    expect(axis.first).toBe(7_200)
    expect(axis.last).toBe(10_800)
  })
})

describe('the runs a flag marks', () => {
  it('covers the interval after a run’s last row, not just the row itself', () => {
    // A Dropout's final frozen row is still frozen for the interval that follows it. Stopping the
    // hatch at that row's own instant would leave the last sample of every dropout looking
    // measured.
    expect(raceChartSpans([0, 30, 60, 90], [false, true, true, false])).toEqual([
      { from: 30, to: 90 },
    ])
  })

  it('separates two runs rather than washing the live rows between them', () => {
    expect(raceChartSpans([0, 30, 60, 90, 120], [true, false, false, true, false])).toEqual([
      { from: 0, to: 30 },
      { from: 90, to: 120 },
    ])
  })

  it('stops a trailing run where the rows stop, since the file says nothing after them', () => {
    expect(raceChartSpans([0, 30, 60], [false, true, true])).toEqual([{ from: 30, to: 60 }])
  })

  it('finds nothing to draw where the flag is nowhere', () => {
    expect(raceChartSpans([0, 30, 60], [false, false, false])).toEqual([])
    expect(raceChartSpans([], [])).toEqual([])
  })
})

describe('the channels the pill row offers', () => {
  it('names the file’s own column, so a calculation is labelled as one', () => {
    // The boat has no apparent wind instrument. Calling this AWA without saying where it came
    // from would present qtVlm's arithmetic as a masthead reading (ADR 0008).
    expect(raceChannel('awa').source_column).toBe('AWA (calc)')
    expect(raceChannel('awa').provenance).toContain('calculated')
    // TWA is the reported one. `TWA (calc)` is transcribed and read by nothing.
    expect(raceChannel('twa').source_column).toBe('TWA')
  })

  it('scales angles and speeds differently, which is what fixes the angle axis', () => {
    expect(RACE_CHANNELS.map((channel) => channel.kind)).toEqual([
      'speed',
      'speed',
      'angle',
      'angle',
    ])
  })

  it('refuses a key it does not have rather than returning a channel-shaped nothing', () => {
    // @ts-expect-error — the guard exists for a key arriving from a URL or a stale draft.
    expect(() => raceChannel('vmg')).toThrow('no such channel')
  })
})

describeArchive('over the owner’s recordings', () => {
  it.each(archiveFilenames)('%s projects every row, with no value invented', (filename) => {
    const { transcription } = transcribe(filename)
    const series = raceChartSeries(transcription, assessRowQuality(transcription.rows))

    expect(series.row_seconds).toHaveLength(transcription.row_count)

    for (const channel of RACE_CHANNELS) {
      const values = series.channels[channel.key]
      const recorded = transcription.rows.map((each) => each[channel.field])

      // A null in and a null out, one for one: no channel gains a value it did not have, and
      // none loses one to a parse that produced NaN.
      expect(values.map((value) => value === null)).toEqual(
        recorded.map((value) => value === null)
      )
      expect(values.every((value) => value === null || Number.isFinite(value))).toBe(true)
    }

    // A `NaN` in a coordinate swallows a whole SVG path silently, so the map's arrays are held to
    // the same standard as the channels.
    expect(series.latitude.every((value) => value === null || Number.isFinite(value))).toBe(true)
    expect(series.longitude.every((value) => value === null || Number.isFinite(value))).toBe(true)
  })

  it('finds the season signs TWA and does not sign AWA, which is why the axes differ', () => {
    const signed = archiveFilenames.map((filename) => {
      const { transcription } = transcribe(filename)
      return raceChartSeries(transcription, assessRowQuality(transcription.rows)).signed
    })

    // qtVlm writes TWA negative to port, and `AWA (calc)` unsigned over 0..360. If this ever
    // flips, the fixed 0..180 scale for AWA is the thing that breaks.
    expect(signed.some((each) => each.twa)).toBe(true)
    expect(signed.every((each) => !each.awa)).toBe(true)
  })
})

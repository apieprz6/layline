/**
 * What the two charts draw, and — more to the point — what they refuse to draw.
 *
 * These are the claims a sailor cannot check for themselves. A dead instrument feed produces a
 * *plausible* trace: a flat line at the last real reading, and on a map, nothing at all, because the
 * boat sits at one pixel. So the assertions here are that the line is **broken** through those rows
 * and the stretch is marked — not that something colourful appeared.
 *
 * Geometry, deliberately, and not layout: jsdom hands out zero-sized boxes, so anything about drag
 * belongs in Playwright. What is checked here is arithmetic on the viewBox, which is fixed at 360 and
 * therefore the same in jsdom as on a phone.
 */

import { render } from '@testing-library/react'
import { raceChartAxis, raceChartSeries } from '@/services/recordings/chart-series'
import { assessRowQuality } from '@/services/recordings/row-quality'
import type { RaceChannelKey, TranscriptionChannels, TranscriptionRow } from '@/types'
import ChannelChart from '../ChannelChart'
import TrackMap from '../TrackMap'
import { AXIS_INSET_LEFT, AXIS_INSET_RIGHT, CHART_WIDTH, type StackMarker } from '../chart-geometry'

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

function row(index: number, values: Partial<TranscriptionChannels>): TranscriptionRow {
  const at = `2026-06-03T19:${String(index).padStart(2, '0')}:00`
  return { ...BLANK, ...values, row_index: index, date_verbatim: at, row_time: at, extras: null }
}

function seriesOf(rows: TranscriptionRow[]) {
  return raceChartSeries(
    { rows, first_row_time: rows[0].row_time, last_row_time: rows[rows.length - 1].row_time },
    assessRowQuality(rows)
  )
}

/** Six rows whose middle two repeat the pair before them verbatim: a Dropout, not a lull. */
const FROZEN_IN_THE_MIDDLE = [
  row(0, { latitude: '41.850', longitude: '-87.550', cog: '10', sog: '6.2' }),
  row(1, { latitude: '41.851', longitude: '-87.551', cog: '11', sog: '6.3' }),
  row(2, { latitude: '41.851', longitude: '-87.551', cog: '11', sog: '6.3' }),
  row(3, { latitude: '41.851', longitude: '-87.551', cog: '11', sog: '6.3' }),
  row(4, { latitude: '41.853', longitude: '-87.553', cog: '13', sog: '6.5' }),
  row(5, { latitude: '41.854', longitude: '-87.554', cog: '14', sog: '6.6' }),
]

function mapOf(rows: TranscriptionRow[]) {
  const series = seriesOf(rows)
  const axis = raceChartAxis(series)
  const { container } = render(
    <TrackMap
      series={series}
      axis={axis}
      window={{ start: axis.first, finish: axis.last }}
      height={214}
    />
  )
  return { container, series }
}

function chartOf(
  rows: TranscriptionRow[],
  channel: RaceChannelKey = 'sog',
  markers: StackMarker[] = []
) {
  const series = seriesOf(rows)
  const axis = raceChartAxis(series)
  const { container } = render(
    <ChannelChart
      series={series}
      channel={channel}
      axis={axis}
      window={{ start: axis.first, finish: axis.last }}
      height={124}
      markers={markers}
    />
  )
  return { container, series, axis }
}

function markerAt(at: number, key = 'm1'): StackMarker {
  return { key, at, lane: 'sail', label: 'main+j2', selected: false, incomplete: false, locked: true }
}

/**
 * The points of every polyline, as arrays of `[x, y]`.
 *
 * Every polyline is a run of at least two points; a reading a break leaves on its own is drawn as a
 * circle instead, so it is counted with `dots` below rather than here.
 */
function polylines(container: HTMLElement): [number, number][][] {
  return Array.from(container.querySelectorAll('polyline')).map((line) =>
    (line.getAttribute('points') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((pair) => pair.split(',').map(Number) as [number, number])
  )
}

/** The isolated readings a chart plotted, which are the ones no polyline could carry. */
function dots(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('circle[fill="var(--blue-500)"]'))
}

describe('the track map marks a Dropout rather than hiding it', () => {
  it('rings every frozen row', () => {
    const { container, series } = mapOf(FROZEN_IN_THE_MIDDLE)

    const frozen = series.frozen.filter(Boolean).length
    expect(frozen).toBe(2)
    // A frozen row sits on the previous row's pixel, so without the ring the run is invisible.
    const rings = container.querySelectorAll('circle[stroke="var(--wind-storm)"][r="3.4"]')
    expect(rings).toHaveLength(frozen)
  })

  it('breaks the track through them instead of drawing a line nobody sailed', () => {
    const { container } = mapOf(FROZEN_IN_THE_MIDDLE)

    // Two runs: rows 0–1 and rows 4–5. A single unbroken run would be a track through two minutes
    // the boat's own instruments never reported.
    const runs = polylines(container)
    expect(runs).toHaveLength(2)
  })

  it('breaks it at a missing fix too, and does not put the boat on the equator', () => {
    const { container } = mapOf([
      row(0, { latitude: '41.850', longitude: '-87.550' }),
      row(1, {}),
      row(2, { latitude: '41.852', longitude: '-87.552' }),
      row(3, { latitude: '41.853', longitude: '-87.553' }),
    ])

    // `Number(null)` is 0, and 0,0 is in the Gulf of Guinea. Every point drawn has to be one the
    // file gave, so the run with the hole in it is two runs — and here the first of those is row 0
    // alone.
    const runs = polylines(container)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(2)
    // Row 0's fix is not a line, but the boat was there. A run of one is plotted rather than
    // dropped, or a track that surfaced between two dropouts would be a map of nothing.
    expect(dots(container)).toHaveLength(1)
  })

  it('says so plainly when there is no position anywhere', () => {
    const { container } = mapOf([row(0, { sog: '6.2' }), row(1, { sog: '6.3' })])

    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toContain('no position fixes')
  })
})

describe('the channel chart marks a Dropout rather than hiding it', () => {
  it('hatches the stretch and breaks the trace through it', () => {
    const { container } = chartOf(FROZEN_IN_THE_MIDDLE)

    expect(container.querySelectorAll('rect[fill="url(#raceFrozenHatch)"]')).toHaveLength(1)
    // A dead feed at 6.3 knots draws a perfectly plausible flat line. Breaking it is the only
    // honest rendering: no reading arrived for those rows.
    expect(polylines(container)).toHaveLength(2)
  })

  it('leaves a missing value absent instead of drawing it as zero', () => {
    const { container, series } = chartOf([
      row(0, { sog: '6.2' }),
      row(1, {}),
      row(2, { sog: '6.4' }),
      row(3, { sog: '6.5' }),
    ])

    expect(series.channels.sog).toEqual([6.2, null, 6.4, 6.5])
    const runs = polylines(container)
    expect(runs).toHaveLength(1)
    // Nothing is drawn at the bottom of the plot for the blank row: `Number('')` is 0, and a zero
    // there would read as a boat that stopped.
    expect(runs[0]).toHaveLength(2)
    // Row 0's 6.2 knots is a reading the boat took, and one reading is not a line. It is a dot —
    // dropping it would erase a whole channel on a feed that alternates reading, blank, reading.
    expect(dots(container)).toHaveLength(1)
  })

  it('does not wash SOG for a missing STW, which does not affect it', () => {
    // No STW or CTW anywhere: the wind figures were computed from GPS, and SOG came from the GPS
    // either way. Washing it would mark a number that is not in question.
    const rows = [row(0, { sog: '6.2', tws: '11.4' }), row(1, { sog: '6.3', tws: '11.6' })]

    expect(
      chartOf(rows, 'sog').container.querySelectorAll('rect[fill="rgba(0,68,204,0.10)"]')
    ).toHaveLength(0)
    expect(
      chartOf(rows, 'tws').container.querySelectorAll('rect[fill="rgba(0,68,204,0.10)"]')
    ).toHaveLength(1)
  })
})

describe('an angle axis does not move under the sailor', () => {
  /** The y-axis tick labels, in the order they are drawn. */
  function ticks(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('text[text-anchor="end"]'))
      .map((each) => each.textContent ?? '')
      .filter((text) => /^-?\d+$/.test(text))
  }

  it('is a fixed 0–180 where the file never writes a negative', () => {
    const rows = [row(0, { twa: '40', awa_calc: '30' }), row(1, { twa: '150', awa_calc: '120' })]

    // The same four heights on both channels, so switching the pill does not rescale the chart.
    expect(ticks(chartOf(rows, 'twa').container)).toEqual(['0', '90', '180'])
    expect(ticks(chartOf(rows, 'awa').container)).toEqual(['0', '90', '180'])
  })

  it('is −180–180 where the file signs the channel anywhere at all', () => {
    // One port-tack sample in a race sailed on starboard. Judged over the whole recording, so
    // cropping the window can never change the axis (ADR 0014).
    const rows = [
      row(0, { twa: '-42' }),
      row(1, { twa: '38' }),
      row(2, { twa: '41' }),
      row(3, { twa: '44' }),
    ]

    expect(ticks(chartOf(rows, 'twa').container)).toEqual(['-180', '0', '90', '180'])
  })

  it('keeps −1 as an angle, since it is one', () => {
    const { series } = chartOf([row(0, { twa: '-1' }), row(1, { twa: '0' })], 'twa')

    expect(series.channels.twa).toEqual([-1, 0])
  })

  it('scales a speed to the file, with a floor under a drifter', () => {
    // 0.8 knots on a 0–1 axis would draw a drifter like a hurricane.
    const drifting = chartOf([row(0, { sog: '0.4' }), row(1, { sog: '0.8' })])
    expect(ticks(drifting.container)).toEqual(['0', '3', '6'])

    const breezy = chartOf([row(0, { sog: '6.2' }), row(1, { sog: '21.4' })])
    expect(ticks(breezy.container)).toEqual(['0', '11', '22'])
  })
})

/**
 * An annotation's time is unbounded by the recording — the sails were set before the boat's log
 * started — and the axis is drawn from the rows plus ten minutes of slack. So a legal entry can sit
 * off the chart, and an entry off the chart still has to be *on screen*: ADR 0014's rule is that an
 * annotation placed on an earlier step stays drawn, and a marker at a negative x is a marker gone.
 */
describe('the channel chart keeps every annotation on screen', () => {
  const ROWS = [row(0, { sog: '6.2' }), row(1, { sog: '6.3' }), row(2, { sog: '6.4' })]
  const AXIS = raceChartAxis(seriesOf(ROWS))

  function markerCentres(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll('circle[r="4.5"]')).map((circle) =>
      Number(circle.getAttribute('cx'))
    )
  }

  it('plots one inside the axis at its own time, with a line up to the trace', () => {
    const { container } = chartOf(ROWS, 'sog', [markerAt(AXIS.first)])

    const [cx] = markerCentres(container)
    expect(cx).toBeGreaterThan(AXIS_INSET_LEFT)
    expect(cx).toBeLessThan(CHART_WIDTH - AXIS_INSET_RIGHT)
    // Dashed leader up to the plot: the marker is a moment of this chart.
    expect(container.querySelectorAll('line[stroke-dasharray="2 2"]').length).toBeGreaterThan(0)
  })

  it('holds one from before the axis at the near edge, and says which way it went', () => {
    // An hour before the first row: legal testimony, and a full 50 minutes past the axis's slack.
    const { container } = chartOf(ROWS, 'sog', [markerAt(AXIS.first - 3600)])

    expect(markerCentres(container)[0]).toBe(AXIS_INSET_LEFT)
    // Drawn as a pin rather than a marker on the axis, so it cannot be read as a time on this chart.
    expect(container.querySelector('circle[r="4.5"]')?.getAttribute('stroke-dasharray')).toBe(
      '1.5 1.5'
    )
    expect(container.textContent).toContain('\u2039')
    expect(container.querySelectorAll('line[stroke-dasharray="2 2"]')).toHaveLength(0)
  })

  it('holds one from after the axis at the far edge', () => {
    const { container } = chartOf(ROWS, 'sog', [markerAt(AXIS.last + 3600)])

    expect(markerCentres(container)[0]).toBe(CHART_WIDTH - AXIS_INSET_RIGHT)
    expect(container.textContent).toContain('\u203a')
  })
})

/**
 * One viewBox, and so one scale, across every view of all three charts.
 *
 * This exists because the first version of these charts got it wrong in a way nobody would catch
 * reading a diff. Each chart is laid out `width: 100%` in the same column, so its viewBox width
 * alone decides how far its own units are magnified: 340 for the strip, 320 for the rose and 300
 * for the scatter meant three zoom levels on one screen, and at 390px the scatter's contents came
 * out 13% larger than the strip's. Nothing in the data justified it.
 *
 * So the assertion is on the markup rather than on a constant: every `<svg>` the three charts draw
 * must carry the same `viewBox`, whichever view is showing. A future chart that picks its own box
 * fails here.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompassChart from '@/components/boat/instrument-tuning/CompassChart'
import SpeedCheckChart from '@/components/boat/instrument-tuning/SpeedCheckChart'
import TackDial from '@/components/boat/instrument-tuning/TackDial'
import {
  CHART_FONT,
  TUNING_CHART_WIDTH,
  TUNING_VIEW_BOX,
} from '@/components/boat/instrument-tuning/chart-furniture'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'

import { asymmetryEra, era, pair, raceAsymmetry, raceBins, raceDivergence, raceHeading, headingEra, speedEra, speedPoints } from './fixtures'

const LOG = buildCalibrationLog([], [])

function compass() {
  const races = [raceHeading('r1', '2026-07-10 19:00:00', raceBins({ 0: { mean: 12, rows: 40 } }))]
  return <CompassChart era={headingEra(races)} previous={null} log={LOG} labels={{}} />
}

function dial() {
  const races = [raceAsymmetry('r1', '2026-06-03 19:00:00', [pair('upwind', 36, 46)])]
  return (
    <TackDial
      season={asymmetryEra(races)}
      eras={[asymmetryEra(races, { era: era('AWA', null) })]}
      compassEras={[asymmetryEra(races, { era: era('HDG', null) })]}
      log={LOG}
      labels={{}}
    />
  )
}

function speed() {
  const races = [raceDivergence('r1', '2026-06-03 19:00:00', speedPoints(40, 0.2))]
  const one = speedEra(races)
  return <SpeedCheckChart byMethod={{ orthogonal: one, 'sog-on-stw': one }} log={LOG} labels={{}} />
}

/** Every `<svg>` a chart drew, by its own viewBox. The rail's is furniture and not a chart. */
function viewBoxes(container: HTMLElement): string[] {
  return [...container.querySelectorAll('svg')]
    .filter((svg) => !(svg.closest('[data-testid^="calibration-rail"]') !== null))
    .map((svg) => svg.getAttribute('viewBox') ?? 'none')
}

describe('every chart is drawn in one box, so every chart is drawn at one scale', () => {
  it('draws the compass strip and its rose in the same box', async () => {
    const { container } = render(compass())

    expect(viewBoxes(container)).toEqual([TUNING_VIEW_BOX])

    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))

    // A rose in a narrower box would be magnified relative to the strip it replaced — and the
    // replacement happens under the finger that just tapped a heading.
    expect(viewBoxes(container)).toEqual([TUNING_VIEW_BOX])
  })

  it('draws the Tack Dial in the same box as the compass', () => {
    expect(viewBoxes(render(dial()).container)).toEqual([TUNING_VIEW_BOX])
  })

  it('draws the scatter and the gap view in the same box as both', async () => {
    const { container } = render(speed())

    expect(viewBoxes(container)).toEqual([TUNING_VIEW_BOX])

    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    expect(viewBoxes(container)).toEqual([TUNING_VIEW_BOX])
  })

  it('never writes a font size a chart chose for itself', () => {
    const shared = new Set<string>(Object.values(CHART_FONT).map(String))

    for (const chart of [compass(), dial(), speed()]) {
      const { container, unmount } = render(chart)
      const sizes = [...container.querySelectorAll('[font-size]')].map(
        (node) => node.getAttribute('font-size') ?? ''
      )

      // One type scale, because one viewBox means font sizes are comparable across charts — and a
      // `7.5` next to an `8.5` next to a `10` was how five views of three measurements ended up
      // with five sizes, none of the differences meaning anything.
      expect(sizes.length).toBeGreaterThan(0)
      expect([...new Set(sizes)].filter((size) => !shared.has(size))).toEqual([])
      unmount()
    }
  })

  it('keeps the scatter’s plot square, so the 1:1 line reads at 45°', () => {
    render(speed())
    const oneToOne = screen.getByTestId('one-to-one')

    // `SOG` and `STW` are the same quantity, so a knot has to be the same number of pixels on each
    // axis. A stretched plot would draw agreement between the two instruments as a sloped line.
    const run = Number(oneToOne.getAttribute('x2')) - Number(oneToOne.getAttribute('x1'))
    const rise = Number(oneToOne.getAttribute('y1')) - Number(oneToOne.getAttribute('y2'))

    expect(run).toBeCloseTo(rise, 6)
    // And it uses the width it has: the plot is as wide as the box's height allows.
    expect(run).toBeGreaterThan(TUNING_CHART_WIDTH * 0.7)
  })
})

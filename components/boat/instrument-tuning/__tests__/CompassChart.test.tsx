/**
 * The compass chart: two drawings of one measurement, over one state.
 *
 * Driven by the keyboard rather than by taps. That is not a workaround — jsdom implements neither
 * `getScreenCTM` nor `DOMPoint`, so a tap cannot be located in a chart's own coordinates there, and
 * `svgPoint` returns null rather than inventing a position. Every tap is Playwright's
 * (`e2e/authenticated/instrument-tuning-charts.spec.ts`); the arrow keys reach the same state here,
 * which is the state these tests are about.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompassChart from '@/components/boat/instrument-tuning/CompassChart'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'

import { event, headingEra, raceBins, raceHeading } from './fixtures'

const AUTOCOMPENSATION = event('2026-07-04', ['HDG'], 'autocompensation')

/** Two Races that overlap on 0°–10° and disagree, and one heading only one of them reached. */
function twoRaces() {
  return [
    raceHeading(
      'race-north',
      '2026-07-10 19:00:00',
      raceBins({ 0: { mean: 12, rows: 40 }, 1: { mean: 11, rows: 20 } })
    ),
    raceHeading(
      'race-west',
      '2026-07-17 19:00:00',
      // 0°–10° again, and 240°–250° on its own. The 20°–30° bin held two rows: under the gate.
      raceBins({ 0: { mean: 8, rows: 30 }, 2: { mean: null, rows: 2 }, 24: { mean: -9, rows: 25 } })
    ),
  ]
}

const LABELS = { 'race-north': '10 Jul · Beer-can', 'race-west': '17 Jul · Verve Cup' }

function renderChart(over: Partial<Parameters<typeof CompassChart>[0]> = {}) {
  const races = twoRaces()
  return render(
    <CompassChart
      era={headingEra(races)}
      previous={null}
      log={buildCalibrationLog([], [AUTOCOMPENSATION])}
      labels={LABELS}
      {...over}
    />
  )
}

describe('the Strip | Rose toggle', () => {
  it('draws the strip first, because that is the form legible at 390px', () => {
    renderChart()

    expect(screen.getByTestId('compass-strip')).toBeInTheDocument()
    expect(screen.queryByTestId('compass-rose')).not.toBeInTheDocument()
  })

  it('swaps one drawing for the other rather than stacking both', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))

    expect(screen.getByTestId('compass-rose')).toBeInTheDocument()
    // Stacking them would double a 390px sheet's height for one measurement, which is the
    // alternative ADR 0034 rejected.
    expect(screen.queryByTestId('compass-strip')).not.toBeInTheDocument()
  })

  it('carries the selected heading across the toggle, because the two views share one state', async () => {
    renderChart()

    fireEvent.keyDown(screen.getByTestId('compass-strip'), { key: 'ArrowRight' })
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0°–10° · N')

    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))

    // The whole reason this is a toggle and not two charts: flipping views never loses your place.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0°–10° · N')
  })

  it('carries the overlay across the toggle too', async () => {
    const races = twoRaces()
    renderChart({ era: headingEra(races), previous: headingEra([races[0]]) })

    await userEvent.click(screen.getByRole('button', { name: '+ 17 Jul' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))

    // One polyline per unbroken run of the curve, so the rose draws at least one.
    expect(screen.getAllByTestId('compass-race-overlay').length).toBeGreaterThan(0)
  })

  it('steps the selection with the arrow keys in either view', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    const rose = screen.getByTestId('compass-rose')

    fireEvent.keyDown(rose, { key: 'ArrowLeft' })

    // Left from nothing selected wraps to the last bin — 350°–360°, not an error and not bin 0.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('350°–360°')
  })
})

describe('what the chart says it does not know', () => {
  it('hatches every heading with no figure, and draws no bar across it', () => {
    renderChart()

    // Two Races reached three of the 36 headings between them. The other 33 are hatched, which is
    // a mark for absence rather than a bar of height zero.
    expect(screen.getAllByTestId('compass-absent-bin')).toHaveLength(33)
  })

  it('lists a Race whose bin fell under the three-row gate, as not counted', () => {
    renderChart()
    const strip = screen.getByTestId('compass-strip')

    // Three rights from nothing: bins 0, 1, 2. The third is the one holding two rows.
    fireEvent.keyDown(strip, { key: 'ArrowRight' })
    fireEvent.keyDown(strip, { key: 'ArrowRight' })
    fireEvent.keyDown(strip, { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('20°–30°')
    expect(readout).toHaveTextContent('no figure')
    // Omitting it would make "nobody sailed this heading" and "nobody sailed it long enough" the
    // same sentence (ADR 0034).
    expect(readout).toHaveTextContent('2 rows — under 3, not counted')
  })

  it('says a heading no Race in the Era reached, rather than showing an empty panel', () => {
    renderChart()
    const strip = screen.getByTestId('compass-strip')

    fireEvent.keyDown(strip, { key: 'ArrowLeft' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No Race in this Era sailed this heading.'
    )
  })

  it('offers a Race that produced no curve as a dashed chip, and says why when it is picked', async () => {
    const races = twoRaces()
    renderChart({
      era: headingEra(races, {
        excluded: [
          {
            ok: false,
            race_id: 'race-drifter',
            window_start: '2026-07-24 19:00:00',
            reason: 'too-few-rows',
            row_count: 3,
          },
        ],
      }),
    })

    const chip = screen.getByRole('button', { name: '+ 24 Jul' })
    await userEvent.click(chip)

    // Pickable, not disabled: absence is an answer, and the answer is the reason (ADR 0012).
    expect(screen.getByTestId('compass-chart')).toHaveTextContent(
      'produced no curve — only 3 rows this check could read'
    )
  })
})

describe('what the chart leads with', () => {
  it('leads with the highest and lowest heading and the swing, not with a single mean', () => {
    renderChart()

    const readout = screen.getByTestId('chart-readout')
    // The compass error is a curve. A `+3.1°` headline would hide a 20° swing. 0°–10° is the mean
    // of the two Races that reached it (12 and 8), which puts the extreme at 10°–20°.
    expect(readout).toHaveTextContent('+11.0° NNE · −9.0° WSW')
    expect(readout).toHaveTextContent('Swings 20° with heading')
  })

  it('states each mean beside its own weighting, never one of them as "the" mean', () => {
    renderChart()

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('any one figure averages this curve')
    // Two correct means of one figure (ADR 0032), each labelled by what it weights equally — a
    // mean whose weighting is in a clause somewhere else is a mean nobody can use.
    expect(readout).toHaveTextContent('+3.1°mean · Races equal')
    expect(readout).toHaveTextContent('+3.6°mean · headings equal')
    // And how much of the rose the curve has no reading at, which the coverage share does not say.
    expect(readout).toHaveTextContent('33 of 36headings unread')
  })

  it('states coverage as a word with its reason, never as a verdict on the compass', () => {
    renderChart()

    const coverage = screen.getByTestId('coverage-verdict')
    // One heading of 36 rests on both Races, which is ANECDOTAL — a statement about the evidence.
    expect(coverage).toHaveTextContent('ANECDOTAL')
    expect(coverage).toHaveTextContent('1 of 36 headings rest on two or more Races')
  })

  it('says there is no curve to read rather than drawing one, where no bin cleared the gate', () => {
    renderChart({ era: headingEra([]) })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('there is no curve to read')
  })
})

describe('the Era before this one', () => {
  it('is drawn by default, because "moved, not flattened" cannot be seen one Era at a time', () => {
    const races = twoRaces()
    renderChart({ era: headingEra(races), previous: headingEra([races[0]]) })

    expect(screen.getByTestId('compass-previous-era')).toBeInTheDocument()
  })

  it('is not offered at all where this is the first Era', () => {
    renderChart({ previous: null })

    expect(screen.queryByRole('button', { name: /before/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('compass-previous-era')).not.toBeInTheDocument()
  })

  it('prints the heading in this Era and in the last, side by side', () => {
    const races = twoRaces()
    renderChart({
      era: headingEra(races, { era: { ...headingEra(races).era, from_date: '2026-07-04' } }),
      previous: headingEra([raceHeading('race-june', '2026-06-01 19:00:00', raceBins({ 0: { mean: 22, rows: 30 } }))]),
    })

    fireEvent.keyDown(screen.getByTestId('compass-strip'), { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('+10.0° now')
    expect(readout).toHaveTextContent('+22.0° before')
  })
})

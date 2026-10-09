/**
 * The `STW` chart: two views of one set of rows, a line fitted two ways, and no coefficient.
 *
 * The rule with the most riding on it is the last `describe`. A slope or an intercept is a drafted
 * correction however it is labelled (ADR 0027, LAY-138 decision 7), and this component is built so
 * it could not print one: the service hands it two end points of a segment and `R²`.
 *
 * Driven by the keyboard, for the reason `CompassChart.test.tsx` gives.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SpeedCheckChart from '@/components/boat/instrument-tuning/SpeedCheckChart'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'

import { event, raceDivergence, speedEra, speedPoints } from './fixtures'

const CLEANED = event('2026-07-04', ['STW'])
const AUTOCOMPENSATION = event('2026-06-01', ['HDG'], 'autocompensation')

const LABELS = { 'race-june': '3 Jun · Beer-can', 'race-july': '10 Jul · Verve Cup' }

function byMethod() {
  const races = [
    raceDivergence('race-june', '2026-06-03 19:00:00', speedPoints(40, 0.2)),
    raceDivergence('race-july', '2026-07-10 19:00:00', speedPoints(30, 0.3)),
  ]

  return {
    orthogonal: speedEra(races),
    'sog-on-stw': speedEra(races, {
      measured_offset_knots: 0.21,
      fit: {
        fitted: true,
        line: {
          method: 'sog-on-stw',
          // The same rows, flattened by noise in STW: the line crosses 1:1 and reads the
          // paddlewheel as over-reading at speed instead of under-reading.
          ends: [
            { stw: 2, sog: 2.5 },
            { stw: 9, sog: 8.8 },
          ],
          r_squared: 0.9,
          points: 70,
        },
      },
    }),
  }
}

function renderChart(over: Partial<Parameters<typeof SpeedCheckChart>[0]> = {}) {
  return render(
    <SpeedCheckChart
      byMethod={byMethod()}
      log={buildCalibrationLog([], [CLEANED, AUTOCOMPENSATION])}
      labels={LABELS}
      {...over}
    />
  )
}

describe('the Scatter | Gap-by-speed toggle', () => {
  it('opens on the scatter, which is where the line the constants act on is visible', () => {
    renderChart()

    expect(screen.getByTestId('speed-scatter')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-gap')).not.toBeInTheDocument()
  })

  it('swaps one view for the other', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    expect(screen.getByTestId('speed-gap')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-scatter')).not.toBeInTheDocument()
  })

  it('draws the fitted line in both views, because the line is the point of both', async () => {
    renderChart()

    expect(screen.getByTestId('fitted-line')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))
    expect(screen.getByTestId('fitted-line')).toBeInTheDocument()
  })

  it('keeps the Era’s line drawn behind a picked Race’s own, so the two can be compared', async () => {
    renderChart()

    expect(screen.getAllByTestId('fitted-line')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: '3 Jun' }))

    // Two lines, not one replaced by the other: the question a picked Race asks is how far it sits
    // from the season, and a chart with only the amber line answers a different one.
    const lines = screen.getAllByTestId('fitted-line')
    expect(lines).toHaveLength(2)
    expect(lines.map((line) => line.getAttribute('stroke'))).toEqual([
      'var(--text-accent)',
      'var(--state-warning)',
    ])
  })

  it('carries the selected speed band across the toggle', async () => {
    renderChart()

    fireEvent.keyDown(screen.getByTestId('speed-scatter'), { key: 'ArrowRight' })
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt')

    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt')
  })

  it('carries the picked Race across the toggle too', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('button', { name: '3 Jun' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    expect(screen.getByRole('button', { name: '3 Jun' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('the fit-method toggle', () => {
  it('starts orthogonal, treating both instruments as noisy', () => {
    renderChart()

    expect(screen.getByRole('radio', { name: 'both noisy' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'Fitted treating both instruments as noisy'
    )
  })

  it('moves the line, which is the dependence the toggle exists to show', async () => {
    renderChart()

    // The two fits read the same rows and disagree about the line through them: orthogonal sits
    // +0.24 kt from 1:1 at 4 kt, SOG-on-STW +0.30 kt — and by 8 kt the second has crossed over.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.24 ktline vs 1:1 at 4 kt')

    await userEvent.click(screen.getByRole('radio', { name: 'SOG on STW' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.30 ktline vs 1:1 at 4 kt')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('−0.10 ktat 8 kt')
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'noise in STW flattens this line'
    )
  })
})

describe('what a tapped band says', () => {
  it('gives the rows’ own gap there, the line’s, and flags a disagreement over 0.1 kt', () => {
    renderChart()
    const scatter = screen.getByTestId('speed-scatter')

    // Three rights: bands 0, 1, 2. The 2–3 kt band is where the U is highest.
    for (let step = 0; step < 3; step += 1) fireEvent.keyDown(scatter, { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('2–3 kt · +0.45 kt')
    expect(readout).toHaveTextContent('Over 120 rows from 2 Races, each weighted equally')
    expect(readout).toHaveTextContent('The straight line says +0.29 kt here')
    expect(readout).toHaveTextContent(
      'the rows disagree with it by more than 0.1 kt, which is the U a straight line cannot follow'
    )
  })

  it('says the boat never sailed a band, rather than drawing it at zero', () => {
    renderChart()

    fireEvent.keyDown(screen.getByTestId('speed-scatter'), { key: 'ArrowRight' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt · no rows')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No Race in this Era sailed this speed.'
    )
  })

  it('says a picked Race never sailed a band, without a double negative', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('button', { name: '3 Jun' }))
    fireEvent.keyDown(screen.getByTestId('speed-scatter'), { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    // "No Race in this Era never sailed this speed" says the opposite of both halves of itself.
    expect(readout).toHaveTextContent('This Race never sailed this speed.')
    expect(readout).not.toHaveTextContent('No Race in this Era never')
  })

  it('hatches a band with no rows in the gap view', async () => {
    renderChart()

    await userEvent.click(screen.getByRole('radio', { name: 'Gap by speed' }))

    // Three of ten bands were measured; the other seven are hatched rather than silently missing.
    expect(screen.getAllByTestId('speed-absent-band')).toHaveLength(7)
  })
})

describe('a Race with no line of its own', () => {
  it('offers it as a dashed chip and says what stopped it, keeping its rows in the season', async () => {
    const races = [
      raceDivergence('race-june', '2026-06-03 19:00:00', speedPoints(40, 0.2)),
      raceDivergence('race-july', '2026-07-10 19:00:00', speedPoints(30, 0.3), {
        sog_spread_knots: 1.2,
        fit: { fitted: false, reason: 'narrow-spread' },
      }),
    ]
    renderChart({ byMethod: { orthogonal: speedEra(races), 'sog-on-stw': speedEra(races) } })

    await userEvent.click(screen.getByRole('button', { name: '10 Jul' }))

    const chart = screen.getByTestId('speed-check-chart')
    expect(chart).toHaveTextContent(
      'has no line of its own — under 3 kt of SOG between its slowest row and its fastest'
    )
    expect(chart).toHaveTextContent('its rows still count in the season')
  })
})

describe('the blank-STW coverage stat', () => {
  it('says where the blank rows went where none of them reached the chart', () => {
    const races = [raceDivergence('race-june', '2026-06-03 19:00:00', speedPoints(40, 0.2))]
    renderChart({
      byMethod: {
        orthogonal: speedEra(races, {
          coverage: {
            rows: 1000,
            countable: 40,
            points: 40,
            blank_stw: 0,
            blank_sog: 0,
            excluded_blank_stw: { frozen: 845, low_speed: 90, maneuver_window: 0 },
          },
        }),
        'sog-on-stw': speedEra(races),
      },
    })

    // ADR 0027's 19.8% is a fact about the whole archive. Over the rows the chart reads it is zero,
    // and saying where they went is the honest version of that.
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'all 935 blank-STW rows in these Races were Frozen, Low-Speed or inside a Maneuver Window'
    )
  })

  it('counts a blank row rather than plotting it at zero', () => {
    const races = [raceDivergence('race-june', '2026-06-03 19:00:00', speedPoints(40, 0.2))]
    renderChart({
      byMethod: {
        orthogonal: speedEra(races, {
          coverage: {
            rows: 100,
            countable: 60,
            points: 40,
            blank_stw: 20,
            blank_sog: 0,
            excluded_blank_stw: { frozen: 0, low_speed: 0, maneuver_window: 0 },
          },
        }),
        'sog-on-stw': speedEra(races),
      },
    })

    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'The paddlewheel said nothing on 20 of 60 Countable rows here, which are counted and not plotted — a blank is not a reading of zero.'
    )
  })
})

describe('the line’s coefficients', () => {
  it('prints neither a slope nor an intercept, under either method', async () => {
    renderChart()

    for (const method of ['both noisy', 'SOG on STW']) {
      await userEvent.click(screen.getByRole('radio', { name: method }))

      const text = screen.getByTestId('speed-check-chart').textContent ?? ''
      expect(text).not.toMatch(/slope|intercept|multiplier/i)
      // The three slopes this archive measures. Any of them on screen would be a drafted
      // correction with a different label on it.
      expect(text).not.toMatch(/0\.94|0\.98|1\.02/)
    }
  })

  it('gives the line’s gap from 1:1 at 4 kt and at 8 kt, which is a reading of the drawn line', () => {
    renderChart()

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('+0.24 ktline vs 1:1 at 4 kt')
    expect(readout).toHaveTextContent('+0.13 ktat 8 kt')
  })

  it('keeps R² and the knot gap, which depend on no fit at all', () => {
    renderChart()

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.21 kt · R² 0.90')
  })

  it('states coverage as the share of Races carrying a line of their own', () => {
    renderChart()

    const coverage = screen.getByTestId('coverage-verdict')
    expect(coverage).toHaveTextContent('SOLID')
    expect(coverage).toHaveTextContent('2 of 2 Races carry a line of their own')
  })
})

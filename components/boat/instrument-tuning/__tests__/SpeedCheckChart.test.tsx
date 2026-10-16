/**
 * The `STW` chart: the verdict first, three views of one set of rows, a line fitted two ways under
 * the scatter, and no coefficient anywhere.
 *
 * The rule with the most riding on it is the last `describe`. A slope or an intercept is a drafted
 * correction however it is labelled (ADR 0027, LAY-138 decision 7), and so is a percentage (ADR
 * 0041); this component is built so it could not print one: the service hands it two end points of
 * a segment and `R²`, and the verdict hands it gaps in knots at stated speeds.
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

/**
 * Four Races sailing 2 to 8 kt with twenty rows in each knot — enough for every band to carry a
 * verdict, which the two short Races of `byMethod()` deliberately are not.
 */
function fourRaces(gap: number) {
  const races = [3, 10, 17, 24].map((day) =>
    raceDivergence(
      `race-${day}`,
      `2026-06-${String(day).padStart(2, '0')} 19:00:00`,
      speedPoints(121, gap)
    )
  )
  return { orthogonal: speedEra(races), 'sog-on-stw': speedEra(races) }
}

async function show(view: 'Chart' | 'Checklist' | 'Scatter'): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: view }))
}

/** Picking a Race, which is a dropdown here and not a chip. */
async function pickRace(label: string): Promise<void> {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /Which Race/ }), label)
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

describe('the verdict', () => {
  it('says there are not enough Races yet, rather than guessing from two', () => {
    renderChart()

    const verdict = screen.getByTestId('speed-verdict')
    expect(verdict).toHaveTextContent('Not enough Races yet')
    expect(verdict).toHaveTextContent('A speed needs 3 Races with 10 rows each there')
  })

  it('says recalibrate where every Race reads slow by the same amount at every speed', () => {
    renderChart({ byMethod: fourRaces(0.4) })

    const verdict = screen.getByTestId('speed-verdict')
    expect(verdict).toHaveTextContent('Worth recalibrating')
    expect(verdict).toHaveTextContent('The paddlewheel reads slow at 2–8 kt, the Races agree')
  })

  it('says leave it where the paddlewheel is within the close-enough window', () => {
    renderChart({ byMethod: fourRaces(0.05) })

    const verdict = screen.getByTestId('speed-verdict')
    expect(verdict).toHaveTextContent('No recalibration needed')
    expect(verdict).toHaveTextContent('Within 0.2 kt of GPS at 2–8 kt.')
  })

  it('is the same under either fit method, because it reads the rows and not the line', async () => {
    renderChart({ byMethod: fourRaces(0.4) })
    const before = screen.getByTestId('speed-verdict').textContent

    await show('Scatter')
    await userEvent.click(screen.getByRole('radio', { name: 'SOG on STW' }))

    expect(screen.getByTestId('speed-verdict').textContent).toBe(before)
  })
})

describe('the Chart | Checklist | Scatter toggle', () => {
  it('opens on the chart, which is the picture the verdict rests on', () => {
    renderChart()

    expect(screen.getByTestId('speed-bands')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-scatter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('speed-checklist')).not.toBeInTheDocument()
  })

  it('swaps one view for another', async () => {
    renderChart()

    await show('Checklist')
    expect(screen.getByTestId('speed-checklist')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-bands')).not.toBeInTheDocument()

    await show('Scatter')
    expect(screen.getByTestId('speed-scatter')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-checklist')).not.toBeInTheDocument()
  })

  it('offers the fit method only under the scatter, the one view with a line in it', async () => {
    renderChart()

    expect(screen.queryByRole('radio', { name: 'both noisy' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('fitted-line')).not.toBeInTheDocument()

    await show('Scatter')

    expect(screen.getByRole('radio', { name: 'both noisy' })).toBeInTheDocument()
    expect(screen.getByTestId('fitted-line')).toBeInTheDocument()
  })

  it('has no Race to lift out on the checklist, which answers for the Era', async () => {
    renderChart()

    await show('Checklist')

    expect(screen.queryByRole('combobox', { name: /Which Race/ })).not.toBeInTheDocument()
  })

  it('keeps the Era’s line drawn behind a picked Race’s own, so the two can be compared', async () => {
    renderChart()
    await show('Scatter')

    expect(screen.getAllByTestId('fitted-line')).toHaveLength(1)

    await pickRace('3 Jun · Beer-can')

    // Two lines, not one replaced by the other: the question a picked Race asks is how far it sits
    // from the season, and a chart with only the amber line answers a different one.
    const lines = screen.getAllByTestId('fitted-line')
    expect(lines).toHaveLength(2)
    expect(lines.map((line) => line.getAttribute('stroke'))).toEqual([
      'var(--text-accent)',
      'var(--state-warning)',
    ])
  })

  it('carries the selected speed band between the chart and the scatter', async () => {
    renderChart()

    fireEvent.keyDown(screen.getByTestId('speed-bands'), { key: 'ArrowRight' })
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt')

    await show('Scatter')

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt')
  })

  it('carries the picked Race across the toggle too', async () => {
    renderChart()

    await pickRace('3 Jun · Beer-can')
    await show('Scatter')

    // The picker keeps its Race across the toggle, which is the state the views share.
    expect(screen.getByRole('combobox', { name: /Which Race/ })).toHaveValue('race-june')
  })
})

describe('the chart', () => {
  it('draws every counted Race at each speed, and the season’s bar in the band’s verdict', () => {
    renderChart({ byMethod: fourRaces(0.4) })

    // Bands 2–7 hold twenty rows of each Race; 8 kt holds one row each, too few to count.
    const means = screen.getAllByTestId('speed-band-mean')
    expect(means).toHaveLength(6)
    expect(new Set(means.map((mean) => mean.getAttribute('data-verdict')))).toEqual(
      new Set(['reads-slow'])
    )
    expect(screen.getAllByTestId('speed-race-dot')).toHaveLength(24)
    expect(screen.getByTestId('close-enough')).toBeInTheDocument()
  })

  it('hatches a speed no Race sailed, rather than drawing it at zero', () => {
    renderChart({ byMethod: fourRaces(0.4) })

    // 0, 1 and 9 kt. 8 kt has rows — four of them — so it is drawn, just without a verdict.
    expect(screen.getAllByTestId('speed-absent-band')).toHaveLength(3)
  })

  it('says, for a tapped speed, its verdict and how many Races agree', () => {
    renderChart({ byMethod: fourRaces(0.4) })
    const chart = screen.getByTestId('speed-bands')

    for (let step = 0; step < 3; step += 1) fireEvent.keyDown(chart, { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('2–3 kt · reads slow · 0.40 kt slow')
    expect(readout).toHaveTextContent('4 of 4 Races lean the same way.')
  })

  it('says a speed sailed too briefly has no verdict, and why', () => {
    renderChart()
    const chart = screen.getByTestId('speed-bands')

    for (let step = 0; step < 3; step += 1) fireEvent.keyDown(chart, { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('2–3 kt · too few Races')
    expect(readout).toHaveTextContent(
      'No Race sailed long enough at this speed to count — a verdict needs 3.'
    )
  })

  it('says the boat never sailed a speed, rather than reading it as spot on', () => {
    renderChart()

    fireEvent.keyDown(screen.getByTestId('speed-bands'), { key: 'ArrowRight' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt · no rows')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No Race in this Era sailed this speed.'
    )
  })

  it('rings a picked Race’s own dot at every speed it counts in', async () => {
    renderChart({ byMethod: fourRaces(0.4), labels: { 'race-10': '10 Jun · Beer-can' } })

    await pickRace('10 Jun · Beer-can')

    expect(screen.getAllByTestId('speed-picked-dot')).toHaveLength(6)
  })

  it('never writes a gap as a signed figure', () => {
    renderChart({ byMethod: fourRaces(0.4) })
    const chart = screen.getByTestId('speed-bands')
    for (let step = 0; step < 3; step += 1) fireEvent.keyDown(chart, { key: 'ArrowRight' })

    // "+0.40 kt" asks which instrument was subtracted from which; "0.40 kt slow" does not.
    expect(screen.getByTestId('speed-check-chart').textContent).not.toMatch(/[+−-]\d\.\d{2} kt/)
  })
})

describe('the checklist', () => {
  it('asks the five questions, each answered in words as well as a mark', async () => {
    renderChart({ byMethod: fourRaces(0.4) })
    await show('Checklist')

    const checklist = screen.getByTestId('speed-checklist')
    expect(checklist).toHaveTextContent('Is it off where you sail most?Yes, at 2–3 kt (0.40 kt slow)')
    expect(checklist).toHaveTextContent('Where it’s off, do the Races agree?Yes at 2–3 kt')
    expect(checklist).toHaveTextContent(
      'Would recalibrating fix it?Yes — the gap is a straight line in speed'
    )
    // The marks carry their meaning in words too, for the night-vision theme.
    expect(screen.getAllByRole('img', { name: 'needs attention' }).length).toBeGreaterThan(0)
  })

  it('says it cannot judge heading from rows with no course, rather than calling them north', async () => {
    renderChart({ byMethod: fourRaces(0.4) })
    await show('Checklist')

    expect(screen.getByTestId('speed-checklist')).toHaveTextContent(
      'Is it the same on every heading?Not enough headings sailed to say.'
    )
  })
})

describe('the fit-method toggle', () => {
  it('starts orthogonal, treating both instruments as noisy', async () => {
    renderChart()
    await show('Scatter')

    expect(screen.getByRole('radio', { name: 'both noisy' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent(
      'The fit treats GPS and paddlewheel as equally imperfect.'
    )
  })

  it('moves the line, which is the dependence the toggle exists to show', async () => {
    renderChart()
    await show('Scatter')

    // The two fits read the same rows and disagree about the line through them: orthogonal sits
    // +0.24 kt from 1:1 at 4 kt, SOG-on-STW +0.30 kt — and by 6 kt the second has closed to a third
    // of that, its line (2, 2.5) → (9, 8.8) sitting 2.5 + 4 × 0.9 − 6 = +0.10 kt off 1:1.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.24 ktline vs 1:1 at 4 kt')

    await userEvent.click(screen.getByRole('radio', { name: 'SOG on STW' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.30 ktline vs 1:1 at 4 kt')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.10 ktat 6 kt')
    expect(screen.getByTestId('speed-check-chart')).toHaveTextContent('tilts the line flatter')
  })
})

describe('what a tapped band says on the scatter', () => {
  it('gives the rows’ own gap there, the line’s, and flags a disagreement over 0.1 kt', async () => {
    renderChart()
    await show('Scatter')
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

  it('says the boat never sailed a band, rather than drawing it at zero', async () => {
    renderChart()
    await show('Scatter')

    fireEvent.keyDown(screen.getByTestId('speed-scatter'), { key: 'ArrowRight' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('0–1 kt · no rows')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No Race in this Era sailed this speed.'
    )
  })

  it('says a picked Race never sailed a band, without a double negative', async () => {
    renderChart()

    await show('Scatter')
    await pickRace('3 Jun · Beer-can')
    fireEvent.keyDown(screen.getByTestId('speed-scatter'), { key: 'ArrowRight' })

    const readout = screen.getByTestId('chart-readout')
    // "No Race in this Era never sailed this speed" says the opposite of both halves of itself.
    expect(readout).toHaveTextContent('This Race never sailed this speed.')
    expect(readout).not.toHaveTextContent('No Race in this Era never')
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
    await show('Scatter')

    // The reason rides in the option's own label, where a chip had a dashed border.
    await pickRace(
      '10 Jul · Verve Cup — under 3 kt of SOG between its slowest row and its fastest'
    )

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
  it('prints neither a slope nor an intercept, under either method or on any view', async () => {
    renderChart({ byMethod: fourRaces(0.4) })

    for (const view of ['Chart', 'Checklist'] as const) {
      await show(view)
      const text = screen.getByTestId('speed-check-chart').textContent ?? ''
      expect(text).not.toMatch(/slope|intercept|multiplier/i)
      // A percentage is a multiplier with the arithmetic left to the reader (ADR 0041).
      expect(text).not.toMatch(/\d% (slow|fast)/)
    }

    await show('Scatter')
    for (const method of ['both noisy', 'SOG on STW']) {
      await userEvent.click(screen.getByRole('radio', { name: method }))

      const text = screen.getByTestId('speed-check-chart').textContent ?? ''
      expect(text).not.toMatch(/slope|intercept|multiplier/i)
      // The three slopes this archive measures. Any of them on screen would be a drafted
      // correction with a different label on it.
      expect(text).not.toMatch(/0\.94|0\.98|1\.02/)
    }
  })

  it('gives the line’s gap from 1:1 at 4 kt and at 6 kt, which is a reading of the drawn line', async () => {
    renderChart()
    await show('Scatter')

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('+0.24 ktline vs 1:1 at 4 kt')
    // (2, 2.3) → (9, 9.1): 2.3 + 4 × 6.8/7 − 6 = +0.19 kt.
    expect(readout).toHaveTextContent('+0.19 ktat 6 kt')
  })

  it('keeps R² and the knot gap, which depend on no fit at all', async () => {
    renderChart()
    await show('Scatter')

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('+0.21 kt · R² 0.90')
  })

  it('states coverage as the share of Races carrying a line of their own', () => {
    renderChart()

    const coverage = screen.getByTestId('coverage-verdict')
    expect(coverage).toHaveTextContent('SOLID')
    expect(coverage).toHaveTextContent('2 of 2 Races carry a line of their own')
  })
})

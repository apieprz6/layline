/**
 * The Tack Dial: asymmetry as a picture, with upwind and downwind on it and never averaged.
 *
 * The rule with the most riding on it is the last `describe`. On the owner's archive port reads
 * 11.5° wider upwind and starboard 10.2° wider downwind, so a mean of the two states the opposite
 * of the finding — and nothing here may produce one.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TackDial from '@/components/boat/instrument-tuning/TackDial'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'

import { asymmetryEra, era, event, pair, raceAsymmetry } from './fixtures'

const AUTOCOMPENSATION = event('2026-07-04', ['HDG'], 'autocompensation')
const MASTHEAD = event('2026-05-20', ['AWA'])

const LABELS = { 'race-june': '3 Jun · Beer-can', 'race-july': '10 Jul · Verve Cup' }

/** June: port 10° wider upwind. July: the same upwind, plus a downwind pair leaning the other way. */
function season() {
  return [
    raceAsymmetry('race-june', '2026-06-03 19:00:00', [
      pair('upwind', 36, 46, '2026-06-03 19:12:00'),
      pair('upwind', 34, 44, '2026-06-03 19:40:00'),
    ]),
    raceAsymmetry('race-july', '2026-07-10 19:00:00', [
      pair('upwind', 35, 45, '2026-07-10 19:20:00'),
      pair('downwind', 150, 140, '2026-07-10 19:50:00'),
    ]),
  ]
}

function renderDial(over: Partial<Parameters<typeof TackDial>[0]> = {}) {
  const races = season()
  return render(
    <TackDial
      season={asymmetryEra(races)}
      eras={[
        asymmetryEra([races[0]], { era: era('HDG', null) }),
        asymmetryEra([races[1]], { era: era('HDG', '2026-07-04') }),
      ]}
      log={buildCalibrationLog([], [AUTOCOMPENSATION, MASTHEAD])}
      labels={LABELS}
      {...over}
    />
  )
}

describe('what the dial draws', () => {
  it('puts a dot pair on the dial for every Tack Pair, and lists them', () => {
    renderDial()

    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(4)
    expect(screen.getByText('4 Tack Pairs')).toBeInTheDocument()
  })

  it('fills the gap between the two tacks as a wedge labelled with its width', () => {
    renderDial()

    // Port holds 10° wider upwind on every pair and starboard 10° wider downwind, so both wedges
    // are 10° and say so. The label is the gap between the tacks — twice the Asymmetry — because
    // printing the 5 would halve the finding.
    expect(screen.getByTestId('asymmetry-wedge-upwind')).toBeInTheDocument()
    expect(screen.getAllByText('Δ10.0°')).toHaveLength(2)
  })

  it('draws a wedge per point of sail, so the two are compared in one look', () => {
    renderDial()

    expect(screen.getByTestId('asymmetry-wedge-upwind')).toBeInTheDocument()
    expect(screen.getByTestId('asymmetry-wedge-downwind')).toBeInTheDocument()
  })

  it('says reaching is discarded rather than leaving its sectors blank', () => {
    renderDial()

    expect(screen.getAllByText('reaching · not used')).toHaveLength(2)
  })
})

describe('the three levels', () => {
  it('opens on the season, which is the figure that guides an adjustment on the boat', () => {
    renderDial()

    expect(screen.getByRole('button', { name: 'Season · 2 Races' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('offers either side of the HDG Era boundary, so LAY-145 §2.6’s check is one tap', async () => {
    renderDial()

    // The check is whether the Asymmetry moved across an autocompensation that moved the compass
    // about ten degrees. It is the HDG boundary and not AWA's own, deliberately.
    await userEvent.click(screen.getByRole('button', { name: 'Since 4 Jul' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('1 Tack Pair · 1 Race')
  })

  it('offers one Race, and drops the pairs of every other', async () => {
    renderDial()

    await userEvent.click(screen.getByRole('button', { name: '3 Jun · Beer-can' }))

    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(2)
  })

  it('draws the season behind a narrower level, so one Race is never read in isolation', async () => {
    const { container } = renderDial()

    const greyBefore = container.querySelectorAll('[stroke="var(--text-muted)"]').length
    await userEvent.click(screen.getByRole('button', { name: '3 Jun · Beer-can' }))

    expect(container.querySelectorAll('[stroke="var(--text-muted)"]').length).toBeGreaterThan(
      greyBefore
    )
  })

  it('clears a picked pair when the level changes, rather than naming a dot that has gone', async () => {
    renderDial()

    await userEvent.click(screen.getAllByTestId('tack-pair-dot')[0])
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('starboard 36.0°')

    await userEvent.click(screen.getByRole('button', { name: 'Since 4 Jul' }))
    expect(screen.getByTestId('chart-readout')).not.toHaveTextContent('starboard 36.0°')
  })

  it('says why a Race paired no tacks, on a dashed chip that is still pickable', async () => {
    const races = season()
    renderDial({
      season: asymmetryEra(races, {
        excluded: [
          {
            ok: false,
            race_id: 'race-drifter',
            window_start: '2026-07-24 19:00:00',
            reason: 'no-pairs',
            segment_count: 3,
          },
        ],
      }),
    })

    await userEvent.click(screen.getByRole('button', { name: '24 Jul' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'paired no tacks — no two steady segments on opposite tacks close enough together'
    )
  })
})

describe('picking one pair', () => {
  it('names its Race, its time, and the two angles it held', async () => {
    renderDial()

    await userEvent.click(screen.getAllByTestId('tack-pair-dot')[0])

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('3 Jun · Beer-can')
    expect(readout).toHaveTextContent('19:12')
    expect(readout).toHaveTextContent('starboard 36.0° · port 46.0° · port 10.0° wider')
  })

  it('picks the same pair from the list beneath the dial', async () => {
    renderDial()

    await userEvent.click(screen.getByRole('button', { name: /3 Jun · Beer-can 19:40/ }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('starboard 34.0° · port 44.0°')
  })
})

describe('the figure, and the one figure there is never', () => {
  it('states upwind and downwind side by side, each with which tack reads wider', () => {
    renderDial()

    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('Upwind · AWA < 50°')
    expect(readout).toHaveTextContent('Port reads 10.0° wider')
    expect(readout).toHaveTextContent('Downwind · AWA > 110°')
    expect(readout).toHaveTextContent('Starboard reads 10.0° wider')
  })

  it('never prints a figure averaging the two points of sail', () => {
    renderDial()

    // Upwind −5° and downwind +5° average to zero, which would report a symmetric instrument.
    // The dial has no shape for that figure and this asserts it never appears.
    const text = screen.getByTestId('tack-dial').textContent ?? ''
    expect(text).not.toMatch(/overall/i)
    expect(text).not.toMatch(/\+0\.0°/)
    expect(text).not.toMatch(/combined/i)
  })

  it('says the two points of sail lean opposite ways, and what that does not imply', () => {
    renderDial()

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'Upwind and downwind lean opposite ways. A vane set off-centre leans the same way on both points of sail, so this is not, on its own, a vane offset.'
    )
  })

  it('says the comparison cannot be made at all where one point of sail has no pairs', async () => {
    renderDial()

    await userEvent.click(screen.getByRole('button', { name: '3 Jun · Beer-can' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No downwind pairs here, so the check that separates a vane set off-centre from everything else cannot be made.'
    )
  })

  it('flags a point of sail with too few pairs to lean on', () => {
    renderDial()

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('1 Tack Pair · 1 Race — too few to lean on')
  })

  it('never says what to set the vane to', () => {
    renderDial()

    const text = screen.getByTestId('tack-dial').textContent ?? ''
    expect(text).not.toMatch(/set the vane to|adjust the vane by|correction/i)
  })
})

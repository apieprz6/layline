/**
 * The Tack Dial: asymmetry as a picture, with upwind and downwind on it and never averaged.
 *
 * The rule with the most riding on it is the last `describe`. On the owner's archive port reads
 * 11.5° wider upwind and starboard 10.2° wider downwind, so a mean of the two states the opposite
 * of the finding — and nothing here may produce one.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TackDial from '@/components/boat/instrument-tuning/TackDial'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'

import { awaAsymmetryByEra } from '@/services/analysis/awa-asymmetry'
import { calibrationEras } from '@/services/analysis/calibration-eras'
import type {
  CalibrationEvent,
  InstrumentCalibrationPayload,
  InstrumentCalibrationVersion,
} from '@/types'

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

/**
 * Picking a Race, which is a dropdown and not a chip.
 *
 * The levels are a short fixed set and stay chips; the Races are the list that grows, so they are
 * one control whose size does not.
 */
async function pickRace(label: string): Promise<void> {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /Which Race/ }), label)
}

/**
 * The levels, in the order the rail prints them.
 *
 * Read out of the rail's own `group` and not off every `aria-pressed` button on screen: the pair
 * list beneath the dial is pressable too, and a looser query counted its rows as chips.
 */
function levelChips(): (string | null)[] {
  const rail = screen.queryByRole('group', { name: /Which Races the dial is drawing/ })
  return rail === null
    ? []
    : [...rail.querySelectorAll('button')].map((chip) => chip.textContent)
}

function renderDial(over: Partial<Parameters<typeof TackDial>[0]> = {}) {
  const races = season()
  return render(
    <TackDial
      season={asymmetryEra(races)}
      eras={[
        asymmetryEra([races[0]], { era: era('AWA', null) }),
        asymmetryEra([races[1]], { era: era('AWA', '2026-07-04') }),
      ]}
      compassEras={[
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
  it('puts two dots on the dial for every Tack Pair — one per tack — and lists them', () => {
    renderDial()

    // Both dots pick the same pair. Each is its own target because the two sit on opposite sides
    // of the boat, so one handler spanning them would put the tap point on the centreline.
    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(8)
    expect(screen.getAllByTestId('tack-pair-dot').filter((dot) => dot.dataset.tack === 'port')).toHaveLength(4)
    expect(screen.getByText('4 Tack Pairs')).toBeInTheDocument()
  })

  it('names each dot by its pair and its tack, so one is reachable without a mouse', () => {
    renderDial()

    expect(
      screen.getByRole('button', { name: 'upwind Tack Pair at 19:12, port tack' })
    ).toBeInTheDocument()
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

describe('whose Calibration Eras the chips are cut on', () => {
  /**
   * The owner's own Calibration Log, reported against the finished screen: a first Version on
   * 4 July that recorded every channel's figures, and a second on 2 September that moved the `AWA`
   * offset from −6° to −3° and nothing else.
   *
   * The dial used to chip on the **`HDG`** Eras alone, so it offered "Before / Since 4 Jul" —
   * because the first Version happened to set `HDG offset 0°` — and hid the 2 September act
   * entirely. That is the one act that governs this figure: a vane **Programmed Offset** is applied
   * before a Recording is written, and it moves the two tacks' held magnitudes in opposite
   * directions, so the Asymmetry either side of it is two different quantities. The season figure
   * was averaging them, and the rail above the chips was already drawing a rule at 2 September that
   * nothing could be cut on.
   */
  const PAYLOAD: InstrumentCalibrationPayload = {
    AWA: { offset: -6 },
    AWS: { multiplier: 0.9, offset: 0 },
    STW: { multiplier: 1.05, offset: 1.05 },
    HDG: { offset: 0 },
  }

  function ownerVersion(
    number: number,
    effective_from: string,
    payload: InstrumentCalibrationPayload
  ): InstrumentCalibrationVersion {
    return {
      id: `v${number}`,
      artifact_id: 'artifact-1',
      kind: 'instrument_calibration',
      version_number: number,
      effective_from,
      recorded_at: `${effective_from}T12:00:00Z`,
      note: null,
      created_by: 'admin-1',
      filename: null,
      content_sha256: null,
      payload,
    }
  }

  /**
   * The dial over that Log, with its Eras cut the way the service cuts them.
   *
   * `extraEvents` is for the one case the owner's Log cannot show: a compass act on a day the
   * masthead was not touched. Their own first Version recorded both channels at once, so every
   * boundary it has belongs to both.
   */
  function renderOverOwnerLog(extraEvents: CalibrationEvent[] = []) {
    const log = buildCalibrationLog(
      [
        ownerVersion(1, '2026-07-04', PAYLOAD),
        ownerVersion(2, '2026-09-02', { ...PAYLOAD, AWA: { offset: -3 } }),
      ],
      extraEvents
    )
    const races = [
      raceAsymmetry('race-aug', '2026-08-12 19:00:00', [pair('upwind', 36, 46)]),
      raceAsymmetry('race-sep', '2026-09-20 19:00:00', [pair('upwind', 36, 40)]),
    ]
    const results = races.map((measured) => ({
      ok: true as const,
      race_id: measured.race_id,
      window_start: measured.window_start,
      asymmetry: measured,
    }))

    return render(
      <TackDial
        season={asymmetryEra(races)}
        eras={awaAsymmetryByEra(calibrationEras(log, 'AWA'), results)}
        compassEras={awaAsymmetryByEra(calibrationEras(log, 'HDG'), results)}
        log={log}
        labels={{}}
      />
    )
  }

  it('offers the day the vane offset was re-typed, which is this figure’s own boundary', () => {
    renderOverOwnerLog()

    // The chip that was missing. `AWA` has three Eras over this Log — before 4 Jul, 4 Jul to
    // 2 Sep, and since — and the two the Races fall in are offered.
    expect(screen.getByRole('button', { name: 'Since 2 Sep' })).toBeInTheDocument()
  })

  it('still offers a compass boundary of its own, named as the compass’s', () => {
    renderOverOwnerLog([event('2026-08-01', ['HDG'], 'autocompensation')])

    // ADR 0034 asked for the cross-channel comparison and did not ask for `AWA`'s own partition to
    // be dropped, so both are here — and a borrowed boundary says whose act it was, for the reason
    // the rail's borrowed rules do.
    expect(screen.getByRole('button', { name: 'Since 1 Aug · HDG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Since 2 Sep' })).toBeInTheDocument()
  })

  it('offers a day both channels were touched once, as its own', () => {
    renderOverOwnerLog()

    // 4 July is a boundary for `AWA` *and* for `HDG`: the first Version recorded both channels'
    // figures. One chip and not two, `AWA`'s, because the chart owns that date — the same rule the
    // rail follows for a day it would otherwise draw two rules on.
    expect(screen.getAllByRole('button', { name: /Since 4 Jul/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Since 4 Jul · HDG' })).not.toBeInTheDocument()
  })

  it('draws whichever Era is picked, from either list', async () => {
    renderOverOwnerLog()

    await userEvent.click(screen.getByRole('button', { name: 'Since 2 Sep' }))

    // One Race sailed after 2 September, and its pair held 4° apart rather than 10°.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('Port reads 4.0° wider')
    expect(screen.getByTestId('chart-readout')).toHaveTextContent('1 Tack Pair · 1 Race')
  })
})

describe('the chip rail', () => {
  it('keeps the Races out of the chips, so the rail does not grow with the archive', () => {
    renderDial()

    // Two levels, and no Race among them. A rail that listed Races was a sideways scroll, then
    // three wrapped lines of dates; at thirty Races either is a rail with a chart somewhere under
    // it.
    expect(levelChips()).toEqual(['Season · 2 Races', 'Since 4 Jul'])
  })

  it('offers every Race in one control, named in full', () => {
    renderDial()

    const picker = screen.getByRole('combobox', { name: /Which Race/ })
    // Named in full here, where there is room for it — the chips had to abbreviate to a date. The
    // resting option is a phrase about Races, not the level's own name: a `select` shows whichever
    // option is selected, so naming the level here read "Race This Era · since 1 Aug" closed.
    expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'All Races',
      '10 Jul · Verve Cup · 2 Tack Pairs',
      '3 Jun · Beer-can · 2 Tack Pairs',
    ])
  })

  it('offers a Race it has nothing to draw for, with the reason in its own option', () => {
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

    // Offered and not disabled: absence is an answer, and picking it is how a sailor asks for the
    // reason (ADR 0012). A `select` cannot draw the dashed border a chip did, so the reason rides
    // in the label.
    const option = screen.getByRole('option', {
      name: '24 Jul — no two steady segments on opposite tacks close enough together',
    })
    expect(option).not.toBeDisabled()
  })

  it('returns to the season when the picker is cleared', async () => {
    renderDial()

    await pickRace('3 Jun · Beer-can · 2 Tack Pairs')
    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(4)

    await pickRace('All Races')
    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(8)
  })

  it('offers no Era chip for a channel nothing was ever recorded against', () => {
    // The state the screen ships in: `AWA` has one Era over the whole of recorded time, which is
    // the same set of Races as "Season". A chip for it read "Before the first act", about an act
    // there is none of, and selected exactly what the chip beside it already did.
    renderDial({ eras: [asymmetryEra(season(), { era: era('AWA') })], compassEras: [] })

    // One chip left, which is worth keeping: it names what is drawn, and it is the way back from a
    // picked Race. Thirteen Races were not worth a chip each; one level is.
    expect(levelChips()).toEqual(['Season · 2 Races'])
    expect(screen.getByRole('combobox', { name: /Which Race/ })).toHaveValue('')
  })

  it('names an opening Era by the act that closed it', () => {
    const races = season()
    renderDial({
      eras: [
        asymmetryEra([races[0]], { era: era('AWA', null, '2026-07-04') }),
        asymmetryEra([races[1]], { era: era('AWA', '2026-07-04') }),
      ],
      compassEras: [],
    })

    // Read off the Era's own `until_date`, not looked up across its siblings: the Era after it may
    // have held no Race and so not be in the list to find.
    expect(screen.getByRole('button', { name: 'Before 4 Jul' })).toBeInTheDocument()
  })

  it('orders the Eras newest first, which is the one a sailor wants', () => {
    const races = season()
    renderDial({
      eras: [
        asymmetryEra([races[0]], { era: era('AWA', null, '2026-07-04') }),
        asymmetryEra([races[1]], { era: era('AWA', '2026-07-04') }),
      ],
      compassEras: [],
    })

    // The service hands Eras over oldest first, because that is the order a season is computed in
    // and not the order it is read in. The Era the boat is in now comes first.
    expect(levelChips()).toEqual(['Season · 2 Races', 'Since 4 Jul', 'Before 4 Jul'])
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

    await pickRace('3 Jun · Beer-can · 2 Tack Pairs')

    // Two pairs, four dots.
    expect(screen.getAllByTestId('tack-pair-dot')).toHaveLength(4)
  })

  it('draws the season behind a narrower level, so one Race is never read in isolation', async () => {
    const { container } = renderDial()

    const greyBefore = container.querySelectorAll('[stroke="var(--text-muted)"]').length
    await pickRace('3 Jun · Beer-can · 2 Tack Pairs')

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

    await pickRace('24 Jul — no two steady segments on opposite tacks close enough together')

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

    await pickRace('3 Jun · Beer-can · 2 Tack Pairs')

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'No downwind pairs here, so the check that separates a vane set off-centre from everything else cannot be made.'
    )
  })

  it('states coverage off the level on screen, not off the season behind it', async () => {
    renderDial()

    // The season's weaker side has one downwind pair. June has none at all, so a verdict read off
    // the season while the dial drew June would describe pairs that are not on screen.
    expect(screen.getByTestId('coverage-verdict')).toHaveTextContent(
      '1 Tack Pair downwind, against 3 upwind'
    )

    await pickRace('3 Jun · Beer-can · 2 Tack Pairs')

    expect(screen.getByTestId('coverage-verdict')).toHaveTextContent(
      'no Tack Pair downwind, against 2 upwind'
    )
  })

  it('says neither way, rather than opposite ways, where a point of sail reads symmetric', () => {
    const races = [
      raceAsymmetry('race-june', '2026-06-03 19:00:00', [
        // Both tacks held 40°: a measured symmetry, which leans no way at all. `Math.sign(0)` is 0
        // and would have reported this as the opposite of any downwind lean whatsoever.
        pair('upwind', 40, 40, '2026-06-03 19:12:00'),
        pair('downwind', 150, 140, '2026-06-03 19:50:00'),
      ]),
    ]
    renderDial({ season: asymmetryEra(races), eras: [asymmetryEra(races, { era: era('HDG', null) })] })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent(
      'Upwind the two tacks held the same angle, so there is nothing to compare the other point of sail’s lean against.'
    )
  })

  it('steps through the pairs with the arrow keys, as the two linear charts do', () => {
    renderDial()

    fireEvent.keyDown(screen.getByTestId('tack-dial-svg'), { key: 'ArrowRight' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('starboard 36.0°')

    fireEvent.keyDown(screen.getByTestId('tack-dial-svg'), { key: 'ArrowRight' })

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('starboard 34.0°')
  })

  it('offers a way back to the season from a picked pair, since a 3.6px dot is hard to find twice', async () => {
    renderDial()

    await userEvent.click(screen.getAllByTestId('tack-pair-dot')[0])
    await userEvent.click(screen.getByRole('button', { name: 'back to the season' }))

    expect(screen.getByTestId('chart-readout')).toHaveTextContent('Upwind · AWA < 50°')
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

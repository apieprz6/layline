/**
 * Amending which Boat Setup Versions a race was sailed under, from the race's own page.
 *
 * The panel exists because every pointer stays changeable (ADR 0012) and because the archive is being
 * entered backwards: most of these are filled in long after the race was filed. So what is tested first
 * is that it opens holding what the Race holds — an amendment is a correction of a stated answer, and a
 * panel that opened blank would invite the sailor to clear four pointers by saving one.
 *
 * Then the two couplings, which are the only reason this is one call rather than five. The Rig Tune
 * Version and its Wind Band are one answer in two columns, so moving the Version has to let go of a band
 * that belonged to the old one — bands do not migrate (ADR 0007), and the composite key on `races` would
 * refuse the pair. And moving the Crossover Chart Version deletes the Sail Configurations named in the
 * old vocabulary (ADR 0023), so it says what it will cost and sends the count it said.
 *
 * Nowhere in any of it is a change reason, and that absence is asserted. A pointer is the sailor's own
 * answer about their own boat; a reason field would only stop it being corrected.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  CrossoverChartChoice,
  RaceBoatSetup,
  RaceBoatSetupChoices,
  RaceBoatSetupPointers,
  UpdateRaceBoatSetupResult,
} from '@/types'
import RaceBoatSetupPanel from '../RaceBoatSetupPanel'

const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), refresh })),
}))

/**
 * The boat's Versions, with more of each than the Race names.
 *
 * Rig Tune v3 and v4 have different bands and no band in common, which is what a re-tune is: new rows
 * with new ids. That is what makes "moving the Version drops the band" observable rather than a shape
 * nothing can tell apart.
 */
const CHOICES: RaceBoatSetupChoices = {
  polar: [
    { version_id: 'polar-2', version_number: 2, effective_from: '2026-07-01' },
    { version_id: 'polar-1', version_number: 1, effective_from: '2026-02-10' },
  ],
  rig_tune: [
    {
      version_id: 'tune-4',
      version_number: 4,
      effective_from: '2026-08-01',
      bands: [{ band_id: 'v4-all', low_kt: 0, high_kt: null, is_base: true, label: null }],
    },
    {
      version_id: 'tune-3',
      version_number: 3,
      effective_from: '2026-04-20',
      bands: [
        { band_id: 'v3-light', low_kt: 0, high_kt: 8, is_base: false, label: 'Light' },
        { band_id: 'v3-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
      ],
    },
  ],
  instrument_calibration: [
    { version_id: 'cal-1', version_number: 1, effective_from: '2026-03-02' },
  ],
}

const CHARTS: CrossoverChartChoice[] = [
  { version_id: 'chart-2', version_number: 2, effective_from: '2026-07-01', definitions: [] },
  { version_id: 'chart-1', version_number: 1, effective_from: '2026-01-15', definitions: [] },
]

/** What the Race holds now: Polar v1, Chart v1, Rig Tune v3 and its Base band, Calibration v1. */
const SETUP: RaceBoatSetup = {
  polar: { version_id: 'polar-1', version_number: 1, effective_from: '2026-02-10' },
  crossover_chart: { version_id: 'chart-1', version_number: 1, effective_from: '2026-01-15' },
  rig_tune: { version_id: 'tune-3', version_number: 3, effective_from: '2026-04-20' },
  instrument_calibration: { version_id: 'cal-1', version_number: 1, effective_from: '2026-03-02' },
  band: { band_id: 'v3-base', low_kt: 8, high_kt: 12, is_base: true, label: 'Base' },
  logged_tws_mean: 11.4,
}

/** Nothing recorded, which is the state of the archive's nine oldest races. */
const NOTHING: RaceBoatSetup = {
  polar: null,
  crossover_chart: null,
  rig_tune: null,
  instrument_calibration: null,
  band: null,
  logged_tws_mean: 11.4,
}

function mount(
  setup: RaceBoatSetup = SETUP,
  {
    sailEntryCount = 0,
    choices = CHOICES as RaceBoatSetupChoices | null,
    charts = CHARTS as CrossoverChartChoice[] | null,
    result = { ok: true as const, cleared_sail_entries: 0 } as UpdateRaceBoatSetupResult,
  } = {}
) {
  // Typed by its call signature rather than by a parameter the stub does not read, so
  // `mock.calls[0][1]` is the payload the panel actually sent and not an element of an empty tuple.
  const amend = jest.fn<
    Promise<UpdateRaceBoatSetupResult>,
    [string, RaceBoatSetupPointers, number]
  >(async () => result)

  render(
    <RaceBoatSetupPanel
      raceId="race-1"
      setup={setup}
      choices={choices}
      charts={charts}
      sailEntryCount={sailEntryCount}
      amendBoatSetup={amend}
    />
  )

  return { amend }
}

/** The chips of one picker, by the legend above them. */
function picker(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

function save(): HTMLElement {
  return screen.getByTestId('race-boat-setup-save')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('what the panel opens holding', () => {
  it('holds exactly what the Race holds, on every one of the five', () => {
    mount()

    expect(picker('Polar').getByRole('button', { name: 'v1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Crossover Chart').getByRole('button', { name: 'v1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Rig Tune').getByRole('button', { name: 'v3' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Wind Band').getByRole('button', { name: 'Base · 8–12 kt' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Instrument Calibration').getByRole('button', { name: 'v1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('holds “Not recorded” on all five for a race that names none of them', () => {
    // And every Version is still on offer, because filling one in years later is the ordinary case.
    mount(NOTHING)

    expect(picker('Polar').getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Polar').getByRole('button', { name: 'v2' })).toBeEnabled()
    expect(
      picker('Wind Band').getByRole('button', { name: 'Pick a Rig Tune Version first' })
    ).toBeDisabled()
  })

  it('asks for no reason and stamps nothing', () => {
    // AC 8. A pointer is the sailor's own answer about their own boat, and this archive is entered
    // backwards — a reason field would only stop the answer being corrected.
    mount()

    // Nothing to type into, and one press away from saved: five chip rows and the button.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(5)
    // The panel says out loud that there is nothing to give, which is the promise being kept.
    expect(screen.getByText(/there is no reason to give and nothing is stamped/)).toBeInTheDocument()
  })

  it('says so and offers nothing when the Versions could not be read', () => {
    // A failed read is not "the boat has no Versions", and what the Race already records is stated
    // above this panel and is untouched by it.
    mount(SETUP, { choices: null, charts: null })

    expect(screen.getByText(/could not be read just now/)).toBeInTheDocument()
    expect(screen.queryByTestId('race-boat-setup-save')).not.toBeInTheDocument()
  })

  it('closes on either read failing, not only on both', () => {
    // An empty picker draws "None to name", which states that the boat has no Versions of that kind.
    // Four honest answers beside one invented one is worse than none, because Save sends all five
    // together and would write the invented one down.
    mount(SETUP, { charts: null })

    expect(screen.getByText(/could not be read just now/)).toBeInTheDocument()
    expect(screen.queryByText('None to name')).not.toBeInTheDocument()
    expect(screen.queryByTestId('race-boat-setup-save')).not.toBeInTheDocument()
  })

  it('closes when the other read is the one that failed', () => {
    mount(SETUP, { choices: null })

    expect(screen.getByText(/could not be read just now/)).toBeInTheDocument()
    expect(screen.queryByTestId('race-boat-setup-save')).not.toBeInTheDocument()
  })
})

describe('changing a pointer', () => {
  it('sends all five as the sailor left them, and no clearing', async () => {
    const user = userEvent.setup({ delay: null })
    const { amend } = mount()

    await user.click(picker('Polar').getByRole('button', { name: 'v2' }))
    await user.click(picker('Instrument Calibration').getByRole('button', { name: 'Not recorded' }))
    await user.click(save())

    expect(amend).toHaveBeenCalledWith(
      'race-1',
      {
        polar_version_id: 'polar-2',
        crossover_chart_version_id: 'chart-1',
        rig_tune_version_id: 'tune-3',
        instrument_calibration_version_id: null,
        rig_tune_band_id: 'v3-base',
      },
      0
    )
    // The page reads its Boat Setup on the server, so the new pointers arrive by re-rendering it.
    expect(refresh).toHaveBeenCalled()
  })

  it('sets a pointer back to not recorded, as a real answer', async () => {
    const user = userEvent.setup({ delay: null })
    const { amend } = mount()

    await user.click(picker('Polar').getByRole('button', { name: 'Not recorded' }))
    await user.click(save())

    expect(amend.mock.calls[0][1].polar_version_id).toBeNull()
  })
})

describe('the Wind Band, which is not a pointer of its own', () => {
  it('offers only the named Rig Tune Version’s own bands', async () => {
    // AC 4. The composite key `races (rig_tune_version_id, rig_tune_band_id)` is what refuses a foreign
    // band; this only keeps the form from offering one.
    mount()

    expect(picker('Wind Band').getByRole('button', { name: 'Light · 0–8 kt' })).toBeInTheDocument()
    expect(picker('Wind Band').getByRole('button', { name: 'Base · 8–12 kt' })).toBeInTheDocument()
    // v4's only band, which belongs to a Version this Race does not name.
    expect(
      picker('Wind Band').queryByRole('button', { name: '0 kt and up' })
    ).not.toBeInTheDocument()
  })

  it('closes the picker, disabled and still there, when the Rig Tune is cleared', async () => {
    const user = userEvent.setup({ delay: null })
    const { amend } = mount()

    await user.click(picker('Rig Tune').getByRole('button', { name: 'Not recorded' }))

    // Disabled rather than gone: a row that vanished would not say why (ADR 0014).
    expect(
      picker('Wind Band').getByRole('button', { name: 'Pick a Rig Tune Version first' })
    ).toBeDisabled()

    await user.click(save())

    // Both columns cleared in the one statement. `band_requires_rig_tune` refuses a band with no
    // Version, so sending the band on alone is not a thing the panel may do.
    expect(amend.mock.calls[0][1]).toMatchObject({
      rig_tune_version_id: null,
      rig_tune_band_id: null,
    })
  })

  it('drops a band the Version being moved to does not have', async () => {
    // AC 6. v3's Base band is not a band of v4, so naming v4 lets it go — in the same statement, which
    // is the only order the composite key permits.
    const user = userEvent.setup({ delay: null })
    const { amend } = mount()

    await user.click(picker('Rig Tune').getByRole('button', { name: 'v4' }))

    expect(picker('Wind Band').getByRole('button', { name: 'Not recorded' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(picker('Wind Band').getByRole('button', { name: '0 kt and up' })).toBeInTheDocument()

    await user.click(save())

    expect(amend.mock.calls[0][1]).toMatchObject({
      rig_tune_version_id: 'tune-4',
      rig_tune_band_id: null,
    })
  })

  it('states a band that disagrees with the logged wind, and saves regardless', async () => {
    // AC 7. The sailor may well have tuned for the forecast rather than the breeze that arrived, so this
    // is a sentence and never a block — ADR 0009 keeps refusals to two and this is neither of them.
    const user = userEvent.setup({ delay: null })
    const { amend } = mount()

    await user.click(picker('Wind Band').getByRole('button', { name: 'Light · 0–8 kt' }))

    expect(screen.getByTestId('race-boat-setup-band-note').textContent).toBe(
      'Recorded in the Light band (0–8 kt); logged wind averaged 11.4 kt.'
    )
    expect(save()).toBeEnabled()

    await user.click(save())

    expect(amend.mock.calls[0][1].rig_tune_band_id).toBe('v3-light')
  })
})

describe('moving the Crossover Chart Version, which costs Testimony', () => {
  it('says how many Sail Configurations saving will take off', async () => {
    const user = userEvent.setup({ delay: null })
    mount(SETUP, { sailEntryCount: 3 })

    expect(screen.queryByTestId('race-boat-setup-clearing')).not.toBeInTheDocument()

    await user.click(picker('Crossover Chart').getByRole('button', { name: 'v2' }))

    expect(screen.getByTestId('race-boat-setup-clearing').textContent).toContain(
      '3 Sail Configurations'
    )
  })

  it('sends the count it said, so the function can refuse a stale agreement', async () => {
    // Not politeness: `amend_race_boat_setup` refuses unless this is the count actually standing, so a
    // Configuration added between the reading and the press cannot be swept away by an agreement made
    // before it existed.
    const user = userEvent.setup({ delay: null })
    const { amend } = mount(SETUP, {
      sailEntryCount: 3,
      result: { ok: true, cleared_sail_entries: 3 },
    })

    await user.click(picker('Crossover Chart').getByRole('button', { name: 'v2' }))
    await user.click(save())

    expect(amend.mock.calls[0][2]).toBe(3)
    expect(screen.getByTestId('race-boat-setup-saved').textContent).toContain(
      '3 Sail Configurations'
    )
  })

  it('does not re-offer a clearing the first press already spent', async () => {
    // `router.refresh()` is not instant, so a second press lands while the props still describe the
    // page as it was read. Measured against the props, it would resend a count of Configurations that
    // no longer exist, and `amend_race_boat_setup` refuses a count that is not standing — the sailor
    // would be told the save failed for what is really the panel's own stale arithmetic.
    const user = userEvent.setup({ delay: null })
    const { amend } = mount(SETUP, {
      sailEntryCount: 3,
      result: { ok: true, cleared_sail_entries: 3 },
    })

    await user.click(picker('Crossover Chart').getByRole('button', { name: 'v2' }))
    await user.click(save())
    await user.click(save())

    expect(amend.mock.calls[0][2]).toBe(3)
    expect(amend.mock.calls[1][2]).toBe(0)
    // And it stops saying it will take Testimony off, because there is none left to take.
    expect(screen.queryByTestId('race-boat-setup-clearing')).not.toBeInTheDocument()
  })

  it('sends no clearing when the chart pointer is put back where it was', async () => {
    const user = userEvent.setup({ delay: null })
    const { amend } = mount(SETUP, { sailEntryCount: 3 })

    await user.click(picker('Crossover Chart').getByRole('button', { name: 'v2' }))
    await user.click(picker('Crossover Chart').getByRole('button', { name: 'v1' }))

    expect(screen.queryByTestId('race-boat-setup-clearing')).not.toBeInTheDocument()

    await user.click(save())

    // A non-zero count on an amendment that leaves the chart alone is refused by the function outright,
    // because the panel and the database would disagree about what the amendment is.
    expect(amend.mock.calls[0][2]).toBe(0)
  })
})

describe('what the sailor is told', () => {
  it('states a refusal and changes nothing on screen', async () => {
    const user = userEvent.setup({ delay: null })
    mount(SETUP, {
      result: {
        ok: false,
        message: 'Only an admin can change which Versions a race was sailed under.',
      },
    })

    await user.click(picker('Polar').getByRole('button', { name: 'v2' }))
    await user.click(save())

    const error = screen.getByTestId('race-boat-setup-error')
    expect(error).toHaveAttribute('role', 'alert')
    expect(error.textContent).toBe('Only an admin can change which Versions a race was sailed under.')
    expect(screen.queryByTestId('race-boat-setup-saved')).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
    // The choice is still where the sailor put it, so the second press is the same amendment.
    expect(picker('Polar').getByRole('button', { name: 'v2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('says it saved, without listing Testimony that was never at risk', async () => {
    const user = userEvent.setup({ delay: null })
    mount()

    await user.click(picker('Polar').getByRole('button', { name: 'v2' }))
    await user.click(save())

    const saved = screen.getByTestId('race-boat-setup-saved')
    expect(saved).toHaveAttribute('role', 'status')
    expect(saved.textContent).toBe('Saved.')
  })
})

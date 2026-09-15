import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import type {
  CalibrationEvent,
  InstrumentCalibrationPayload,
  InstrumentCalibrationRecord,
  InstrumentCalibrationVersion,
} from '@/types'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returned would
  // let the page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

// What PostgREST is asked for is readInstrumentCalibration's own suite.
jest.mock('@/services/boat/readInstrumentCalibration', () => ({
  readInstrumentCalibration: jest.fn(),
}))

// No test here submits, but the three client forms import the actions and the real
// module reaches for `next/cache` and a Supabase client. Their refusals are covered
// by the actions suite, which is where the Role check belongs.
jest.mock('../actions', () => ({
  recordCalibrationVersion: jest.fn(async () => ({ ok: true })),
  correctCalibrationVersion: jest.fn(async () => ({ ok: true })),
  addCalibrationEvent: jest.fn(async () => ({ ok: true })),
}))

import InstrumentCalibrationPage from '../page'

const ADMIN = { ...CREW, role: 'admin' as const }

/** The archive's figures, in the display's own encoding. */
const AS_PROGRAMMED: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

const V1: InstrumentCalibrationVersion = {
  id: 'version-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  version_number: 1,
  effective_from: '2026-05-30',
  recorded_at: '2026-05-30T19:00:00Z',
  note: null,
  created_by: 'owner-1',
  filename: null,
  content_sha256: null,
  payload: AS_PROGRAMMED,
}

const AUTOCOMPENSATION: CalibrationEvent = {
  id: 'event-1',
  artifact_id: 'artifact-1',
  kind: 'instrument_calibration',
  occurred_on: '2026-07-04',
  type: 'autocompensation',
  channels: ['HDG'],
  note: 'Swung the compass off Navy Pier; deviation rebuilt.',
  created_by: 'owner-1',
  created_at: '2026-07-04T18:00:00Z',
  updated_at: '2026-07-04T18:00:00Z',
}

/** Nothing recorded yet: the artifact exists and has no Version behind it. */
const EMPTY: InstrumentCalibrationRecord = {
  artifactId: 'artifact-1',
  currentVersionId: null,
  versions: [],
  events: [],
}

const RECORDED: InstrumentCalibrationRecord = {
  artifactId: 'artifact-1',
  currentVersionId: V1.id,
  versions: [V1],
  events: [AUTOCOMPENSATION],
}

describe('/boat-management/instrument-calibration', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readInstrumentCalibration } = jest.requireMock(
    '@/services/boat/readInstrumentCalibration'
  )

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
    readInstrumentCalibration.mockResolvedValue(RECORDED)
  })

  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await InstrumentCalibrationPage())
    return container
  }

  it('sends a Guest to sign in with this route kept, and renders them nothing', async () => {
    await expect(InstrumentCalibrationPage()).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-management%2Finstrument-calibration')
    // There is no signed-out form of this screen — not a locked one either, since
    // ADR 0015's LAY-102 amendment deleted it. So nothing renders and nothing is read.
    expect(document.body.textContent).toBe('')
    expect(readInstrumentCalibration).not.toHaveBeenCalled()
  })

  it('shows every signed-in sailor what is programmed, in the display’s own encoding', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    const values = screen.getByTestId('calibration-values')
    expect(values).toBeInTheDocument()
    // 1.02 and not "+2%": the figure on the boat, not a conversion of it.
    expect(values.textContent).toContain('1.02')
    expect(values.textContent).not.toMatch(/%/)
    // AWA and HDG have no such field on the display, so neither reads 1.00.
    expect(screen.getAllByText('no multiplier')).toHaveLength(2)
  })

  it('says on the screen which encoding is meant', async () => {
    resolveAccount.mockResolvedValue(CREW)

    const page = await renderPage()

    expect(page.textContent).toMatch(/not \+2%/)
    expect(page.textContent).toMatch(/multiplier × reading \+ offset/)
  })

  it('states the Version in force by number and effective date', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByText(/v1 current · effective 30 May 2026/)).toBeInTheDocument()
  })

  it('says the values are not recorded rather than showing zeros', async () => {
    resolveAccount.mockResolvedValue(CREW)
    readInstrumentCalibration.mockResolvedValue(EMPTY)

    const page = await renderPage()

    expect(screen.getByTestId('not-recorded')).toBeInTheDocument()
    expect(screen.queryByTestId('calibration-values')).not.toBeInTheDocument()
    expect(page.textContent).toMatch(/not showing zeros/)
  })

  it('renders the Calibration Log as one dated timeline over both sources', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    const log = screen.getByTestId('calibration-log')
    expect(log.textContent).toContain('Autocompensation · HDG')
    expect(log.textContent).toContain('First recorded · v1')
    expect(log.textContent).toContain('AWA offset set to 2°')
  })

  it('has no second Version history beside the Log', async () => {
    resolveAccount.mockResolvedValue(CREW)

    const page = await renderPage()

    // The mockup had both. The Log *is* the Version history, because "what changed"
    // and "when was it changed" are one question (ADR 0005).
    expect(page.textContent).not.toMatch(/version history/i)
    expect(page.textContent).not.toMatch(/uploaded by/i)
  })

  it('offers nothing that pretends to reach the instruments, and no file', async () => {
    resolveAccount.mockResolvedValue(ADMIN)

    const page = await renderPage()

    expect(page.textContent).not.toMatch(/push to instruments/i)
    expect(page.textContent).not.toMatch(/\.cal\b/)
    expect(page.textContent).not.toMatch(/download|upload/i)
    expect(screen.queryByRole('button', { name: /download|upload|push/i })).not.toBeInTheDocument()
  })

  it('lets a signed-in non-admin read everything and write nothing', async () => {
    resolveAccount.mockResolvedValue({ ...CREW, role: 'viewer' })

    await renderPage()

    expect(screen.getByTestId('calibration-values')).toBeInTheDocument()
    expect(screen.getByTestId('calibration-log')).toBeInTheDocument()

    // Not a check in itself — each action re-checks the Role and RLS refuses again
    // (ADR 0019) — but the screen must not offer what it would refuse.
    expect(screen.queryByTestId('calibration-writes')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('gives an admin the three writes, each named for what it does', async () => {
    resolveAccount.mockResolvedValue(ADMIN)

    await renderPage()

    expect(screen.getByTestId('calibration-writes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record new values' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a calibration event' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    ).toBeInTheDocument()
  })

  it('offers no correction when there is no Version to correct', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    readInstrumentCalibration.mockResolvedValue(EMPTY)

    await renderPage()

    expect(screen.getByRole('button', { name: 'Record new values' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Correct a recorded Version in place' })
    ).not.toBeInTheDocument()
  })

  it('records all four channels, with no multiplier field for AWA or HDG', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Record new values' }))

    expect(screen.getByTestId('calibration-version-form')).toBeInTheDocument()
    // Six figures, not eight: a multiplier for AWA or HDG would be a field the
    // display does not have, and a value nobody programmed.
    expect(screen.getAllByRole('spinbutton')).toHaveLength(6)
    expect(screen.getAllByLabelText('Multiplier')).toHaveLength(2)
    expect(screen.getAllByLabelText(/^Offset/)).toHaveLength(4)

    // `effective_from` is asked for on its own; `recorded_at` is the database's.
    expect(screen.getByLabelText(/Effective from/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Note \(optional\)/)).toBeInTheDocument()
  })

  it('warns on an implausible figure without refusing it', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Record new values' }))

    const awaOffset = screen.getByLabelText('Offset (°)', { selector: '#cal-offset-AWA' })
    await userEvent.clear(awaOffset)
    await userEvent.type(awaOffset, '95')

    const warning = screen.getByTestId('calibration-warning-AWA-offset')
    expect(warning.textContent).toMatch(/outside the usual/)
    expect(warning.textContent).toMatch(/saved as typed/)
    // A remark on a figure about to be stored, not a refusal of it.
    expect(warning).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Record the Version' })).toBeEnabled()
    // And the browser must not clamp it on the form's behalf either.
    expect(awaOffset).not.toHaveAttribute('max')
    expect(awaOffset).not.toHaveAttribute('min')
  })

  it('says what a correction costs before it is made', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    await renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Correct a recorded Version in place' })
    )

    expect(screen.getByTestId('correction-consequence').textContent).toMatch(
      /every race already sailed under it/i
    )
    // Prefilled with what is recorded: a correction is a retype of one figure, not
    // of all six.
    expect(screen.getByLabelText('Offset (°)', { selector: '#cal-offset-AWA' })).toHaveValue(2)
    expect(screen.getByLabelText(/Effective from/)).toHaveValue('2026-05-30')
    expect(screen.getByRole('button', { name: 'Save the correction' })).toBeInTheDocument()
  })

  it('adds a calibration event with no value field anywhere on the form', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Add a calibration event' }))

    const form = screen.getByTestId('calibration-event-form')
    expect(screen.getByLabelText(/^Date$/)).toBeRequired()
    expect(screen.getByLabelText(/^Note$/)).toBeRequired()

    // The absence is the point: an autocompensation produces no figure, so an Event
    // that carried one would claim something the act does not do (ADR 0005).
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(form.querySelector('input[type="number"]')).toBeNull()
    expect(form.textContent).not.toMatch(/multiplier|offset/i)
  })

  it('leaves an autocompensation no channel to choose', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add a calibration event' }))

    const form = screen.getByTestId('calibration-event-form')

    // It is a compass operation by definition, so three of the four choices would
    // only ever be refused — by the action and by the database's own constraint.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(form.querySelector('input[name="channels"]')).toHaveValue('HDG')

    await userEvent.click(screen.getByRole('radio', { name: /Other/ }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })

  it('says so plainly when the calibration cannot be read, and shows no figures', async () => {
    resolveAccount.mockResolvedValue(ADMIN)
    readInstrumentCalibration.mockResolvedValue(null)

    const page = await renderPage()

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.queryByTestId('calibration-values')).not.toBeInTheDocument()
    expect(screen.queryByTestId('calibration-writes')).not.toBeInTheDocument()
    expect(page.textContent).toMatch(/could not be read/)
  })
})

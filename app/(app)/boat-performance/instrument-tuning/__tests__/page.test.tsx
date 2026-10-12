import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { tuningSeason } from '@/components/boat/instrument-tuning/__tests__/fixtures'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

// The whole-archive read: every Race's whole Transcription, which is its own module's business.
jest.mock('@/services/analysis/readInstrumentTuning', () => ({
  readInstrumentTuning: jest.fn(async () => ({ ok: false, reason: 'no-races' })),
}))

import InstrumentTuningPage from '../page'

/**
 * The route: who is served, the way back out of it, and the three answers its read can produce.
 *
 * What the charts *say* is `components/boat/instrument-tuning/__tests__/`'s, and what they say over
 * the owner's real season is `archive-charts.test.tsx`'s. What is asked here is the page's own job.
 */
describe('/boat-performance/instrument-tuning', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readInstrumentTuning } = jest.requireMock('@/services/analysis/readInstrumentTuning')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
    readInstrumentTuning.mockResolvedValue({
      ok: true,
      season: tuningSeason(),
      log: [],
      races: [],
    })
  })

  async function renderPage(): Promise<void> {
    render(await resolveServerTree(await InstrumentTuningPage()))
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(InstrumentTuningPage()).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-performance%2Finstrument-tuning')
    // Not even the heading: a Guest is shown no part of the screen.
    expect(document.body.textContent).toBe('')
  })

  it('keeps the way back to the section it belongs to', async () => {
    await renderPage()

    // The screen is reached by tapping a row on the Overall tab, and the drawer names sections
    // rather than the screens inside them — so without this there is no way back up at all.
    expect(screen.getByRole('link', { name: '← Boat performance' })).toHaveAttribute(
      'href',
      '/boat-performance'
    )
    expect(screen.getByRole('heading', { name: 'Instrument tuning' })).toBeInTheDocument()
  })

  it('draws the three charts over a season it could read', async () => {
    await renderPage()

    expect(screen.getByTestId('compass-chart')).toBeInTheDocument()
    expect(screen.getByTestId('tack-dial')).toBeInTheDocument()
    expect(screen.getByTestId('speed-check-chart')).toBeInTheDocument()
  })

  it('says there is nothing to measure yet, which is not a failure', async () => {
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'no-races' })

    await renderPage()

    expect(screen.getByText('No races to measure yet')).toBeInTheDocument()
    expect(screen.queryByTestId('compass-chart')).not.toBeInTheDocument()
    // Still a way out of a screen with nothing on it.
    expect(screen.getByRole('link', { name: '← Boat performance' })).toBeInTheDocument()
  })

  it('tells a failed read apart from an empty archive, and draws no part of a season', async () => {
    readInstrumentTuning.mockResolvedValue({ ok: false, reason: 'unreadable' })

    await renderPage()

    // The read is all-or-nothing: a season computed over the Races that happened to load would
    // present as a complete season, and its coverage verdicts would be a claim about other evidence.
    expect(screen.getByText('The archive could not be read')).toBeInTheDocument()
    expect(screen.queryByTestId('compass-chart')).not.toBeInTheDocument()
  })
})

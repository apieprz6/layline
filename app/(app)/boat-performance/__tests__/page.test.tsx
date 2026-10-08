import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CREW } from '@/__tests__/fixtures/accounts'
import { resolveServerTree } from '@/__tests__/helpers/resolveServerTree'
import { ROWS, RACES, VOCABULARY } from '@/components/analysis/__tests__/fixture'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

// The Overall tab reads the whole archive, scored (LAY-155). Mocked here because what this suite
// asks is whether the tab gets its own boundary and its own content — `readAnalysisArchive`'s own
// behaviour is its module's business.
jest.mock('@/services/analysis/readArchive', () => ({
  readAnalysisArchive: jest.fn(async () => null),
}))

import BoatPerformancePage from '../page'

describe('/boat-performance', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readAnalysisArchive } = jest.requireMock('@/services/analysis/readArchive')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
    readAnalysisArchive.mockResolvedValue({ rows: [], races: [], vocabulary: { sails: [], months: [] } })
  })

  // The read sits behind a `<Suspense>` (LAY-132), so awaiting the page hands back a
  // tree with the archive still unresolved inside it. `resolveServerTree` calls it the
  // way the server does, which is what puts the settled screen in front of these
  // assertions rather than its skeleton.
  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await resolveServerTree(await BoatPerformancePage()))
    // And prove it did: an unresolved tree renders the skeleton, which the negative
    // assertions below would sail straight through.
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    return container
  }

  it('serves a Guest nothing, and sends them to sign in with this route kept', async () => {
    await expect(BoatPerformancePage()).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/?signin=%2Fboat-performance')
    // Not even the tab strip: a Guest is shown no part of the screen, rather than
    // its shape with the readings taken out.
    expect(document.body.textContent).toBe('')
  })

  it('opens both tabs once the sailor is signed in', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByRole('tab', { name: 'Races' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overall' })).toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('the Overall tab', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')
  const { readAnalysisArchive } = jest.requireMock('@/services/analysis/readArchive')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(CREW)
  })

  async function renderOverall(): Promise<void> {
    render(await resolveServerTree(await BoatPerformancePage()))
    await userEvent.setup({ delay: null }).click(screen.getByRole('tab', { name: 'Overall' }))
  }

  it('heroes the Polar performance teaser, which taps through to the detail screen', async () => {
    readAnalysisArchive.mockResolvedValue({
      rows: ROWS,
      races: RACES,
      vocabulary: VOCABULARY,
    })

    await renderOverall()

    const teaser = screen.getByTestId('polar-performance-teaser')
    expect(teaser).toHaveAttribute('href', '/boat-performance/polar')
    // Five races asked for, two in the archive: the card says two rather than claiming five.
    expect(teaser).toHaveTextContent('across 2 races')
  })

  it('says there is nothing to summarise rather than drawing a figure over no rows', async () => {
    readAnalysisArchive.mockResolvedValue({ rows: [], races: [], vocabulary: VOCABULARY })

    await renderOverall()

    expect(screen.getByText('Nothing to summarise yet')).toBeInTheDocument()
    expect(screen.queryByTestId('polar-performance-teaser')).not.toBeInTheDocument()
  })

  it('tells a failed read apart from an empty archive', async () => {
    readAnalysisArchive.mockResolvedValue(null)

    await renderOverall()

    // "No races" over a failed read would be Layline claiming the sailor has sailed nothing.
    expect(screen.getByText('The season could not be read')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { AuthSheetOpener } from '@/components/auth/authSheetOpener'
import type { Account } from '@/types'

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

import BoatPerformancePage from '../page'

const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'viewer',
}

describe('/boat-performance', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
  })

  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(
      <AuthSheetOpener value={jest.fn()}>{await BoatPerformancePage()}</AuthSheetOpener>
    )
    return container
  }

  it('renders the locked screen for a Guest — no 404 and no redirect', async () => {
    const container = await renderPage()

    expect(screen.getByRole('heading', { name: 'Boat performance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByTestId('locked-placeholder')).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
    // Not even the tab strip: a Guest is shown the shape of nothing, not the
    // shape of the screen they cannot read.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('names no boat and shows no figure to a Guest', async () => {
    const container = await renderPage()

    expect(container.textContent).not.toMatch(/handsome pete|beneteau/i)
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('opens both tabs once the sailor is signed in', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderPage()

    expect(screen.getByRole('tab', { name: 'Races' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overall' })).toBeInTheDocument()
    expect(screen.queryByTestId('locked-placeholder')).not.toBeInTheDocument()
  })
})

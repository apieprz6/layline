import { render, screen } from '@testing-library/react'
import { CREW } from '@/__tests__/fixtures/accounts'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

import BoatPerformancePage from '../page'

describe('/boat-performance', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
  })

  async function renderPage(): Promise<HTMLElement> {
    const { container } = render(await BoatPerformancePage())
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

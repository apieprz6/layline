import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OAuthGrant } from '@supabase/supabase-js'
import ConnectedApps from '../ConnectedApps'

const listGrants = jest.fn()
const revokeGrant = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { oauth: { listGrants, revokeGrant } } }),
}))

function grant(id: string, name: string, granted_at: string): OAuthGrant {
  return { client: { id, name, uri: '', logo_uri: '' }, scopes: ['openid', 'email'], granted_at }
}

const CLAUDE = grant('c1a0de00-0000-4000-8000-000000000001', 'Claude', '2026-10-17T12:04:00Z')
const CURSOR = grant('c0750000-0000-4000-8000-000000000002', 'cursor-mcp (laptop)', '2026-10-18T14:30:00Z')

describe('ConnectedApps', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    // The failure cases log, as they should; the log is not what these tests are about.
    jest.spyOn(console, 'error').mockImplementation(() => {})
    listGrants.mockResolvedValue({ data: [CLAUDE, CURSOR], error: null })
    revokeGrant.mockResolvedValue({ data: {}, error: null })
  })

  it('lists each app under the name it gave itself, with when it was granted in local time', async () => {
    render(<ConnectedApps />)

    const list = await screen.findByRole('list', { name: 'Connected apps' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Claude')
    expect(items[1]).toHaveTextContent('cursor-mcp (laptop)')
    // Midday UTC is the same day in every zone a sailor reads from; the hour is
    // `formatMoment`'s, tested with a named zone in `timeFormatting.test.ts`.
    expect(items[0]).toHaveTextContent(/Connected 17 Oct 2026, \d\d:04/)
    expect(screen.getByText(/the name each app gave itself/i)).toBeInTheDocument()
  })

  it('says so when no app is connected', async () => {
    listGrants.mockResolvedValue({ data: [], error: null })
    render(<ConnectedApps />)

    expect(await screen.findByText('No apps connected yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Connected apps' })).not.toBeInTheDocument()
  })

  it('shows an error, never an empty list, when the grants cannot be read', async () => {
    listGrants.mockResolvedValue({ data: null, error: new Error('OAuth server is disabled') })
    render(<ConnectedApps />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your connected apps.')
    expect(screen.queryByText('No apps connected yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Connected apps' })).not.toBeInTheDocument()
  })

  it('shows the same error when the request itself throws', async () => {
    listGrants.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ConnectedApps />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your connected apps.')
  })

  describe('revoking', () => {
    async function claudeRow(): Promise<HTMLElement> {
      const list = await screen.findByRole('list', { name: 'Connected apps' })
      return within(list).getAllByRole('listitem')[0]
    }

    it('asks first, says access ends when the app’s current token runs out, and can be cancelled', async () => {
      const user = userEvent.setup()
      render(<ConnectedApps />)
      const row = await claudeRow()

      await user.click(within(row).getByRole('button', { name: 'Revoke' }))
      expect(revokeGrant).not.toHaveBeenCalled()
      expect(row).toHaveTextContent('Revoke Claude?')
      expect(row).toHaveTextContent(/stops within the hour/)
      expect(row).toHaveTextContent(/sign in and approve again/i)

      await user.click(within(row).getByRole('button', { name: 'Cancel' }))
      expect(revokeGrant).not.toHaveBeenCalled()
      expect(within(row).getByRole('button', { name: 'Revoke' })).toBeInTheDocument()
    })

    it('revokes that app’s grant by its client id, and removes the row only once that succeeds', async () => {
      let succeed: (value: { data: object; error: null }) => void = () => {}
      revokeGrant.mockReturnValue(new Promise((resolve) => (succeed = resolve)))
      const user = userEvent.setup()
      render(<ConnectedApps />)
      const row = await claudeRow()

      await user.click(within(row).getByRole('button', { name: 'Revoke' }))
      await user.click(within(row).getByRole('button', { name: 'Revoke access' }))

      expect(revokeGrant).toHaveBeenCalledWith({ clientId: CLAUDE.client.id })
      expect(row).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Revoking…' })).toBeDisabled()

      await act(async () => succeed({ data: {}, error: null }))
      expect(row).not.toBeInTheDocument()
      const list = screen.getByRole('list', { name: 'Connected apps' })
      expect(within(list).getAllByRole('listitem')).toHaveLength(1)
      expect(list).toHaveTextContent('cursor-mcp (laptop)')
      expect(screen.getByRole('status')).toHaveTextContent(
        'Claude can no longer sign in as you. Its access stops within the hour.'
      )
    })

    it('keeps the row and says so when the revoke fails', async () => {
      revokeGrant.mockResolvedValue({ data: null, error: new Error('Network error') })
      const user = userEvent.setup()
      render(<ConnectedApps />)
      const row = await claudeRow()

      await user.click(within(row).getByRole('button', { name: 'Revoke' }))
      await user.click(within(row).getByRole('button', { name: 'Revoke access' }))

      expect(await within(row).findByRole('alert')).toHaveTextContent('Couldn’t revoke Claude. It still has access.')
      expect(row).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Revoke access' })).toBeEnabled()
    })

    it('keeps the row when the revoke request throws', async () => {
      revokeGrant.mockRejectedValue(new TypeError('Failed to fetch'))
      const user = userEvent.setup()
      render(<ConnectedApps />)
      const row = await claudeRow()

      await user.click(within(row).getByRole('button', { name: 'Revoke' }))
      await user.click(within(row).getByRole('button', { name: 'Revoke access' }))

      expect(await within(row).findByRole('alert')).toHaveTextContent('Couldn’t revoke Claude.')
      expect(row).toBeInTheDocument()
    })
  })

  it('says it is checking until the grants arrive, rather than that there are none', () => {
    listGrants.mockReturnValue(new Promise(() => {}))
    render(<ConnectedApps />)

    expect(screen.getByText('Checking…')).toBeInTheDocument()
    expect(screen.queryByText('No apps connected yet.')).not.toBeInTheDocument()
  })
})

import type { Account } from '@/types'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})
jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

const approveAuthorization = jest.fn()
const denyAuthorization = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { oauth: { approveAuthorization, denyAuthorization } } }),
}))

const resolveAccount = jest.fn<Promise<Account | null>, []>()
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: () => resolveAccount() }))

import { allowConnection, cancelConnection } from '../actions'

const CREW: Account = { userId: 'user-1', email: 'crew@example.com', displayName: null, role: 'viewer' }

function form(authorizationId: string): FormData {
  const data = new FormData()
  data.set('authorization_id', authorizationId)
  return data
}

describe('consent actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    approveAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=x' }, error: null })
    denyAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?error=access_denied' }, error: null })
  })

  it('Allow approves for a crew account and returns to the client with its code', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await expect(allowConnection(form('auth-1'))).rejects.toThrow('NEXT_REDIRECT')

    expect(approveAuthorization).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
    expect(redirect).toHaveBeenCalledWith('https://claude.ai/cb?code=x')
  })

  it('Allow from an account with no Profile denies instead of approving', async () => {
    resolveAccount.mockResolvedValue(null)

    await expect(allowConnection(form('auth-1'))).rejects.toThrow('NEXT_REDIRECT')

    expect(approveAuthorization).not.toHaveBeenCalled()
    expect(denyAuthorization).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
  })

  it('Cancel denies and returns to the client', async () => {
    await expect(cancelConnection(form('auth-1'))).rejects.toThrow('NEXT_REDIRECT')

    expect(denyAuthorization).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
    expect(redirect).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied')
  })

  it('sends a request Supabase refused back to the consent screen to say so', async () => {
    resolveAccount.mockResolvedValue(CREW)
    approveAuthorization.mockResolvedValue({ data: null, error: new Error('expired') })
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(allowConnection(form('auth-1'))).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/oauth/consent?authorization_id=auth-1')
  })
})

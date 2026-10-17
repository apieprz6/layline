import { render, screen } from '@testing-library/react'
import type { Account } from '@/types'

const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
  useRouter: jest.fn(() => ({ replace: jest.fn(), refresh: jest.fn() })),
}))

const getClaims = jest.fn()
const getAuthorizationDetails = jest.fn()
const denyAuthorization = jest.fn()
const approveAuthorization = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims, oauth: { getAuthorizationDetails, denyAuthorization, approveAuthorization } },
  }),
}))

const resolveAccount = jest.fn<Promise<Account | null>, []>()
jest.mock('@/lib/account/resolveAccount', () => ({ resolveAccount: () => resolveAccount() }))

const signInWithGoogle = jest.fn<Promise<void>, [string]>(async () => {})
jest.mock('@/lib/account/browserAuth', () => ({
  signInWithGoogle: (next: string) => signInWithGoogle(next),
}))

import ConsentPage from '../page'

const CREW: Account = { userId: 'user-1', email: 'crew@example.com', displayName: 'Crew', role: 'viewer' }

async function visit(params: Record<string, string>): Promise<void> {
  render(await ConsentPage({ searchParams: Promise.resolve(params) }))
}

describe('/oauth/consent', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    getAuthorizationDetails.mockResolvedValue({
      data: {
        authorization_id: 'auth-1',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        client: { id: 'c', name: 'Claude', uri: '', logo_uri: '' },
        user: { id: 'user-1', email: 'crew@example.com' },
        scope: '',
      },
      error: null,
    })
    denyAuthorization.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?error=access_denied' }, error: null })
  })

  afterEach(() => consoleError.mockRestore())

  it('offers a Guest the Google door, and comes back here afterwards', async () => {
    resolveAccount.mockResolvedValue(null)
    getClaims.mockResolvedValue({ data: null, error: null })

    await visit({ authorization_id: 'auth-1' })
    screen.getByRole('button', { name: 'Continue with Google' }).click()

    expect(signInWithGoogle).toHaveBeenCalledWith('/oauth/consent?authorization_id=auth-1')
    expect(getAuthorizationDetails).not.toHaveBeenCalled()
  })

  it('denies the authorization for a signed-in account with no Profile, so no token is issued', async () => {
    resolveAccount.mockResolvedValue(null)
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-2' } }, error: null })

    await visit({ authorization_id: 'auth-1' })

    expect(denyAuthorization).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true })
    expect(approveAuthorization).not.toHaveBeenCalled()
    expect(screen.getByTestId('refused-stranger')).toBeInTheDocument()
  })

  it('asks a crew account to connect the client, naming who it reads as', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await visit({ authorization_id: 'auth-1' })

    expect(screen.getByRole('heading')).toHaveTextContent('Connect Claude to Layline?')
    expect(screen.getByText(/crew@example\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(approveAuthorization).not.toHaveBeenCalled()
  })

  it('goes straight back to the client when the account already consented', async () => {
    resolveAccount.mockResolvedValue(CREW)
    getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=x' }, error: null })

    await expect(ConsentPage({ searchParams: Promise.resolve({ authorization_id: 'auth-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT'
    )
    expect(redirect).toHaveBeenCalledWith('https://claude.ai/cb?code=x')
  })

  it('says a request Supabase no longer knows has expired', async () => {
    resolveAccount.mockResolvedValue(CREW)
    getAuthorizationDetails.mockResolvedValue({ data: null, error: new Error('authorization not found') })

    await visit({ authorization_id: 'stale' })

    expect(screen.getByTestId('consent-expired')).toBeInTheDocument()
  })

  it('has nothing to approve without an authorization_id', async () => {
    await visit({})

    expect(screen.getByTestId('consent-expired')).toBeInTheDocument()
    expect(resolveAccount).not.toHaveBeenCalled()
  })
})

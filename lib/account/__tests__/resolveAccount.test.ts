import { resolveAccount } from '../resolveAccount'

const getClaims = jest.fn()
const maybeSingle = jest.fn()
const eq = jest.fn(() => ({ maybeSingle }))
const select = jest.fn(() => ({ eq }))
const from = jest.fn(() => ({ select }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getClaims },
    from,
  })),
}))

const CLAIMS = {
  sub: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  role: 'authenticated',
}

function signedIn(claims: Record<string, unknown> = CLAIMS): void {
  getClaims.mockResolvedValue({ data: { claims }, error: null })
}

describe('resolveAccount', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  describe('the three shapes getClaims can return', () => {
    it('data and no error: the Account, read from the JWT and from profiles', async () => {
      signedIn()
      maybeSingle.mockResolvedValue({
        data: { display_name: 'Alex Pieprzycki', role: 'admin' },
        error: null,
      })

      await expect(resolveAccount()).resolves.toEqual({
        userId: CLAIMS.sub,
        email: 'crew@example.com',
        displayName: 'Alex Pieprzycki',
        role: 'admin',
      })
    })

    it('an error and no data: a Guest, and the error is logged', async () => {
      getClaims.mockResolvedValue({
        data: null,
        error: { message: 'JWT signature is invalid' },
      })

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
      // Nothing is asked of the database when there is no verified claim.
      expect(from).not.toHaveBeenCalled()
    })

    it('neither data nor error: a Guest, silently — nobody is signed in', async () => {
      getClaims.mockResolvedValue({ data: null, error: null })

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).not.toHaveBeenCalled()
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('the Role comes from profiles, never from a claim', () => {
    it('reads role from the sailor own row', async () => {
      signedIn({ ...CLAIMS, role: 'authenticated', user_role: 'admin' })
      maybeSingle.mockResolvedValue({
        data: { display_name: 'Alex Pieprzycki', role: 'viewer' },
        error: null,
      })

      const account = await resolveAccount()

      // 'authenticated' is Postgres's role and rides in every access token;
      // a Layline Role is a different thing living in a different place.
      expect(account?.role).toBe('viewer')
      expect(from).toHaveBeenCalledWith('profiles')
      expect(eq).toHaveBeenCalledWith('user_id', CLAIMS.sub)
    })

    it('is a Guest when the Profile the trigger promises is missing', async () => {
      signedIn()
      maybeSingle.mockResolvedValue({ data: null, error: null })

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
    })

    it('is a Guest when the profiles read fails', async () => {
      signedIn()
      maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'permission denied for table profiles' },
      })

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
    })
  })

  describe('a Display Name that does not exist', () => {
    it('carries null through rather than inventing one from the address', async () => {
      signedIn()
      maybeSingle.mockResolvedValue({ data: { display_name: null, role: 'viewer' }, error: null })

      const account = await resolveAccount()

      expect(account?.displayName).toBeNull()
      expect(account?.email).toBe('crew@example.com')
    })
  })

  describe('no Supabase environment at all', () => {
    it('is a Guest — the weather half of the app is open to everyone', async () => {
      const { createClient } = jest.requireMock('@/lib/supabase/server')
      createClient.mockRejectedValueOnce(new Error('Missing Supabase environment variables.'))

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
    })
  })

  describe('an access token with no email claim', () => {
    it('is a Guest, loudly — an Account is defined by its address', async () => {
      signedIn({ sub: CLAIMS.sub, role: 'authenticated' })

      await expect(resolveAccount()).resolves.toBeNull()
      expect(consoleError).toHaveBeenCalled()
    })
  })
})

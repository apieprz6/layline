import { signInWithGoogle, signOutHere } from '../browserAuth'

const signInWithOAuth = jest.fn()
const signOut = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOAuth, signOut } })),
}))

function redirectToOf(): string {
  return signInWithOAuth.mock.calls[0][0].options.redirectTo
}

describe('signInWithGoogle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' }, error: null })
  })

  it('asks Google, and nothing else', async () => {
    await signInWithGoogle('/')

    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    expect(signInWithOAuth.mock.calls[0][0].provider).toBe('google')
  })

  it('comes back through /auth/callback carrying the screen the sailor was on', async () => {
    await signInWithGoogle('/wind-data')

    expect(redirectToOf()).toBe('http://localhost/auth/callback?next=%2Fwind-data')
  })

  describe('the next destination is a relative path or nothing', () => {
    it.each([
      ['an absolute URL', 'https://evil.example/phish'],
      ['a protocol-relative URL', '//evil.example/phish'],
      ['a backslash-relative URL', '\\\\evil.example'],
      ['a bare path with no leading slash', 'wind-data'],
      ['nothing at all', ''],
    ])('falls back to the dashboard for %s', async (_case, candidate) => {
      await signInWithGoogle(candidate)

      expect(redirectToOf()).toBe('http://localhost/auth/callback?next=%2F')
    })
  })

  it('logs a handshake that never got off the ground', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'provider is not enabled' } })

    await signInWithGoogle('/')

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('signOutHere', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signOut.mockResolvedValue({ error: null })
  })

  it('ends this browser session and leaves other devices alone', async () => {
    await signOutHere()

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('logs a failure rather than pretending it worked', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    signOut.mockResolvedValue({ error: { message: 'network error' } })

    await signOutHere()

    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

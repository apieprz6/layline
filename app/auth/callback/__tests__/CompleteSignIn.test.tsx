import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ replace, refresh, push: jest.fn() })),
}))

const signInWithGoogle = jest.fn()
jest.mock('@/lib/account/browserAuth', () => ({
  signInWithGoogle: (next: string) => signInWithGoogle(next),
}))

const getSession = jest.fn()
const exchangeCodeForSession = jest.fn()
const createClient = jest.fn(() => ({ auth: { getSession, exchangeCodeForSession } }))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => createClient(),
}))

import CompleteSignIn from '../CompleteSignIn'

const SESSION = {
  access_token: 'a.b.c',
  user: { id: '11111111-1111-1111-1111-111111111111' },
}

describe('CompleteSignIn', () => {
  let consoleError: jest.SpyInstance
  let consoleWarn: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
    // The SDK deletes `code` from the address bar when it spends one, so the
    // ordinary case is a URL that no longer carries it.
    window.history.replaceState({}, '', '/auth/callback')
  })

  afterEach(() => {
    consoleError.mockRestore()
    consoleWarn.mockRestore()
  })

  it('builds a browser client, which is what spends the code', async () => {
    render(<CompleteSignIn next="/wind-data" />)
    await screen.findByTestId('callback-holding')

    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('never calls exchangeCodeForSession itself', async () => {
    render(<CompleteSignIn next="/" />)
    await screen.findByTestId('callback-holding')

    // `exchangeCodeForSession` awaits the client own initialize(), which has
    // already spent the code and cleared the PKCE verifier — so an explicit call
    // reports a missing verifier *after* a successful sign-in.
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('reads the outcome rather than racing it', async () => {
    render(<CompleteSignIn next="/" />)
    await screen.findByTestId('callback-holding')

    expect(getSession).toHaveBeenCalled()
  })

  it('returns the sailor to the screen they started from', async () => {
    render(<CompleteSignIn next="/wind-data" />)

    await screen.findByTestId('callback-holding')
    // A microtask for the promise chain, then the navigation.
    await Promise.resolve()

    expect(replace).toHaveBeenCalledWith('/wind-data')
  })

  it('says nothing extra when the code was spent — the URL no longer carries one', async () => {
    render(<CompleteSignIn next="/wind-data" />)
    await screen.findByTestId('callback-holding')
    await Promise.resolve()

    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('sends the sailor onward but says so when the code was not what signed them in', async () => {
    // A reload of this screen, or a code this browser held no verifier for while a
    // session was already open: `getSession()` answers about the cookie, not about
    // the round trip, and an untouched `code` is the only mark the SDK leaves.
    window.history.replaceState({}, '', '/auth/callback?code=a-single-use-code')

    render(<CompleteSignIn next="/wind-data" />)
    await screen.findByTestId('callback-holding')
    await Promise.resolve()

    expect(consoleWarn).toHaveBeenCalledTimes(1)
    // Not a dead end: they hold a session, and the server render names its owner.
    expect(replace).toHaveBeenCalledWith('/wind-data')
  })

  it('says something while the exchange is in flight', () => {
    render(<CompleteSignIn next="/" />)

    expect(screen.getByTestId('callback-holding')).toBeInTheDocument()
  })

  describe('when no session comes out of it', () => {
    it('does not navigate, and logs why', async () => {
      getSession.mockResolvedValue({ data: { session: null }, error: null })

      render(<CompleteSignIn next="/wind-data" />)
      await screen.findByRole('link', { name: /back to the weather/i })

      expect(replace).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalled()
    })

    it('shows a way onward rather than a spinner forever', async () => {
      getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'code verifier could not be found' },
      })

      render(<CompleteSignIn next="/" />)

      const back = await screen.findByRole('link', { name: /back to the weather/i })
      expect(back).toHaveAttribute('href', '/')
      expect(document.body.textContent).not.toContain('code verifier could not be found')
    })

    it('is the one arm that offers a retry, aimed at the screen they came from', async () => {
      // A handshake that broke can usefully be run again — unlike a refusal,
      // where the same Google account is refused identically.
      getSession.mockResolvedValue({ data: { session: null }, error: null })

      render(<CompleteSignIn next="/wind-data" />)

      const retry = await screen.findByRole('button', { name: /try signing in again/i })
      await userEvent.click(retry)

      expect(signInWithGoogle).toHaveBeenCalledWith('/wind-data')
    })

    it('does not tell them they are off the crew list, which nobody here knows', async () => {
      getSession.mockResolvedValue({ data: { session: null }, error: null })

      render(<CompleteSignIn next="/" />)
      await screen.findByRole('button', { name: /try signing in again/i })

      expect(document.body.textContent).not.toMatch(/crew list/i)
    })
  })

  describe('when there is no Supabase configured at all', () => {
    it('fails visibly instead of throwing through the render', async () => {
      createClient.mockImplementationOnce(() => {
        throw new Error('Missing Supabase environment variables.')
      })

      render(<CompleteSignIn next="/" />)

      await screen.findByRole('link', { name: /back to the weather/i })
      expect(consoleError).toHaveBeenCalled()
    })
  })
})

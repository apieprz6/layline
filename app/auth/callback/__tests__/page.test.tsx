import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen } from '@testing-library/react'

const redirect = jest.fn((to: string) => {
  // The real `redirect()` throws to abandon the render; a mock that returns
  // would let the page fall through into markup it never reaches in Next.
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: 'NEXT_REDIRECT' })
})

jest.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
  useRouter: jest.fn(() => ({ replace: jest.fn(), refresh: jest.fn() })),
}))

// The exchange happens in the browser, in the child component; this suite is
// about which of the four arms the route takes.
jest.mock('../CompleteSignIn', () => ({
  __esModule: true,
  default: ({ next }: { next: string }) => <div data-testid="complete-sign-in">{next}</div>,
}))

import AuthCallbackPage from '../page'

type Params = Record<string, string | string[] | undefined>

async function visit(params: Params): Promise<void> {
  render(await AuthCallbackPage({ searchParams: Promise.resolve(params) }))
}

async function expectSentTo(params: Params, to: string): Promise<void> {
  await expect(AuthCallbackPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
    'NEXT_REDIRECT'
  )
  expect(redirect).toHaveBeenCalledWith(to)
}

describe('/auth/callback', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  describe('a code coming back from Google', () => {
    it('hands it to the browser to exchange, with the screen to return to', async () => {
      await visit({ code: 'a-single-use-code', next: '/wind-data' })

      expect(screen.getByTestId('complete-sign-in')).toHaveTextContent('/wind-data')
    })

    it('sends a sailor with no ?next= back to the dashboard', async () => {
      await visit({ code: 'a-single-use-code' })

      expect(screen.getByTestId('complete-sign-in')).toHaveTextContent('/')
    })

    it.each([
      ['an absolute URL', 'https://evil.example.com/phish'],
      ['a protocol-relative host', '//evil.example.com'],
      ['a backslash the browser normalises', '/\\evil.example.com'],
    ])('refuses to send anyone off-origin: %s', async (_name, next) => {
      await visit({ code: 'a-single-use-code', next })

      expect(screen.getByTestId('complete-sign-in')).toHaveTextContent('/')
    })

    it('does not exchange the code on the server', async () => {
      // A page render cannot write a cookie in Next 16 — the phase is not
      // 'action' — so a server-side exchange would spend the single-use code and
      // silently drop the session. The child component is the whole mechanism.
      const source = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8')

      expect(source).not.toMatch(/exchangeCodeForSession/)
      expect(source).not.toMatch(/@\/lib\/supabase\/server/)
    })
  })

  describe('a sailor who pressed Cancel on Google consent screen', () => {
    it('is shown nothing at all, back where they were (ADR 0021)', async () => {
      await expectSentTo({ error: 'access_denied', next: '/wind-data' }, '/wind-data')
    })

    it('is still logged, because the app was told something', async () => {
      await expect(
        AuthCallbackPage({ searchParams: Promise.resolve({ error: 'access_denied' }) })
      ).rejects.toThrow('NEXT_REDIRECT')

      expect(consoleError).toHaveBeenCalled()
    })
  })

  describe('a refusal that carries an error_code', () => {
    const REFUSED = {
      error: 'access_denied',
      error_code: 'signup_disabled',
      error_description: 'Signups not allowed for this instance',
      next: '/wind-data',
    }

    it('does not silently return the stranger to the weather', async () => {
      await visit(REFUSED)

      expect(redirect).not.toHaveBeenCalled()
    })

    it('tells them they are not on the crew list yet, and who makes accounts', async () => {
      await visit(REFUSED)

      expect(
        screen.getByRole('heading', { name: 'You are not on the crew list yet' })
      ).toBeInTheDocument()
      expect(document.body.textContent).toContain(
        'Layline accounts are made by the boat’s owner. Ask them to add the Google address you just used, then sign in again.'
      )
    })

    it('branches on error_code, so a bare error_code is still the refusal', async () => {
      // `error` is the generic OAuth code and cannot tell a refusal from a change
      // of mind; `error_code` is the only thing that can (ADR 0021).
      await visit({ error_code: 'signup_disabled' })

      expect(redirect).not.toHaveBeenCalled()
      expect(
        screen.getByRole('heading', { name: 'You are not on the crew list yet' })
      ).toBeInTheDocument()
    })

    it('does not offer to try the same account again', async () => {
      // The one thing that would fail identically. Their way forward is a person,
      // not a button.
      await visit(REFUSED)

      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/try (signing in )?again/i)
    })

    it("logs Supabase's own words verbatim and shows none of them", async () => {
      await visit(REFUSED)

      const logged = consoleError.mock.calls.flat().join(' ')
      expect(logged).toContain('signup_disabled')
      expect(logged).toContain('Signups not allowed for this instance')

      expect(document.body.textContent).not.toContain('Signups not allowed for this instance')
      expect(document.body.textContent).not.toContain('signup_disabled')
    })

    it('offers a way back to the weather, the only exit it has', async () => {
      await visit(REFUSED)

      const back = screen.getByRole('link', { name: /back to the weather/i })
      expect(back).toHaveAttribute('href', '/')
    })

    it('names no address, because the URL carries none', async () => {
      await visit({ ...REFUSED, error_description: 'Signups not allowed for crew@example.com' })

      expect(document.body.textContent).not.toMatch(/@/)
    })
  })

  describe('a sign-in that merely broke', () => {
    const BROKEN = {
      error: 'server_error',
      error_code: 'unexpected_failure',
      error_description: 'Database error saving new user',
      next: '/wind-data',
    }

    it('says so, and does not tell the sailor they are off the crew list', async () => {
      await visit(BROKEN)

      expect(screen.getByRole('heading', { name: "Sign-in didn't finish" })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/crew list/i)
      expect(redirect).not.toHaveBeenCalled()
    })

    it('offers a way to try again, which a refusal does not', async () => {
      await visit(BROKEN)

      expect(screen.getByRole('button', { name: /try signing in again/i })).toBeInTheDocument()
    })

    it("keeps Supabase's own words in the log", async () => {
      await visit(BROKEN)

      const logged = consoleError.mock.calls.flat().join(' ')
      expect(logged).toContain('unexpected_failure')
      expect(logged).toContain('Database error saving new user')

      expect(document.body.textContent).not.toContain('Database error saving new user')
      expect(document.body.textContent).not.toContain('unexpected_failure')
    })
  })

  describe('a URL somebody typed', () => {
    it('has nothing to do, so it does the harmless thing', async () => {
      await expectSentTo({}, '/')
      expect(consoleError).not.toHaveBeenCalled()
    })
  })
})

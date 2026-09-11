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

  describe('a URL somebody typed', () => {
    it('has nothing to do, so it does the harmless thing', async () => {
      await expectSentTo({}, '/')
      expect(consoleError).not.toHaveBeenCalled()
    })
  })
})

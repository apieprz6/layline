import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/'),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

// RaceHeader polls live buoy data through SWR
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    data: {
      buoys: [
        {
          data: {
            buoyId: '45198',
            windSpeed: 12,
            windDirection: 245,
            timestamp: new Date().toISOString(),
          },
          status: 'online',
        },
      ],
    },
  })),
}))

// The layout subscribes to auth events through AppLayout, one level down.
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  })),
}))

// The one server resolve site, stubbed: this suite is about what the layout does
// with an Account, not about how it verifies a JWT (that is resolveAccount's own
// suite).
jest.mock('@/lib/account/resolveAccount', () => ({
  resolveAccount: jest.fn(async () => null),
}))

import AppGroupLayout from '../layout'
import type { Account } from '@/types'

const CREW: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'crew@example.com',
  displayName: 'Jamie Torres',
  role: 'admin',
}

function readLayoutCode(): string {
  const source = readFileSync(resolve(__dirname, '../layout.tsx'), 'utf8')
  // Comments explain what the layout deliberately does not do, so they would
  // trip the guards below; match against code only.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('(app) route group layout', () => {
  const { resolveAccount } = jest.requireMock('@/lib/account/resolveAccount')

  beforeEach(() => {
    jest.clearAllMocks()
    resolveAccount.mockResolvedValue(null)
  })

  // An async Server Component is a function returning a promise of an element;
  // awaiting it is how the server does it, and how a test has to.
  async function renderLayout(): Promise<void> {
    render(await AppGroupLayout({ children: <div>Page content</div> }))
  }

  it('renders the app chrome around its children', async () => {
    await renderLayout()

    // RaceHeader's logo is the chrome the three pages used to mount for themselves
    expect(screen.getByAltText('L')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('resolves the Account here, once, on the server', async () => {
    await renderLayout()

    expect(resolveAccount).toHaveBeenCalledTimes(1)
  })

  it('hands the resolved Account down as a prop — the drawer names the sailor', async () => {
    resolveAccount.mockResolvedValue(CREW)

    await renderLayout()

    expect(screen.getByText('Jamie Torres')).toBeInTheDocument()
    expect(screen.getByText('crew@example.com')).toBeInTheDocument()
    // The Role governs writes only, so no reader of the drawer is shown one
    // (ADR 0021). It does *travel*: the Account crosses into a Client Component,
    // so the whole object — Role and user id included — is in the RSC payload.
    // What is asserted here is that nothing renders it, which is the claim.
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()
  })

  it('shows a Guest the guest footer', async () => {
    await renderLayout()

    expect(screen.getByText('Browsing as guest')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('leaves the JWT and the cookies to resolveAccount, and calls no other client', () => {
    const source = readLayoutCode()

    // The layout is the resolve *site*, not the resolve *code*: one call, and no
    // second way in.
    expect(source).toMatch(/resolveAccount\(\)/)
    expect(source).not.toMatch(/next\/headers/)
    expect(source).not.toMatch(/cookies/)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/getClaims|getUser/)
  })

  it('is a Server Component — no "use client" directive', () => {
    const source = readLayoutCode()

    expect(source).not.toMatch(/['"]use client['"]/)
  })
})

describe('pages in the (app) group', () => {
  it.each([
    ['page.tsx', '../page.tsx'],
    ['wind-data/page.tsx', '../wind-data/page.tsx'],
    ['settings/page.tsx', '../settings/page.tsx'],
    ['boat-management/page.tsx', '../boat-management/page.tsx'],
    ['boat-performance/page.tsx', '../boat-performance/page.tsx'],
  ])('%s does not import AppLayout itself', (_name, relativePath) => {
    const source = readFileSync(resolve(__dirname, relativePath), 'utf8')

    expect(source).not.toMatch(/AppLayout/)
  })
})

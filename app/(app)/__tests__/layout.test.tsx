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

import AppGroupLayout from '../layout'

function readLayoutCode(): string {
  const source = readFileSync(resolve(__dirname, '../layout.tsx'), 'utf8')
  // Comments explain what the layout deliberately does not do, so they would
  // trip the guards below; match against code only.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('(app) route group layout', () => {
  it('renders the app chrome around its children', () => {
    render(<AppGroupLayout>{<div>Page content</div>}</AppGroupLayout>)

    // RaceHeader's logo is the chrome the three pages used to mount for themselves
    expect(screen.getByAltText('L')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('is structural only — it resolves no Account and reads no cookies', () => {
    const source = readLayoutCode()

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
  ])('%s does not import AppLayout itself', (_name, relativePath) => {
    const source = readFileSync(resolve(__dirname, relativePath), 'utf8')

    expect(source).not.toMatch(/AppLayout/)
  })
})

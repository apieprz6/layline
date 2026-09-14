import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountBlock from '../AccountBlock'
import type { Account } from '@/types'

const OWNER: Account = {
  userId: '11111111-1111-1111-1111-111111111111',
  email: 'alex@example.com',
  displayName: 'Alex Pieprzycki',
  role: 'admin',
}

const NAMELESS: Account = {
  userId: '22222222-2222-2222-2222-222222222222',
  email: 'jt.crew@example.com',
  displayName: null,
  role: 'viewer',
}

function renderBlock(account: Account | null) {
  const onSignIn = jest.fn()
  const onSignOut = jest.fn()
  const view = render(
    <AccountBlock account={account} onSignIn={onSignIn} onSignOut={onSignOut} />
  )
  return { ...view, onSignIn, onSignOut }
}

describe('AccountBlock — signed out', () => {
  it('says who is browsing and what that gets them', () => {
    renderBlock(null)

    expect(screen.getByText('Browsing as guest')).toBeInTheDocument()
    expect(screen.getByText('Weather is open to everyone')).toBeInTheDocument()
  })

  it('offers Sign in, and nothing to sign out of', () => {
    const { onSignIn } = renderBlock(null)

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('calls onSignIn when Sign in is tapped — the sheet is the layout to open', async () => {
    const user = userEvent.setup()
    const { onSignIn } = renderBlock(null)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledTimes(1)
  })
})

describe('AccountBlock — signed in', () => {
  it('shows initials, the Display Name, and the Google address beneath it', () => {
    renderBlock(OWNER)

    expect(screen.getByText('AP')).toBeInTheDocument()
    expect(screen.getByText('Alex Pieprzycki')).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  })

  it('offers Sign out, and no second door in', () => {
    renderBlock(OWNER)

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText('Browsing as guest')).not.toBeInTheDocument()
  })

  it('calls onSignOut when Sign out is tapped', async () => {
    const user = userEvent.setup()
    const { onSignOut } = renderBlock(OWNER)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})

describe('AccountBlock — a Display Name Google never gave us', () => {
  it('puts the address on the name line and says where the account came from', () => {
    renderBlock(NAMELESS)

    expect(screen.getByText('jt.crew@example.com')).toBeInTheDocument()
    expect(screen.getByText('Google account')).toBeInTheDocument()
  })

  it('draws a silhouette rather than a letter taken from the address', () => {
    const { container } = renderBlock(NAMELESS)

    // Not 'J', not 'JC', not any initial: the address is not a name.
    expect(screen.queryByText(/^[A-Za-z]{1,2}$/)).not.toBeInTheDocument()
    expect(container.querySelector('[data-testid="account-avatar"] svg')).toBeInTheDocument()
  })

  it('invents no name — the address is shown once, as itself', () => {
    renderBlock(NAMELESS)

    expect(screen.getAllByText('jt.crew@example.com')).toHaveLength(1)
    expect(screen.queryByText(/jt\.crew$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Jt/)).not.toBeInTheDocument()
  })
})

describe('AccountBlock — the Role', () => {
  it.each([['admin' as const], ['viewer' as const]])(
    'is shown nowhere for a %s (ADR 0021 — it governs writes only)',
    (role) => {
      const { container } = renderBlock({ ...OWNER, role })

      expect(container.textContent).not.toMatch(/admin|viewer|owner|crew/i)
    }
  )
})

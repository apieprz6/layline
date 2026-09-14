import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LockedBoatScreen from '../LockedBoatScreen'
import { AuthSheetOpener } from '@/components/auth/authSheetOpener'

/** The screen reads the opener off the context the app layout provides. */
function renderLocked(onSignIn = jest.fn()): { onSignIn: jest.Mock; container: HTMLElement } {
  const { container } = render(
    <AuthSheetOpener value={onSignIn}>
      <LockedBoatScreen title="Boat performance" invitation="Sign in to read the race archive." />
    </AuthSheetOpener>
  )
  return { onSignIn, container }
}

describe('LockedBoatScreen', () => {
  it('names the section it is standing in for, and says what signing in buys', () => {
    renderLocked()

    expect(screen.getByRole('heading', { name: 'Boat performance' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to read the race archive.')).toBeInTheDocument()
  })

  it('opens the Auth Sheet in place rather than navigating anywhere', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSignIn, container } = renderLocked()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledTimes(1)
    // A dead end is the one thing ADR 0015 forbids, and a link out of here would
    // be one: the sheet opens over the screen the sailor asked for, so that
    // finishing sign-in leaves them on it.
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders placeholder geometry, hatched, and hidden from assistive tech', () => {
    renderLocked()

    const placeholder = screen.getByTestId('locked-placeholder')
    expect(placeholder).toHaveAttribute('aria-hidden')
    // Hatched: obviously not a value, and the treatment the archive's "not
    // recorded" is meant to reuse. Never `filter: blur`, which is a real value at
    // reduced fidelity, and which is what the prototype reached for (ADR 0015).
    expect(placeholder.innerHTML).toContain('repeating-linear-gradient')
    expect(placeholder.innerHTML).not.toContain('blur')
  })

  it('shows no data of any kind, and no boat', () => {
    const { container } = renderLocked()

    // The drawer advertises that a boat exists here, not whose (ADR 0015). The
    // known identity is asserted by name because it is the one that would leak.
    expect(container.textContent).not.toMatch(/handsome pete|beneteau/i)
    // Nothing that reads as a figure: no digits anywhere in the copy.
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('is not a loading state', () => {
    renderLocked()

    expect(screen.queryByText(/loading|fetching|please wait/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

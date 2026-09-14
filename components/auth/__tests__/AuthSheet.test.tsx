import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthSheet from '../AuthSheet'

function renderSheet(isOpen: boolean) {
  const onClose = jest.fn()
  const onContinueWithGoogle = jest.fn()
  const view = render(
    <AuthSheet
      isOpen={isOpen}
      onClose={onClose}
      onContinueWithGoogle={onContinueWithGoogle}
    />
  )
  return { ...view, onClose, onContinueWithGoogle }
}

describe('AuthSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = renderSheet(false)

    expect(container).toBeEmptyDOMElement()
  })

  it('is one heading, one line of copy and one button', () => {
    renderSheet(true)

    expect(screen.getByText('Sign in')).toBeInTheDocument()
    // The typographic apostrophe is the prototype's, and the same sentence opens
    // the Refused Stranger — the two must not drift apart.
    expect(screen.getByText('Layline accounts are made by the boat’s owner.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument()
  })

  it('holds no field state and no modes (ADR 0021)', () => {
    renderSheet(true)

    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(document.querySelectorAll('form')).toHaveLength(0)
    // No Sign up tab, no password half, no Forgot password: Google is the only door.
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument()
  })

  it('starts the OAuth handshake when the one button is tapped', async () => {
    const user = userEvent.setup()
    const { onContinueWithGoogle } = renderSheet(true)

    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    expect(onContinueWithGoogle).toHaveBeenCalledTimes(1)
  })

  it('closes on the dim behind it', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet(true)

    await user.click(screen.getByTestId('auth-sheet-dim'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderSheet(true)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Edge-anchored, full width, rounded at the top only and 180px tall is a
  // *position* question, and jsdom lays nothing out — asserting the inline styles
  // here would only read back the props this file's own component wrote. It is
  // measured in a real browser in `e2e/auth-sheet.spec.ts` (docs/testing/README).

  it('takes no error prop and holds no state', () => {
    // Pinned against the source, because an unused error region is how a 250px
    // sheet grows back to 692 (ADR 0021), and neither a type nor a render can
    // fail loudly enough to stop one being added.
    const source = readFileSync(resolve(__dirname, '../AuthSheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    expect(source).not.toMatch(/\berror\b/)
    expect(source).not.toMatch(/useState|useReducer/)
  })
})

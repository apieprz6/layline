import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Integrations from '../Integrations'
import { askToSignIn } from '@/lib/account/askToSignIn'

jest.mock('@/lib/account/askToSignIn', () => ({ askToSignIn: jest.fn() }))

const URL = 'https://layline-git-lay-191.vercel.app/api/mcp'

const ROWS = ['Connect Claude', 'Connect ChatGPT', 'Using another app?']

function row(title: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${title.replace('?', '\\?')}`) })
}

describe('Integrations', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('signed in', () => {
    it('offers Claude, ChatGPT and any other app, each with what it covers', () => {
      render(<Integrations mcpServerUrl={URL} />)

      expect(screen.getByRole('heading', { name: 'Integrations' })).toBeInTheDocument()
      expect(row('Connect Claude')).toHaveTextContent('Web, desktop and phone')
      expect(row('Connect ChatGPT')).toHaveTextContent('Plus, Pro or Business, on the web')
      expect(row('Using another app?')).toHaveTextContent('Claude Code, Cursor, VS Code…')
    })

    it('keeps the address off the screen until a sheet is opened', () => {
      render(<Integrations mcpServerUrl={URL} />)

      expect(screen.queryByText(URL)).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('walks Claude’s three steps: copy, add it, sign in', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect Claude'))
      const sheet = screen.getByRole('dialog', { name: 'Connect Claude' })
      expect(sheet).toHaveTextContent('Connect Claude · Step 1 of 3')
      expect(within(sheet).getByRole('heading', { name: 'Copy Layline’s address' })).toBeInTheDocument()
      expect(within(sheet).getByText(URL)).toBeInTheDocument()

      await user.click(within(sheet).getByRole('button', { name: 'Next' }))
      expect(sheet).toHaveTextContent('Step 2 of 3')
      expect(within(sheet).getByRole('heading', { name: 'Add it in Claude' })).toBeInTheDocument()
      expect(sheet).toHaveTextContent('Settings → Connectors → Add custom connector')
      expect(sheet).toHaveTextContent('It then shows up in the Claude app on your phone.')
      expect(within(sheet).getByRole('link', { name: 'Open Claude settings ↗' })).toHaveAttribute(
        'href',
        'https://claude.ai/settings/connectors'
      )

      await user.click(within(sheet).getByRole('button', { name: 'Next' }))
      expect(sheet).toHaveTextContent('Step 3 of 3')
      expect(within(sheet).getByRole('heading', { name: 'Sign in and approve' })).toBeInTheDocument()
      expect(sheet).toHaveTextContent('Claude opens Layline’s sign-in. Sign in with Google and approve.')
      expect(sheet).toHaveTextContent('Read-only. It sees what your account sees on Layline, and nothing else.')
      expect(within(sheet).getAllByRole('listitem')).toHaveLength(3)

      await user.click(within(sheet).getByRole('button', { name: 'Done' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('goes back a step, and closes from the first', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect Claude'))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Step 1 of 3')

      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes on Escape', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect ChatGPT'))
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('starts every sheet at step 1', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect Claude'))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      await user.click(screen.getByRole('button', { name: 'Back' }))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      await user.click(row('Connect ChatGPT'))

      expect(screen.getByRole('dialog', { name: 'Connect ChatGPT' })).toHaveTextContent('Step 1 of 3')
    })

    it('copies the address, and says so', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect Claude'))
      await user.click(screen.getByRole('button', { name: 'Copy address' }))

      expect(await navigator.clipboard.readText()).toBe(URL)
      expect(screen.getByRole('button', { name: 'Copied ✓' })).toBeInTheDocument()
    })

    it('says so when the browser refuses to copy, rather than claiming it did', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)
      jest.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))

      await user.click(row('Connect Claude'))
      await user.click(screen.getByRole('button', { name: 'Copy address' }))

      expect(await screen.findByText(/couldn’t copy/i)).toBeInTheDocument()
      expect(screen.queryByText('Copied ✓')).not.toBeInTheDocument()
    })

    it('walks ChatGPT’s own second step', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Connect ChatGPT'))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      const sheet = screen.getByRole('dialog', { name: 'Connect ChatGPT' })

      expect(within(sheet).getByRole('heading', { name: 'Add it in ChatGPT' })).toBeInTheDocument()
      expect(sheet).toHaveTextContent('Add custom MCP server')
      expect(sheet).toHaveTextContent('OAuth')
      expect(within(sheet).getByRole('link', { name: 'Open ChatGPT ↗' })).toHaveAttribute(
        'href',
        'https://chatgpt.com/plugins'
      )

      await user.click(within(sheet).getByRole('button', { name: 'Next' }))
      expect(sheet).toHaveTextContent('ChatGPT opens Layline’s sign-in.')
    })

    it('gives any other app the address, and Claude Code its command to copy', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={URL} />)

      await user.click(row('Using another app?'))
      await user.click(screen.getByRole('button', { name: 'Next' }))
      const sheet = screen.getByRole('dialog', { name: 'Using another app?' })

      expect(within(sheet).getByRole('heading', { name: 'Add it to your app' })).toBeInTheDocument()
      expect(sheet).toHaveTextContent('No key or token is needed.')
      await user.click(within(sheet).getByRole('button', { name: /claude mcp add/ }))
      expect(await navigator.clipboard.readText()).toBe(`claude mcp add --transport http layline ${URL}`)
      expect(within(sheet).getByRole('button', { name: /claude mcp add/ })).toHaveTextContent('Copied ✓')

      await user.click(within(sheet).getByRole('button', { name: 'Next' }))
      expect(sheet).toHaveTextContent('Your app opens Layline’s sign-in.')
    })
  })

  describe('signed out', () => {
    it('asks a Guest to sign in on every row', () => {
      render(<Integrations mcpServerUrl={null} />)

      for (const title of ROWS) {
        expect(row(title)).toHaveTextContent('Sign in to connect')
        expect(within(row(title)).getByTestId('padlock')).toBeInTheDocument()
      }
    })

    it('opens the Auth Sheet, not the steps, and shows no address', async () => {
      const user = userEvent.setup()
      render(<Integrations mcpServerUrl={null} />)

      await user.click(row('Connect Claude'))

      expect(askToSignIn).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(/\/api\/mcp/)).not.toBeInTheDocument()
    })
  })
})

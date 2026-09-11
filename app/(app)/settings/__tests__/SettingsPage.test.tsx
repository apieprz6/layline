import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSetPreference = jest.fn()
let mockPreference: 'auto' | 'solar' | 'nightvision' = 'auto'

jest.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'solar',
    preference: mockPreference,
    setPreference: mockSetPreference,
  }),
}))

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/settings'),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}))

import SettingsContent from '../SettingsContent'

describe('SettingsContent', () => {
  beforeEach(() => {
    mockPreference = 'auto'
    mockSetPreference.mockClear()
  })

  it('renders three theme options: Auto, Solar, Night Vision', () => {
    render(<SettingsContent />)

    expect(screen.getByRole('button', { name: /auto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /solar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /night vision/i })).toBeInTheDocument()
  })

  it('displays explanatory subtitle for the Auto option about civil twilight', () => {
    render(<SettingsContent />)

    expect(screen.getByText(/civil twilight/i)).toBeInTheDocument()
  })

  it('visually indicates the active preference', () => {
    render(<SettingsContent />)

    const autoButton = screen.getByRole('button', { name: /auto/i })
    expect(autoButton).toHaveAttribute('aria-pressed', 'true')

    const solarButton = screen.getByRole('button', { name: /solar/i })
    expect(solarButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking an option calls setPreference with the correct value', async () => {
    const user = userEvent.setup()
    render(<SettingsContent />)

    await user.click(screen.getByRole('button', { name: /solar/i }))
    expect(mockSetPreference).toHaveBeenCalledWith('solar')

    await user.click(screen.getByRole('button', { name: /night vision/i }))
    expect(mockSetPreference).toHaveBeenCalledWith('nightvision')
  })

  it('updates visually when preference changes', () => {
    mockPreference = 'nightvision'
    render(<SettingsContent />)

    const nightVisionButton = screen.getByRole('button', { name: /night vision/i })
    expect(nightVisionButton).toHaveAttribute('aria-pressed', 'true')

    const autoButton = screen.getByRole('button', { name: /auto/i })
    expect(autoButton).toHaveAttribute('aria-pressed', 'false')
  })
})

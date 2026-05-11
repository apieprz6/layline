import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScaleControl from '../ScaleControl'

describe('ScaleControl', () => {
  const mockOnScaleChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders all 5 scale buttons', () => {
      render(<ScaleControl activeScale="1h" onScaleChange={mockOnScaleChange} />)

      expect(screen.getByRole('button', { name: '30m' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '6h' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '72h' })).toBeInTheDocument()
    })

    it('highlights the active scale button', () => {
      render(<ScaleControl activeScale="6h" onScaleChange={mockOnScaleChange} />)

      const activeButton = screen.getByRole('button', { name: '6h' })
      const inactiveButton = screen.getByRole('button', { name: '1h' })

      expect(activeButton).toHaveClass('active')
      expect(inactiveButton).not.toHaveClass('active')
    })

    it('meets minimum touch target height of 44px', () => {
      render(<ScaleControl activeScale="1h" onScaleChange={mockOnScaleChange} />)

      const button = screen.getByRole('button', { name: '30m' })
      const styles = window.getComputedStyle(button)

      // Button should have minimum height for touch accessibility
      expect(parseInt(styles.minHeight || '0', 10)).toBeGreaterThanOrEqual(44)
    })
  })

  describe('interaction', () => {
    it('calls onScaleChange when a scale button is clicked', async () => {
      const user = userEvent.setup()
      render(<ScaleControl activeScale="1h" onScaleChange={mockOnScaleChange} />)

      await user.click(screen.getByRole('button', { name: '6h' }))

      expect(mockOnScaleChange).toHaveBeenCalledTimes(1)
      expect(mockOnScaleChange).toHaveBeenCalledWith('6h')
    })

    it('allows selecting different scales in sequence', async () => {
      const user = userEvent.setup()
      render(<ScaleControl activeScale="1h" onScaleChange={mockOnScaleChange} />)

      await user.click(screen.getByRole('button', { name: '30m' }))
      expect(mockOnScaleChange).toHaveBeenCalledWith('30m')

      await user.click(screen.getByRole('button', { name: '72h' }))
      expect(mockOnScaleChange).toHaveBeenCalledWith('72h')

      expect(mockOnScaleChange).toHaveBeenCalledTimes(2)
    })

    it('can click the active button (idempotent)', async () => {
      const user = userEvent.setup()
      render(<ScaleControl activeScale="6h" onScaleChange={mockOnScaleChange} />)

      await user.click(screen.getByRole('button', { name: '6h' }))

      expect(mockOnScaleChange).toHaveBeenCalledWith('6h')
    })
  })
})

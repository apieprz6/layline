import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BoatPerformanceContent from '../BoatPerformanceContent'

describe('BoatPerformanceContent', () => {
  it('ships both tabs, with Races the one it opens on', () => {
    render(<BoatPerformanceContent />)

    const races = screen.getByRole('tab', { name: 'Races' })
    const overall = screen.getByRole('tab', { name: 'Overall' })

    expect(races).toHaveAttribute('aria-selected', 'true')
    expect(overall).toHaveAttribute('aria-selected', 'false')
  })

  it('points each tab at the panel below it, and moves on the arrow keys', async () => {
    const user = userEvent.setup({ delay: null })
    render(<BoatPerformanceContent />)

    // A tab that names no panel is a button wearing the role. The selected tab is
    // also the only stop in the tablist, which is what makes the arrows the way
    // between them rather than a second Tab press.
    const races = screen.getByRole('tab', { name: 'Races' })
    const panel = screen.getByRole('tabpanel')
    expect(races).toHaveAttribute('aria-controls', panel.id)
    expect(races).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Overall' })).toHaveAttribute('tabindex', '-1')

    races.focus()
    await user.keyboard('{ArrowRight}')

    const overall = screen.getByRole('tab', { name: 'Overall' })
    expect(overall).toHaveAttribute('aria-selected', 'true')
    expect(overall).toHaveFocus()
    expect(overall).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id)

    // And it wraps, so the pair is a loop rather than a dead end at each end.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Races' })).toHaveAttribute('aria-selected', 'true')
  })

  it('says the archive is empty rather than leaving the tab blank', () => {
    render(<BoatPerformanceContent />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('No races uploaded yet')).toBeInTheDocument()
  })

  it('switches to Overall, whose empty state is a decision and not a wait', async () => {
    const user = userEvent.setup({ delay: null })
    render(<BoatPerformanceContent />)

    await user.click(screen.getByRole('tab', { name: 'Overall' }))

    expect(screen.getByRole('tab', { name: 'Overall' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Season figures coming soon')).toBeInTheDocument()
    // The same shape as Wind Data's Model Forecast tab (ADR 0016), which means the
    // same component — so a spinner cannot appear in one and not the other.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })
})

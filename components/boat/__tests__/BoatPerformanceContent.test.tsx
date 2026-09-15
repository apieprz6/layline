import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RaceListEntry } from '@/types'
import BoatPerformanceContent from '../BoatPerformanceContent'

/** A race as `readRaces` hands one over. */
function race(overrides: Partial<RaceListEntry> = {}): RaceListEntry {
  return {
    id: 'race-1',
    title: 'Verve Cup',
    window_start: '2026-08-22T11:05:00',
    window_finish: '2026-08-22T13:20:00',
    filename: '08-22-26-glr.csv',
    window_seconds: 8_100,
    ...overrides,
  }
}

/** Empty archive and a viewer, which is what every tab test below only cares about. */
function renderEmpty() {
  return render(<BoatPerformanceContent races={[]} canWrite={false} />)
}

describe('BoatPerformanceContent', () => {
  it('ships both tabs, with Races the one it opens on', () => {
    renderEmpty()

    const races = screen.getByRole('tab', { name: 'Races' })
    const overall = screen.getByRole('tab', { name: 'Overall' })

    expect(races).toHaveAttribute('aria-selected', 'true')
    expect(overall).toHaveAttribute('aria-selected', 'false')
  })

  it('points each tab at the panel below it, and moves on the arrow keys', async () => {
    const user = userEvent.setup({ delay: null })
    renderEmpty()

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
    renderEmpty()

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('No races uploaded yet')).toBeInTheDocument()
  })

  it('switches to Overall, whose empty state is a decision and not a wait', async () => {
    const user = userEvent.setup({ delay: null })
    renderEmpty()

    await user.click(screen.getByRole('tab', { name: 'Overall' }))

    expect(screen.getByRole('tab', { name: 'Overall' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Season figures coming soon')).toBeInTheDocument()
    // The same shape as Wind Data's Model Forecast tab (ADR 0016), which means the
    // same component — so a spinner cannot appear in one and not the other.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })
})

describe('the Races tab, with an archive in it', () => {
  it('lists a race and opens to its own page', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} />)

    const link = screen.getByRole('link', { name: /Verve Cup/ })
    expect(link).toHaveAttribute('href', '/boat-performance/races/race-1')
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  it('states the window in the recording’s own clock, and a duration rather than a row count', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} />)

    // The digits the file wrote, not a locale's rendering of them: `toLocaleString` would read
    // 16:05 in London for a race sailed at 11:05 in Chicago.
    expect(screen.getByText('Aug 22 · 11:05 – 13:20')).toBeInTheDocument()
    // A duration a sailor can check against the afternoon. A row count is meaningless without the
    // cadence and counts a dead feed's copies as evidence (ADR 0009).
    expect(screen.getByText(/2h 15m/)).toBeInTheDocument()
    expect(screen.queryByText(/rows?$/i)).not.toBeInTheDocument()
  })

  it('shows an untitled race as untitled rather than naming it', () => {
    // A race with no title is normal (ADR 0010). Generating "Race on Aug 22" would be Layline
    // writing Testimony the sailor withheld.
    render(<BoatPerformanceContent races={[race({ title: null })]} canWrite={false} />)

    expect(screen.getByText('Untitled race')).toBeInTheDocument()
  })

  it('offers Upload to an admin and to nobody else', () => {
    const { unmount } = render(<BoatPerformanceContent races={[]} canWrite={false} />)
    expect(screen.queryByRole('link', { name: 'Upload a race' })).not.toBeInTheDocument()
    unmount()

    render(<BoatPerformanceContent races={[]} canWrite />)
    expect(screen.getByRole('link', { name: 'Upload a race' })).toHaveAttribute(
      'href',
      '/boat-performance/upload'
    )
  })
})

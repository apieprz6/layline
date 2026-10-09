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

/**
 * The Overall tab's content, which is a Server Component read on the real page.
 *
 * A stand-in here rather than a mock of the read: the tab's job in this component is to render
 * whatever it was handed, and what that node *is* belongs to the page's own test.
 */
const OVERALL = <div data-testid="overall-stub">Season figures</div>

/** Empty archive and a viewer, which is what every tab test below only cares about. */
function renderEmpty() {
  return render(<BoatPerformanceContent races={[]} canWrite={false} overall={OVERALL} />)
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

  it('switches to Overall and shows what the server read for it', async () => {
    const user = userEvent.setup({ delay: null })
    renderEmpty()

    await user.click(screen.getByRole('tab', { name: 'Overall' }))

    expect(screen.getByRole('tab', { name: 'Overall' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('overall-stub')).toBeInTheDocument()
  })

  it('keeps the Overall tab’s content out of the Races tab, rather than hiding it with CSS', () => {
    // One panel at a time. A node that is in the DOM behind the selected tab would be read out by
    // a screen reader and found by every `getByText` in this file.
    renderEmpty()
    expect(screen.queryByTestId('overall-stub')).not.toBeInTheDocument()
  })
})

describe('the Races tab, with an archive in it', () => {
  it('lists a race and opens to its own page', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} overall={OVERALL} />)

    const link = screen.getByRole('link', { name: /Verve Cup/ })
    expect(link).toHaveAttribute('href', '/boat-performance/races/race-1')
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  it('states the window in the recording’s own clock, and a duration rather than a row count', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} overall={OVERALL} />)

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
    render(<BoatPerformanceContent races={[race({ title: null })]} canWrite={false} overall={OVERALL} />)

    expect(screen.getByText('Untitled race')).toBeInTheDocument()
  })

  it('offers Upload to an admin and to nobody else', () => {
    const { unmount } = render(<BoatPerformanceContent races={[]} canWrite={false} overall={OVERALL} />)
    expect(screen.queryByRole('link', { name: 'Upload a race' })).not.toBeInTheDocument()
    unmount()

    render(<BoatPerformanceContent races={[]} canWrite overall={OVERALL} />)
    expect(screen.getByRole('link', { name: 'Upload a race' })).toHaveAttribute(
      'href',
      '/boat-performance/upload'
    )
  })
})

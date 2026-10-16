import { render, screen, within } from '@testing-library/react'
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
 * The season's figures, which are a Server Component read on the real page.
 *
 * A stand-in here rather than a mock of the read: the rail's job in this component is to render
 * whatever it was handed, and what that node *is* belongs to the page's own test.
 */
const SEASON = <div data-testid="season-stub">Season figures</div>

describe('BoatPerformanceContent', () => {
  it('names the section, with no tabs left to choose between', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Boat performance' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows the season and the races at once, the season first', () => {
    // A rail beside the races rather than a tab behind them. First in the document, which is what
    // puts it above the races on a phone, where the two stack.
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    const season = screen.getByRole('region', { name: 'This season' })
    const races = screen.getByRole('region', { name: /^Races/ })

    expect(within(season).getByTestId('season-stub')).toBeInTheDocument()
    expect(within(races).getByRole('link', { name: /Verve Cup/ })).toBeInTheDocument()
    expect(season.compareDocumentPosition(races) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says the archive is empty rather than leaving the list blank, and still shows the rail', () => {
    render(<BoatPerformanceContent races={[]} canWrite={false} season={SEASON} />)

    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('No races uploaded yet')).toBeInTheDocument()
    expect(screen.getByTestId('season-stub')).toBeInTheDocument()
  })

  it('counts the races in their heading, and states no count of none', () => {
    const { unmount } = render(
      <BoatPerformanceContent
        races={[race(), race({ id: 'race-2', title: 'Tri-State' })]}
        canWrite={false}
        season={SEASON}
      />
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Races · 2' })).toBeInTheDocument()
    unmount()

    // "Races · 0" over an empty state says the same thing twice.
    render(<BoatPerformanceContent races={[]} canWrite={false} season={SEASON} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Races' })).toBeInTheDocument()
  })

  it('offers Upload to an admin, in the races’ own toolbar, and to nobody else', () => {
    const { unmount } = render(<BoatPerformanceContent races={[]} canWrite={false} season={SEASON} />)
    expect(screen.queryByRole('link', { name: 'Upload a race' })).not.toBeInTheDocument()
    unmount()

    render(<BoatPerformanceContent races={[]} canWrite season={SEASON} />)
    const upload = within(screen.getByRole('region', { name: /^Races/ })).getByRole('link', {
      name: 'Upload a race',
    })
    expect(upload).toHaveAttribute('href', '/boat-performance/upload')
  })
})

describe('the race table', () => {
  it('lists a race and opens to its own page', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    const link = screen.getByRole('link', { name: /Verve Cup/ })
    expect(link).toHaveAttribute('href', '/boat-performance/races/race-1')
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })

  it('heads its three columns, and fills each row with all three', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    for (const column of ['Race', 'Window', 'Duration']) {
      expect(screen.getByText(column)).toBeInTheDocument()
    }

    // The whole row is the door, so all three figures are in the link a screen reader announces —
    // the column headers being for the eye only.
    const link = screen.getByRole('link', { name: /Verve Cup/ })
    expect(link).toHaveTextContent('Verve Cup')
    expect(link).toHaveTextContent('Aug 22 · 11:05 – 13:20')
    expect(link).toHaveTextContent('2h 15m')
  })

  it('leaves the filename to the race’s own page', () => {
    // The owner's call on LAY-178: a filename is not what a sailor picks a race by.
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    expect(screen.queryByText('File')).not.toBeInTheDocument()
    expect(screen.queryByText(/08-22-26-glr\.csv/)).not.toBeInTheDocument()
  })

  it('labels each figure for a screen reader, which never hears the column headers', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    // Three figures run together would be "Verve Cup Aug 22 · 11:05 – 13:20 2h 15m", with nothing
    // to say which number is the duration. Each cell is a grid item, so the name has a space before
    // every comma — which a screen reader pauses on all the same.
    expect(
      screen.getByRole('link', {
        name: /^Verve Cup ?, window Aug 22 · 11:05 – 13:20 ?, duration 2h 15m$/,
      })
    ).toBeInTheDocument()
  })

  it('keeps the newest-first order it was handed', () => {
    render(
      <BoatPerformanceContent
        races={[race({ id: 'b', title: 'Second' }), race({ id: 'a', title: 'First' })]}
        canWrite={false}
        season={SEASON}
      />
    )

    const links = within(screen.getByRole('list')).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/boat-performance/races/b',
      '/boat-performance/races/a',
    ])
  })

  it('states the window in the recording’s own clock, and a duration rather than a row count', () => {
    render(<BoatPerformanceContent races={[race()]} canWrite={false} season={SEASON} />)

    // The digits the file wrote, not a locale's rendering of them: `toLocaleString` would read
    // 16:05 in London for a race sailed at 11:05 in Chicago.
    expect(screen.getByText('Aug 22 · 11:05 – 13:20')).toBeInTheDocument()
    // A duration a sailor can check against the afternoon. A row count is meaningless without the
    // cadence and counts a dead feed's copies as evidence (ADR 0009).
    expect(screen.getByText('2h 15m')).toBeInTheDocument()
    expect(screen.queryByText(/rows?$/i)).not.toBeInTheDocument()
  })

  it('shows an untitled race as untitled rather than naming it', () => {
    // A race with no title is normal (ADR 0010). Generating "Race on Aug 22" would be Layline
    // writing Testimony the sailor withheld.
    render(<BoatPerformanceContent races={[race({ title: null })]} canWrite={false} season={SEASON} />)

    expect(screen.getByText('Untitled race')).toBeInTheDocument()
  })
})

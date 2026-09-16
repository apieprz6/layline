import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import DashboardLoading from '@/app/(app)/(dashboard)/loading'
import WindDataLoading from '@/app/(app)/wind-data/loading'
import StationLoading from '@/app/station/[buoyId]/loading'
import BoatManagementSkeleton from '@/components/boat/BoatManagementSkeleton'
import BoatPerformanceSkeleton from '@/components/boat/BoatPerformanceSkeleton'

/**
 * The five skeletons: three `loading.tsx` files, and the two the boat pages hold behind
 * a `<Suspense>` of their own so a **Guest** is never served a placeholder of a screen
 * they get no form of (ADR 0015).
 *
 * Two questions live here. The first is the shared contract: a skeleton says what is
 * on its way, it offers nothing to tap, and no placeholder in it carries a character
 * — a bar with a number in it would be a fabricated reading, which is the one thing
 * this codebase never does.
 *
 * The second is per screen, and only the part jsdom can answer: that the chrome a
 * screen already knows — a section's title, its tab labels, the four Boat Setup names
 * — is rendered as itself rather than as a bar, since a bar in its place is a bar that
 * moves. Whether the *heights* line up is a browser question and is asked in
 * `e2e/loading-skeletons.spec.ts`.
 */

const SCREENS: readonly { route: string; loading: () => ReactElement; announces: string }[] = [
  { route: '/', loading: DashboardLoading, announces: 'Loading current conditions' },
  { route: '/wind-data', loading: WindDataLoading, announces: 'Loading wind data' },
  { route: '/station/[buoyId]', loading: StationLoading, announces: 'Loading station history' },
  { route: '/boat-management', loading: BoatManagementSkeleton, announces: 'Loading the boat' },
  {
    route: '/boat-performance',
    loading: BoatPerformanceSkeleton,
    announces: 'Loading the race archive',
  },
]

describe.each(SCREENS)('$route while it loads', ({ loading: Loading, announces }) => {
  it('says what is on its way', () => {
    render(<Loading />)

    expect(screen.getByRole('status').textContent).toBe(announces)
    expect(screen.getByTestId('skeleton-screen')).toHaveAttribute('aria-busy', 'true')
  })

  it('holds a shape and takes no taps', () => {
    render(<Loading />)

    // Nothing here is wired to anything, so anything that looked interactive would be
    // a second dead click on top of the one this ticket exists to remove.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('puts no value inside a placeholder', () => {
    render(<Loading />)

    const bars = screen.getAllByTestId('skeleton')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      // A text bar lays out one non-breaking space to get its height; anything else
      // would be a reading nobody took.
      expect(['', '\u00A0']).toContain(bar.textContent)
      expect(bar).toHaveClass('skeleton')
    }
  })
})

describe('where the boundaries sit', () => {
  const APP = resolve(__dirname, '../../app')

  /** Every `loading.tsx` at or below `dir`. */
  function loadingFilesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return loadingFilesUnder(path)
      return entry.name === 'loading.tsx' ? [path] : []
    })
  }

  it('gives `/` a boundary of its own rather than one over the whole group', () => {
    // A `loading.tsx` stands in for every route below it, so one directly in `(app)`
    // would be the dashboard's skeleton showing on the way to the boat — and worse, a
    // boundary above the boat pages (see below).
    expect(existsSync(join(APP, '(app)/(dashboard)/loading.tsx'))).toBe(true)
    expect(existsSync(join(APP, '(app)/loading.tsx'))).toBe(false)
  })

  it('leaves no boundary above a route that turns a Guest away', () => {
    // The reason this is a test and not a comment: a Suspense boundary above one of
    // these pages lets the shell flush before the page's own auth resolve finishes, so
    // the Guest is served a placeholder of the screen and their redirect arrives from
    // the client instead of as a redirect on the request. ADR 0015 says a Guest is
    // served no form of these screens, and a skeleton is a form of one. The skeletons
    // for both live behind a `<Suspense>` *inside* the page, below the guard.
    expect(loadingFilesUnder(join(APP, '(app)/boat-management'))).toEqual([])
    expect(loadingFilesUnder(join(APP, '(app)/boat-performance'))).toEqual([])
  })
})

describe('/ while it loads', () => {
  it("is LiveWindCard's shape: its label, and a row per station the page asks for", () => {
    render(<DashboardLoading />)

    expect(screen.getByText('Live Wind')).toBeInTheDocument()
    expect(screen.getByText('See all →')).toBeInTheDocument()
    expect(screen.getAllByTestId('station-row-skeleton').length).toBeGreaterThan(0)
  })
})

describe('/wind-data while it loads', () => {
  it('is the section header, a summary bar, and a card per station', () => {
    render(<WindDataLoading />)

    expect(screen.getByRole('heading', { name: 'Wind Data' })).toBeInTheDocument()
    expect(screen.getByText('Live & Historical')).toBeInTheDocument()
    expect(screen.getByText('Model Forecast')).toBeInTheDocument()
    expect(screen.getAllByTestId('station-row-skeleton').length).toBeGreaterThan(0)
    // The provenance line is fixed text about where the readings come from, not a
    // reading, so it is the real string.
    expect(screen.getByText(/Sources: NDBC · NOAA ASOS/)).toBeInTheDocument()
  })
})

describe('the station rows both wind screens draw', () => {
  /**
   * Neither screen renders a row for a buoy that came back without data — `LiveWindCard`
   * skips it and returns nothing at all when both are dark, and `WindDataContent` skips
   * its card. The Purdue buoy runs May–October, so out of season the second row is not
   * late, it is not coming, and drawing it means the card visibly loses a row the moment
   * the real one arrives: the shift this ticket exists to remove.
   */
  const SEASONS = [
    { season: 'in the Purdue buoy’s season', now: '2026-07-15T12:00:00', rows: 2 },
    { season: 'out of it', now: '2026-01-15T12:00:00', rows: 1 },
  ] as const

  const WIND_SCREENS = [
    { route: '/', loading: DashboardLoading },
    { route: '/wind-data', loading: WindDataLoading },
  ] as const

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each(
    WIND_SCREENS.flatMap((screenUnderTest) =>
      SEASONS.map((season) => ({ ...screenUnderTest, ...season }))
    )
  )('$route draws $rows $season', ({ loading: Loading, now, rows }) => {
    // Mid-month, so the local-time month `isPurdueSeason` reads is the same one in any
    // timezone the suite might run in.
    jest.useFakeTimers({ now: new Date(now) })

    render(<Loading />)

    expect(screen.getAllByTestId('station-row-skeleton')).toHaveLength(rows)
  })
})

describe('/station/[buoyId] while it loads', () => {
  it('names the panel and the four statistics, and no station', () => {
    render(<StationLoading />)

    expect(screen.getByText('Wind speed')).toBeInTheDocument()
    for (const label of ['Stats', 'Jump to', 'Legend']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    for (const label of ['Mean dir', 'Mean spd', 'Range', 'Veer/back']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Scale')).toBeInTheDocument()
    expect(screen.getByText('Time scrubber')).toBeInTheDocument()

    // The route carries a buoy id, not a station name. Spelling one out here would put
    // a second copy of the name in a second place.
    for (const name of [/Harrison/, /Purdue/, /CHII2/, /45198/]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    }
  })
})

describe('/boat-management while it loads', () => {
  it('names both sections and all four artifacts, and never the boat', () => {
    render(<BoatManagementSkeleton />)

    expect(screen.getByText('Boat management')).toBeInTheDocument()
    expect(screen.getByText('Boat setup')).toBeInTheDocument()
    // Always these four, always in this order (ADR 0012) — a constant, not data.
    for (const label of ['Polar', 'Crossover Chart', 'Rig Tune', 'Instrument Calibration']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // The identity is the one thing on this screen no unauthenticated render may
    // carry, and at this point the Account is still being resolved.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('/boat-performance while it loads', () => {
  it('is the Races tab, with no upload the Role has not been checked for', () => {
    render(<BoatPerformanceSkeleton />)

    expect(screen.getByRole('heading', { name: 'Boat performance' })).toBeInTheDocument()
    expect(screen.getByText('Races')).toBeInTheDocument()
    expect(screen.getByText('Overall')).toBeInTheDocument()
    expect(screen.queryByText(/Upload a race/)).not.toBeInTheDocument()
  })
})

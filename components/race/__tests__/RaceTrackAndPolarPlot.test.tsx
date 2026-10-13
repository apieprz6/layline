/**
 * The per-Race page's two pictures and their one readout (ADR 0040), in jsdom.
 *
 * Built through the real functions the page is: `raceTrackHeatmap` and `racePolarPlot` over the
 * harness's synthetic race, so the join between the two pictures is the production join rather
 * than two fixtures that happen to agree.
 *
 * What jsdom cannot answer is a tap on the *map* — its hit test measures `getBoundingClientRect`,
 * which is zero everywhere here — and where anything sits on screen. Those two are
 * `e2e/polar-plot.spec.ts`'s, against `next build && next start`.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HARNESS_POLAR, harnessRows } from '@/app/dev/race-track/fixture'
import { racePlottableRows, racePolarPlot, seasonTrace } from '@/services/analysis/polar-plot'
import { polarTargets } from '@/services/analysis/polar-targets'
import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'
import type { RaceTrack } from '@/types'

jest.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'solar', preference: 'auto', setPreference: jest.fn() }),
}))

import RaceTrackSection from '../RaceTrackSection'

const ROWS = harnessRows()
const TARGETS = polarTargets(HARNESS_POLAR)
const RACE = { id: 'harness-race', polar_version_id: 'harness-polar' }
const HEATMAP = raceTrackHeatmap(ROWS, TARGETS)!
const PLOT = racePolarPlot(ROWS, RACE, HARNESS_POLAR, TARGETS)
const SEASON = seasonTrace(racePlottableRows(ROWS, RACE, TARGETS))

const TRACK: RaceTrack = { heatmap: HEATMAP, scoring: 'polar', plot: PLOT }

/** Row indices the map has a stroke or a point for. */
const ON_THE_MAP = new Set([
  ...HEATMAP.segments.map((segment) => segment.row.row_index),
  ...HEATMAP.points.map((point) => point.row.row_index),
])

/** A moment on the plot that is also on the map, and one that is only on the plot. */
const BOTH = PLOT.moments.find((moment) => ON_THE_MAP.has(moment.row_index))!
const PLOT_ONLY = PLOT.moments.find((moment) => !ON_THE_MAP.has(moment.row_index))!

function dot(rowIndex: number): Element {
  return screen.getByTestId('polar-plot').querySelector(`[data-row="${rowIndex}"]`) as Element
}

function renderSection(track: RaceTrack = TRACK): ReturnType<typeof userEvent.setup> {
  render(<RaceTrackSection track={track} season={SEASON} />)
  return userEvent.setup({ delay: null })
}

describe('the fixture', () => {
  it('has a moment on both pictures, and the first fix of a run on the plot alone', () => {
    expect(BOTH).toBeDefined()
    expect(PLOT_ONLY).toBeDefined()
  })
})

describe('the two pictures, side by side', () => {
  it('draws the map and the Polar Plot as two cards of one shell', () => {
    renderSection()

    expect(screen.getByTestId('race-track-card')).toHaveTextContent('Race track')
    expect(screen.getByTestId('polar-plot-card')).toHaveTextContent('Boat performance vs. polars')
    expect(within(screen.getByTestId('race-track-card')).getByTestId('track-camera')).toBeInTheDocument()
  })

  it('draws every scored moment as its own dot, sized by how long it lasted', () => {
    renderSection()

    const dots = screen.getAllByTestId('polar-plot-dot')
    expect(dots).toHaveLength(PLOT.moments.length)

    const radiusOf = (rowIndex: number): number =>
      Number(dot(rowIndex).querySelector('circle:last-child')?.getAttribute('r'))
    const longest = [...PLOT.moments].sort((a, b) => b.seconds - a.seconds)[0]
    const shortest = [...PLOT.moments].sort((a, b) => a.seconds - b.seconds)[0]
    expect(radiusOf(longest.row_index)).toBeGreaterThanOrEqual(radiusOf(shortest.row_index))
  })

  it('stitches a Filler-Anchored moment and still colours it by its percent, as the track does', () => {
    renderSection()

    const filler = PLOT.moments.find((moment) => moment.filler_anchored)!
    const ink = dot(filler.row_index).querySelector('[data-filler-anchored]')
    expect(ink?.getAttribute('fill')).toMatch(/^var\(--track-/)
    expect(ink?.getAttribute('stroke')).toBe('var(--state-warning)')
    expect(ink?.getAttribute('stroke-dasharray')).not.toBeNull()
  })

  it('draws the season behind the race, and the certificate columns the race was scored against', () => {
    renderSection()

    expect(screen.getByTestId('polar-plot-trace')).toBeInTheDocument()
    // Ten knots of wind throughout, between the 8 and 12 kt columns.
    expect(screen.getAllByTestId('polar-plot-column').map((column) => column.dataset.tws)).toEqual([
      '8',
      '12',
    ])
    expect(screen.getByTestId('polar-plot-legend')).toHaveTextContent(/certificate\s*not measured\s*season/)
  })

  it('says why there is no plot on a race that records no Polar, and still draws the map', () => {
    renderSection({ heatmap: raceTrackHeatmap(ROWS, null), scoring: 'no-polar-version', plot: null })

    expect(screen.getByTestId('polar-plot-card')).toHaveTextContent(
      'This race records no Polar Version, so there is nothing to draw its sailing against.'
    )
    expect(screen.queryByTestId('polar-plot')).not.toBeInTheDocument()
    expect(screen.getByTestId('track-camera')).toBeInTheDocument()
  })
})

describe('one selection, one readout', () => {
  it('shows no readout until something is tapped', () => {
    renderSection()
    expect(screen.queryByTestId('shared-readout')).not.toBeInTheDocument()
    expect(screen.queryByTestId('track-readout')).not.toBeInTheDocument()
  })

  it('lights the same row on the track when a dot is tapped, read out by the shipped readout', async () => {
    const user = renderSection()

    await user.click(dot(BOTH.row_index))

    expect(screen.getByTestId('polar-plot-selected')).toBeInTheDocument()
    expect(screen.getByTestId('track-selection')).toBeInTheDocument()
    // Exactly one readout, and it is `TrackReadout` inside the shared card — not one in the frame.
    expect(screen.getAllByTestId('track-readout')).toHaveLength(1)
    const card = screen.getByTestId('shared-readout')
    expect(within(card).getByTestId('track-readout')).toBeInTheDocument()
    expect(within(card).getByTestId('shared-readout-plot')).toHaveTextContent(
      `lasted ${BOTH.seconds}s`
    )
  })

  it('leads the readout with whatever overlay the track is coloured by', async () => {
    const user = renderSection()
    await user.click(dot(BOTH.row_index))

    const headline = (): string => screen.getByTestId('track-readout-headline').textContent ?? ''
    expect(headline()).toMatch(/of target speed/)

    await user.click(within(screen.getByTestId('track-overlays')).getByRole('button', { name: 'Boat speed' }))
    expect(headline()).toMatch(/over the ground/)
  })

  it('answers for the first fix of a run, which the map has no stroke for, and says so', async () => {
    const user = renderSection()

    await user.click(dot(PLOT_ONLY.row_index))

    expect(screen.getByTestId('polar-plot-selected')).toBeInTheDocument()
    expect(screen.queryByTestId('track-selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('track-readout')).not.toBeInTheDocument()
    expect(screen.getByTestId('shared-readout-plot-only')).toHaveTextContent('of target speed')
    expect(screen.getByTestId('shared-readout-plot')).toHaveTextContent('not on the map')
  })

  it('clears on a second tap of the same dot, and on the readout’s own close', async () => {
    const user = renderSection()

    await user.click(dot(BOTH.row_index))
    await user.click(dot(BOTH.row_index))
    expect(screen.queryByTestId('shared-readout')).not.toBeInTheDocument()

    await user.click(dot(BOTH.row_index))
    await user.click(screen.getByRole('button', { name: 'Close this readout' }))
    expect(screen.queryByTestId('polar-plot-selected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('track-selection')).not.toBeInTheDocument()
  })

  it('says a stretch the plot cannot draw has no figure, rather than ringing a neighbour', async () => {
    // What the map hands up for a parked or mid-manoeuvre stretch is a row the plot holds no dot
    // for. jsdom cannot tap the map, so the shared card is rendered on the selection it would get.
    const { default: SharedReadout } = await import('../SharedReadout')
    const drawn = new Set(PLOT.moments.map((moment) => moment.row_index))
    const undrawn = HEATMAP.segments.find((segment) => !drawn.has(segment.row.row_index))!.row

    render(
      <SharedReadout
        facts={undrawn}
        moment={null}
        hasPlot
        overlay="target_speed"
        scoring="polar"
        onClear={jest.fn()}
      />
    )

    expect(screen.getByTestId('track-readout')).toBeInTheDocument()
    expect(screen.getByTestId('shared-readout-plot')).toHaveTextContent('no figure for this moment')
  })
})

describe('the words', () => {
  it('never says "row", and keeps the method behind one collapsed disclosure', async () => {
    const user = renderSection()
    await user.click(dot(BOTH.row_index))

    const plotCard = screen.getByTestId('polar-plot-card')
    expect(plotCard.textContent).not.toMatch(/\brows?\b/i)
    expect(screen.getByTestId('shared-readout-plot').textContent).not.toMatch(/\brows?\b/i)
    expect(within(plotCard).getByTestId('polar-plot-explainer')).not.toHaveAttribute('open')
  })
})

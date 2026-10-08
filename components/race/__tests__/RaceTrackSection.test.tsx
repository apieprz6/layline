/**
 * What the **Race Track Heatmap** section draws, and what it says about what it could not colour.
 *
 * Everything here is a claim about markup, which is Jest's question (`docs/testing/README.md`).
 * The one thing that is not — whether the camera actually moves in a browser after hydration —
 * lives in `e2e/track-heatmap.spec.ts`, because ADR 0033 is explicit that a click proving nothing
 * is worse than no test.
 *
 * Three rules are asserted rather than eyeballed:
 *
 * **Nothing that is not a measurement borrows a step of the ramp.** An unscored leg is drawn in
 * `--text-muted` and never in `--track-at`, which is the ramp's own grey and means *on target*.
 *
 * **Every colour is a token.** `.theme-nightvision` collapses this ramp to one red depth scale,
 * and a chart escaping the theme is the one thing `globals.css` forbids — a literal hex here would
 * leave a blue-and-amber map on a monochromatic red screen, which is the mistake the prototype
 * made and kept as a finding.
 *
 * **The legend changes its words after dark.** Both arms land on the same red ramp then, so a
 * legend still reading `slower — 100% — faster` would be claiming a polarity the colours no longer
 * carry. That sentence is the defect the theme obliges this component to avoid, not the collapsed
 * hue.
 */

import { render, screen } from '@testing-library/react'
import type { RaceTrack, RaceTrackHeatmap } from '@/types'

let mockTheme: 'solar' | 'nightvision' = 'solar'

jest.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ theme: mockTheme, preference: 'auto', setPreference: jest.fn() }),
}))

import RaceTrackSection from '../RaceTrackSection'

/** Chicago–Waukegan's own counts, as `archive-track-heatmap.test.ts` measures them. */
const COUNTS: RaceTrackHeatmap['counts'] = {
  rows: 258,
  with_fix: 258,
  scored: 113,
  filler_anchored: 31,
  frozen: 82,
  low_speed: 23,
  maneuver_window: 13,
  without_target: 27,
}

function heatmapOf(over: Partial<RaceTrackHeatmap> = {}): RaceTrackHeatmap {
  return {
    width: 360,
    height: 440,
    metres_per_unit: 5,
    segments: [
      { points: '10.0,10.0 40.0,40.0', band: 'below-2', filler_anchored: false },
      { points: '40.0,40.0 80.0,90.0', band: 'above-2', filler_anchored: true },
      { points: '80.0,90.0 120.0,140.0', band: null, filler_anchored: false },
    ],
    bridges: [{ x1: 120, y1: 140, x2: 300, y2: 320, seconds: 3436, rows: 2 }],
    rings: [
      { cx: 120, cy: 140 },
      { cx: 120, cy: 140 },
    ],
    counts: COUNTS,
    ...over,
  }
}

function trackOf(over: Partial<RaceTrack> = {}): RaceTrack {
  return { heatmap: heatmapOf(), scoring: 'polar', ...over }
}

function legs(container: HTMLElement): SVGPolylineElement[] {
  return [...container.querySelectorAll<SVGPolylineElement>('[data-testid="track-camera"] polyline')]
}

beforeEach(() => {
  mockTheme = 'solar'
})

describe('the track, drawn', () => {
  it('draws every leg, and colours only the ones that carry a measurement', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    const drawn = legs(container)
    expect(drawn).toHaveLength(3)

    const strokes = drawn.map((leg) => leg.getAttribute('stroke'))
    expect(strokes).toContain('var(--track-below-2)')
    expect(strokes).toContain('var(--track-above-2)')
    // The unscored leg is a hairline in muted text, never the ramp's grey midpoint — which would
    // read as on target.
    expect(strokes).toContain('var(--text-muted)')
    expect(strokes).not.toContain('var(--track-at)')
  })

  it('marks a Filler-Anchored leg as well as colouring it', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // By stroke, not by position: the unscored hairlines are drawn first and underneath, so the
    // coloured track overlays them rather than competing with them.
    const measured = legs(container).find(
      (leg) => leg.getAttribute('stroke') === 'var(--track-below-2)'
    ) as SVGPolylineElement
    const filler = legs(container).find(
      (leg) => leg.getAttribute('stroke') === 'var(--track-above-2)'
    ) as SVGPolylineElement

    // Coloured by its own percent like any other row (ADR 0036) — and textured, so the two still
    // read apart on the water.
    expect(filler.getAttribute('stroke')).toBe('var(--track-above-2)')
    expect(filler.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(measured.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('names a token for every colour, so the night-vision theme stays in charge', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    const svg = container.querySelector('svg')?.outerHTML ?? ''
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i)
  })

  it('rings a frozen run and bridges it with its own duration', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    const rings = [
      ...container.querySelectorAll('[data-testid="track-camera"] circle'),
    ]
    expect(rings).toHaveLength(2)
    expect(rings[0].getAttribute('stroke')).toBe('var(--wind-storm)')

    // The label is the whole point of the bridge: "the recording stops here" and "the feed died
    // for 57 minutes across four miles of water" are different facts.
    expect(screen.getByText('feed dead 57m')).toBeInTheDocument()
  })

  it('keeps every stroke the width it was drawn at, however far the sailor zooms', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // Zooming in separates the segments; it does not fatten them. Without this the track becomes
    // one blue band at 12× and the heatmap stops being readable exactly where it is being read.
    expect(
      legs(container).every((leg) => leg.getAttribute('vector-effect') === 'non-scaling-stroke')
    ).toBe(true)
  })

  it('starts showing the whole track, with only zoom-in offered', () => {
    render(<RaceTrackSection track={trackOf()} />)

    expect(screen.getByTestId('track-camera')).toHaveAttribute(
      'transform',
      'translate(0 0) scale(1)'
    )
    expect(screen.getByLabelText('Zoom in')).toBeEnabled()
    // At 1× there is nothing to pan to and nothing to go home from, and the page still owns the
    // touch gesture.
    expect(screen.getByLabelText('Zoom out')).toBeDisabled()
    expect(screen.getByLabelText('Whole track')).toBeDisabled()
  })

  it('states a scale bar, so nobody has to guess how far the boat went', () => {
    render(<RaceTrackSection track={trackOf()} />)

    // 360 units at 5 m per unit: a fifth of the box is 360m, 1-2-5-rounded to 200.
    expect(screen.getByTestId('track-scale-bar')).toHaveTextContent('200 m')
  })

  it('says there is no track where the recording logged no position', () => {
    render(<RaceTrackSection track={trackOf({ heatmap: null })} />)

    // A real case in the archive. An empty frame explains nothing, so the words go where the map
    // would be.
    expect(screen.getByTestId('track-no-fixes')).toHaveTextContent(/logged no position anywhere/)
    expect(screen.queryByTestId('track-camera')).not.toBeInTheDocument()
  })
})

describe('the legend beneath it', () => {
  it('reads as a polarity by day, which is what the diverging ramp is for', () => {
    render(<RaceTrackSection track={trackOf()} />)

    const wording = screen.getByTestId('track-ramp-wording')
    expect(wording).toHaveTextContent('slower than target')
    expect(wording).toHaveTextContent('100%')
    expect(wording).toHaveTextContent('faster')
  })

  it('stops claiming a side after dark, because the ramp no longer carries one', () => {
    mockTheme = 'nightvision'
    render(<RaceTrackSection track={trackOf()} />)

    const wording = screen.getByTestId('track-ramp-wording')
    expect(wording).toHaveTextContent(/depth, not side/)
    expect(wording).toHaveTextContent(/either/)
    // The daylight sentence is gone rather than reworded around: 85% and 115% are the same colour
    // on this theme, so "slower … faster" would be a lie about the swatches above it.
    expect(wording).not.toHaveTextContent('slower than target')
  })

  it('draws all seven bands, so the midpoint is visible as a band and not a boundary', () => {
    render(<RaceTrackSection track={trackOf()} />)

    expect(screen.getByTestId('track-ramp').children).toHaveLength(7)
  })

  it('states in words how much of the race it could not score', () => {
    render(<RaceTrackSection track={trackOf()} />)

    const counts = screen.getByTestId('track-counts')
    // Never left to be inferred from how much grey is on screen (ADR 0033).
    expect(counts).toHaveTextContent('145 of 258 rows are drawn but not scored.')
    // And by reason, because "the boat was parked" and "the Polar cannot answer out here" are not
    // the same sentence.
    expect(counts).toHaveTextContent('82 sat inside a dropout')
    expect(counts).toHaveTextContent('36 were parked or mid-manoeuvre')
    expect(counts).toHaveTextContent('27 are in range of nothing the Polar can answer')
  })

  it('says a race with no Polar Version has nothing to compare, and shows no ramp', () => {
    render(<RaceTrackSection track={trackOf({ scoring: 'no-polar-version' })} />)

    expect(screen.getByTestId('track-counts')).toHaveTextContent(/records no Polar Version/)
    // A ramp with nothing on it would invite the grey to be read as a measurement.
    expect(screen.queryByTestId('track-ramp')).not.toBeInTheDocument()
  })

  it('distinguishes a Polar that could not be read from one that was never recorded', () => {
    render(<RaceTrackSection track={trackOf({ scoring: 'polar-unreadable' })} />)

    expect(screen.getByTestId('track-counts')).toHaveTextContent(/could not be read/)
    expect(screen.getByTestId('track-counts')).not.toHaveTextContent(/records no Polar Version/)
  })

  it('counts a row that logged no position as drawn nowhere, and says so', () => {
    render(
      <RaceTrackSection
        track={trackOf({ heatmap: heatmapOf({ counts: { ...COUNTS, with_fix: 250 } }) })}
      />
    )

    expect(screen.getByTestId('track-counts')).toHaveTextContent(
      /8 logged no position at all, so they are in no part of this picture/
    )
  })
})

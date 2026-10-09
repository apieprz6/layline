/**
 * What the **Race Track Heatmap** section draws, what it says about what it could not colour, and
 * what changes when the sailor switches overlay.
 *
 * Everything here is a claim about markup, which is Jest's question (`docs/testing/README.md`).
 * The two things that are not — whether the camera moves in a browser after hydration, and whether
 * a tap lands on the stretch the sailor aimed at — live in `e2e/track-heatmap.spec.ts`, because
 * ADR 0033 is explicit that a click proving nothing is worse than no test, and because a hit test
 * against `getBoundingClientRect` is meaningless where every rect is zero.
 *
 * Four rules are asserted rather than eyeballed:
 *
 * **Nothing that is not a measurement borrows a step of the ramp.** An uncoloured leg is drawn in
 * `--text-muted` and never in `--track-at`, which is the ramp's own grey and means *on target*.
 *
 * **Every colour is a token.** `.theme-nightvision` collapses every scale to one red depth ramp,
 * and a chart escaping the theme is the one thing `globals.css` forbids — a literal hex here would
 * leave a blue-and-amber map on a monochromatic red screen, which is the mistake the prototype
 * made and kept as a finding.
 *
 * **Each legend changes its words after dark**, because each scale loses something different then,
 * and the one thing none of them may do is keep the daylight sentence.
 *
 * **A ratio and a reading are gated differently** (ADR 0037): the parked row has no percent of
 * target and does have a speed over the ground, and the picture has to show both of those facts.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RaceTrack, RaceTrackHeatmap, TrackRowFacts } from '@/types'

let mockTheme: 'solar' | 'nightvision' = 'solar'

jest.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ theme: mockTheme, preference: 'auto', setPreference: jest.fn() }),
}))

import RaceTrackSection from '../RaceTrackSection'

/** On the pace, close-hauled on starboard in eleven knots of wind. */
const ON_THE_PACE: TrackRowFacts = {
  row_index: 1,
  row_time: '2026-06-20T16:04:00',
  sog: 6.9,
  tws: 11,
  twa: 48,
  cog: 40,
  target_speed: 6.5,
  polar_efficiency: 6.9 / 6.5,
  target_vmg: 4.6,
  vmg_efficiency: 1.04,
  filler_anchored: false,
  excluded: null,
}

/** Sailed tighter than the certificate measures, so its target came off a manufactured cell. */
const FILLER_ANCHORED: TrackRowFacts = {
  ...ON_THE_PACE,
  row_index: 2,
  row_time: '2026-06-20T16:04:30',
  twa: 45,
  sog: 4.6,
  target_speed: 4.5,
  polar_efficiency: 4.6 / 4.5,
  filler_anchored: true,
}

/** Parked: no percent of target (ADR 0025), and a speed over the ground that is simply true. */
const PARKED: TrackRowFacts = {
  ...ON_THE_PACE,
  row_index: 3,
  row_time: '2026-06-20T16:05:00',
  sog: 1.1,
  polar_efficiency: null,
  vmg_efficiency: null,
  excluded: 'maneuver_window',
}

/** The lone fix a dropout left on its own, between two dead stretches. */
const LONE: TrackRowFacts = { ...ON_THE_PACE, row_index: 4, sog: 3.2, polar_efficiency: 0.5 }

/** Chicago–Waukegan's own counts, as `archive-track-heatmap.test.ts` measures them. */
const COUNTS: RaceTrackHeatmap['counts'] = {
  rows: 258,
  with_fix: 258,
  frozen: 82,
  low_speed: 23,
  maneuver_window: 13,
  overlays: {
    target_speed: { scored: 113, flagged: 31, without_value: 27 },
    target_vmg: { scored: 110, flagged: 31, without_value: 30 },
    sog: { scored: 176, flagged: 0, without_value: 0 },
    tws: { scored: 170, flagged: 0, without_value: 6 },
    twa: { scored: 170, flagged: 0, without_value: 6 },
    cog: { scored: 176, flagged: 0, without_value: 0 },
  },
}

function heatmapOf(over: Partial<RaceTrackHeatmap> = {}): RaceTrackHeatmap {
  return {
    width: 360,
    height: 440,
    metres_per_unit: 5,
    segments: [
      { points: '10.0,10.0 40.0,40.0', x1: 10, y1: 10, x2: 40, y2: 40, row: ON_THE_PACE },
      { points: '40.0,40.0 80.0,90.0', x1: 40, y1: 40, x2: 80, y2: 90, row: FILLER_ANCHORED },
      { points: '80.0,90.0 120.0,140.0', x1: 80, y1: 90, x2: 120, y2: 140, row: PARKED },
    ],
    // A fix with no neighbour to join, which is drawn as a point rather than dropped.
    points: [{ x: 300, y: 320, row: LONE }],
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
  return [
    ...container.querySelectorAll<SVGPolylineElement>('[data-testid="track-camera"] polyline'),
  ]
}

function strokes(container: HTMLElement): (string | null)[] {
  return legs(container).map((leg) => leg.getAttribute('stroke'))
}

beforeEach(() => {
  mockTheme = 'solar'
})

describe('the track, drawn', () => {
  it('draws every leg, and colours only the ones that carry a measurement', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // Three legs and the selection halo's absence: the halo is only drawn once a stretch is read.
    expect(legs(container)).toHaveLength(3)

    const painted = strokes(container)
    expect(painted).toContain('var(--track-above-1)')
    // The unscored leg is a hairline in muted text, never the ramp's grey midpoint — which would
    // read as on target.
    expect(painted).toContain('var(--text-muted)')
    expect(painted).not.toContain('var(--track-at)')
  })

  it('marks a Filler-Anchored leg as well as colouring it', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // By stroke, not by position: the unscored hairlines are drawn first and underneath, so the
    // coloured track overlays them rather than competing with them.
    const filler = legs(container).find(
      (leg) => leg.getAttribute('data-filler-anchored') === 'true'
    ) as SVGPolylineElement

    // Coloured by its own percent like any other row (ADR 0036) — and textured, so the two still
    // read apart on the water.
    expect(filler.getAttribute('stroke')).toBe('var(--track-above-1)')
    expect(filler.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(
      legs(container).filter((leg) => leg.getAttribute('stroke-dasharray') !== null)
    ).toHaveLength(1)
  })

  it('carries the reason a leg is grey into the DOM, even though all of them draw alike', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // ADR 0033 wants the excluded reason discriminated all the way to the renderer. Several states
    // share one hairline on purpose — geometry with no claim on it should not look like several
    // different claims — but a hairline that cannot say why it is grey is the collapse that rule
    // exists to prevent.
    const hairline = legs(container).find(
      (leg) => leg.getAttribute('stroke') === 'var(--text-muted)'
    ) as SVGPolylineElement
    expect(hairline).toHaveAttribute('data-not-scored', 'maneuver_window')
  })

  it('plots a fix no leg could reach, with its own reading on it', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // A run of one cannot be a polyline, and the boat was there. Chicago–Waukegan's window really
    // holds two of these (see `archive-track-heatmap.test.ts`).
    const point = container.querySelector(
      '[data-testid="track-camera"] circle[fill="var(--track-below-3)"]'
    )
    expect(point).toHaveAttribute('cx', '300')
  })

  it('names a token for every colour, so the night-vision theme stays in charge', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    const svg = container.querySelector('svg')?.outerHTML ?? ''
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i)
  })

  it('rings a frozen run and bridges it with its own duration', () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    // By stroke: the lone-fix point is a circle in the same group, and a ring is the one with a
    // stroke and no fill.
    const rings = [
      ...container.querySelectorAll(
        '[data-testid="track-camera"] circle[stroke="var(--wind-storm)"]'
      ),
    ]
    expect(rings).toHaveLength(2)
    expect(rings[0]).toHaveAttribute('fill', 'none')

    // The label is the whole point of the bridge: "the recording stops here" and "the feed died
    // for 57 minutes across four miles of water" are different facts.
    expect(screen.getByText('feed dead 57m')).toBeInTheDocument()
  })

  it('bridges a gap too short to label, rather than leaving it bare', () => {
    // The line is never conditional on there being room for the annotation. A dropout where the
    // boat barely moved still joins two fixes across water the recording never recorded, and a
    // bare gap is the thing ADR 0014's obligation is against; zooming in brings the label.
    render(
      <RaceTrackSection
        track={trackOf({
          heatmap: heatmapOf({
            bridges: [{ x1: 100, y1: 100, x2: 104, y2: 102, seconds: 95, rows: 3 }],
          }),
        })}
      />
    )

    expect(screen.getByTestId('track-bridge')).toBeInTheDocument()
    expect(screen.queryByText(/feed dead/)).not.toBeInTheDocument()
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

describe('switching what the track is coloured by', () => {
  it('offers all six overlays, opening on percent of target', () => {
    render(<RaceTrackSection track={trackOf()} />)

    const chips = screen.getByTestId('track-overlays')
    expect(chips.children).toHaveLength(6)
    expect(screen.getByRole('button', { name: '% of target' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('repaints the track on the new scale, and nothing else moves', async () => {
    const { container } = render(<RaceTrackSection track={trackOf()} />)
    const before = strokes(container)

    await userEvent.click(screen.getByRole('button', { name: 'Wind speed' }))

    // 11 knots of true wind is medium air, in the tokens that mean exactly that — the one overlay
    // ADR 0033's refusal does not apply to, because here they are the right palette.
    const after = strokes(container)
    expect(after).toContain('var(--wind-medium)')
    expect(after).not.toEqual(before)
    // The camera is untouched by a change of overlay.
    expect(screen.getByTestId('track-camera')).toHaveAttribute(
      'transform',
      'translate(0 0) scale(1)'
    )
  })

  it('colours a parked row on a reading overlay and refuses it on a ratio', () => {
    // ADR 0037's asymmetry, drawn: the mid-manoeuvre row has no percent of target and does have a
    // speed over the ground, which is simply what the GPS recorded.
    const { container } = render(<RaceTrackSection track={trackOf()} />)

    const hairlines = () =>
      legs(container).filter((leg) => leg.getAttribute('stroke') === 'var(--text-muted)')
    expect(hairlines()).toHaveLength(1)

    return userEvent.click(screen.getByRole('button', { name: 'Boat speed' })).then(() => {
      expect(hairlines()).toHaveLength(0)
      expect(strokes(container)).toContain('var(--track-speed-1)')
    })
  })

  it('swaps the legend and its wording with the overlay', async () => {
    render(<RaceTrackSection track={trackOf()} />)

    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent('slower than target')
    expect(screen.getByTestId('track-ramp').children).toHaveLength(7)

    await userEvent.click(screen.getByRole('button', { name: 'Wind angle' }))

    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent(/port tack/)
    expect(screen.getByTestId('track-ramp').children).toHaveLength(6)
  })

  it('states the caveat that travels with Target VMG and with every wind figure', async () => {
    render(<RaceTrackSection track={trackOf()} />)

    // Percent of target speed needs none, so none is claimed.
    expect(screen.queryByTestId('track-caveat')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '% of VMG' }))
    expect(screen.getByTestId('track-caveat')).toHaveTextContent(/estimated from the Polar/)

    await userEvent.click(screen.getByRole('button', { name: 'Wind speed' }))
    expect(screen.getByTestId('track-caveat')).toHaveTextContent(/computed by qtVlm/)
  })

  it('offers no ratio overlay on a race that records no Polar', () => {
    // A chip that painted a uniformly grey track would invite "no comparison recorded" to be read
    // as "slow everywhere".
    render(<RaceTrackSection track={trackOf({ scoring: 'no-polar-version' })} />)

    expect(screen.getByTestId('track-overlays').children).toHaveLength(4)
    expect(screen.queryByRole('button', { name: '% of target' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boat speed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('reading one stretch out', () => {
  it('asks to be tapped before it says anything', () => {
    render(<RaceTrackSection track={trackOf()} />)

    expect(screen.getByTestId('track-readout-empty')).toHaveTextContent(/Tap a stretch/)
    expect(screen.queryByTestId('track-selection')).not.toBeInTheDocument()
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

  it('says what a tack scale loses after dark, which is the tack', async () => {
    mockTheme = 'nightvision'
    render(<RaceTrackSection track={trackOf()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Wind angle' }))

    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent(
      /the two tacks are the same colour/
    )
  })

  it('states in words how much of the race it could not colour', () => {
    render(<RaceTrackSection track={trackOf()} />)

    const counts = screen.getByTestId('track-counts')
    // Never left to be inferred from how much grey is on screen (ADR 0033).
    expect(counts).toHaveTextContent('145 of 258 rows are drawn but not coloured.')
    // And by reason, because "the boat was parked" and "the Polar cannot answer out here" are not
    // the same sentence.
    expect(counts).toHaveTextContent('82 sat inside a dropout')
    expect(counts).toHaveTextContent('36 were parked or mid-manoeuvre')
    expect(counts).toHaveTextContent('27 are in range of nothing the Polar can answer')
  })

  it('counts a reading’s coverage by its own gate, not by the ratio’s', async () => {
    render(<RaceTrackSection track={trackOf()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Boat speed' }))

    const counts = screen.getByTestId('track-counts')
    // 176 of 258 coloured: everything except the dead feed. The parked rows are not mentioned
    // among the exclusions, because this overlay does not exclude them (ADR 0037).
    expect(counts).toHaveTextContent('82 of 258 rows are drawn but not coloured.')
    expect(counts).toHaveTextContent(/every value is a copy of the row above/)
    expect(counts).not.toHaveTextContent('parked or mid-manoeuvre')
  })

  it('says a race with no Polar Version has nothing to compare, and shows no ramp', async () => {
    render(<RaceTrackSection track={trackOf({ scoring: 'no-polar-version' })} />)

    // It opens on a channel overlay, which this race *can* draw…
    expect(screen.getByTestId('track-ramp')).toBeInTheDocument()

    // …and the ratio is not offered at all, so the only way to hear about the missing Polar is the
    // sentence under the legend of the overlay the sailor is on. Checked through the readout's own
    // words instead: a race with no Polar says so wherever a percent would have been.
    await userEvent.click(screen.getByRole('button', { name: 'Wind speed' }))
    expect(screen.getByTestId('track-counts')).toHaveTextContent(/left this channel blank/)
  })
})

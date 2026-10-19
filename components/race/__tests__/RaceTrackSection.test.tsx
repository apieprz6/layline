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
 * **Every colour is a token.** `.theme-nightvision` redraws every scale in its own long-wavelength
 * palette, and a chart escaping the theme is the one thing `globals.css` forbids — a literal hex
 * here would leave daylight's colours on a red-and-amber screen, which is the mistake the
 * prototype made and kept as a finding.
 *
 * **Each legend keeps its words after dark**, because every scale keeps its daylight meaning then
 * (ADR 0043): the ratio ramp still diverges and the tacks are still two colours.
 *
 * **A ratio and a reading are gated differently** (ADR 0038): the parked row has no percent of
 * target and does have a speed over the ground, and the picture has to show both of those facts.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  RaceTrackHeatmap,
  RaceTrackHeatmapView,
  RaceTrackView,
  TrackBandToken,
  TrackHeatmapTime,
  TrackOverlayTime,
  TrackRowFacts,
} from '@/types'

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
  sail_agreement: 'agrees',
  sail_flown: 'Main + Jib 1',
  sail_recommended: 'Main + Jib 1',
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
  annotations_not_placed: 0,
  overlays: {
    target_speed: { scored: 113, flagged: 31, without_value: 27 },
    target_vmg: { scored: 110, flagged: 31, without_value: 30 },
    sog: { scored: 176, flagged: 0, without_value: 0 },
    tws: { scored: 170, flagged: 0, without_value: 6 },
    twa: { scored: 170, flagged: 0, without_value: 6 },
    sail: { scored: 120, flagged: 0, without_value: 38 },
  },
}

/** One overlay's time: a single band carrying what it coloured, and its uncoloured parts. */
function overlayTime(
  band: TrackBandToken,
  coloured: number,
  filler: number,
  uncoloured: TrackOverlayTime['uncoloured']
): TrackOverlayTime {
  return {
    bands: [{ band, seconds: coloured, filler_anchored_seconds: filler }],
    coloured_seconds: coloured,
    filler_anchored_seconds: filler,
    uncoloured_seconds: uncoloured.reduce((total, part) => total + part.seconds, 0),
    uncoloured,
  }
}

/**
 * Three hours of window, as the legend states it: an hour of dropout, half an hour parked or
 * mid-manoeuvre, five minutes before the recording began. Each overlay adds up to the window.
 */
const RATIO_TIME = overlayTime('track-at', 4200, 1200, [
  { reason: 'frozen', seconds: 3600 },
  { reason: 'low_speed', seconds: 1200 },
  { reason: 'no_target', seconds: 900 },
  { reason: 'maneuver_window', seconds: 600 },
  { reason: 'before_first_row', seconds: 300 },
])
const READING_TIME = overlayTime('track-speed-4', 6900, 0, [
  { reason: 'frozen', seconds: 3600 },
  { reason: 'before_first_row', seconds: 300 },
])
const TIME: TrackHeatmapTime = {
  window_seconds: 10800,
  overlays: {
    target_speed: RATIO_TIME,
    target_vmg: RATIO_TIME,
    sog: READING_TIME,
    tws: READING_TIME,
    twa: READING_TIME,
    sail: overlayTime('track-agree', 3000, 0, [
      { reason: 'frozen', seconds: 3600 },
      { reason: 'no_sail_recorded', seconds: 2100 },
      { reason: 'low_speed', seconds: 1200 },
      { reason: 'maneuver_window', seconds: 600 },
      { reason: 'before_first_row', seconds: 300 },
    ]),
  },
}

function heatmapOf(over: Partial<RaceTrackHeatmapView> = {}): RaceTrackHeatmapView {
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
    bridges: [
      { x1: 120, y1: 140, x2: 300, y2: 320, seconds: 3436, from: '2026-06-20T16:05:00', to: '2026-06-20T17:02:16', rows: 2 },
    ],
    rings: [
      { cx: 120, cy: 140 },
      { cx: 120, cy: 140 },
    ],
    // What the sailor said, where they said it happened: a sail change and a sea state.
    annotations: [
      { x: 40, y: 40, lane: 'sail', label: 'Main + A2', at: '2026-06-20T16:04:30', gap_seconds: 0, dy: 0 },
      // Recorded seconds after the sail change, so it lands on the same fix and is lifted clear.
      { x: 40, y: 40, lane: 'sea', label: 'Moderate', at: '2026-06-20T16:04:40', gap_seconds: 10, dy: -19 },
    ],
    unplaced_annotations: [],
    counts: COUNTS,
    time: TIME,
    ...over,
  }
}

function trackOf(over: Partial<RaceTrackView> = {}): RaceTrackView {
  return { heatmap: heatmapOf(), scoring: 'polar', plot: null, ...over }
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
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

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
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

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
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

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
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    // A run of one cannot be a polyline, and the boat was there. Chicago–Waukegan's window really
    // holds two of these (see `archive-track-heatmap.test.ts`).
    const point = container.querySelector(
      '[data-testid="track-camera"] circle[fill="var(--track-below-3)"]'
    )
    expect(point).toHaveAttribute('cx', '300')
  })

  it('draws what the sailor said, in a treatment no overlay’s scale uses', () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    // Testimony is neither measured nor computed, and on a screen where six scales spend every hue
    // the design system has, the only honest way to say "a different kind of thing" is to stop
    // using hue for it (ADR 0008's Provenance, ADR 0038).
    const sail = screen.getByTestId('track-testimony-sail')
    expect(sail).toBeInTheDocument()
    expect(sail.querySelector('circle')).toHaveAttribute('fill', 'var(--surface-raised)')
    expect(sail).toHaveTextContent('S')
    expect(sail).toHaveTextContent('Main + A2')

    // The amend flow's own two glyphs, because it is the same Testimony on both screens.
    expect(screen.getByTestId('track-testimony-sea')).toHaveTextContent('~')

    // And it is drawn *over* the measurement: a sail change hidden under a 5.4-unit track tells
    // nobody anything.
    const camera = container.querySelector('[data-testid="track-camera"]')
    const children = [...(camera?.children ?? [])]
    const lastLeg = children.findIndex((node) => node.tagName === 'polyline')
    const firstMarker = children.findIndex(
      (node) => node.getAttribute('data-testid') === 'track-testimony-sail'
    )
    expect(firstMarker).toBeGreaterThan(lastLeg)
  })

  it('says in the legend that the markers are Testimony, with the count', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    expect(screen.getByText(/What the sailor said — 2 notes/)).toBeInTheDocument()
  })

  it('says when an annotation was given about a time the track cannot place', () => {
    render(
      <RaceTrackSection
        season={null}
        track={trackOf({
          heatmap: heatmapOf({
            unplaced_annotations: [{ lane: 'sea', label: 'Choppy', at: '2026-06-20T19:30:00' }],
          }),
        })}
      />
    )

    expect(screen.getByText(/1 unplaceable/)).toBeInTheDocument()
  })

  it('draws no Testimony row where nobody wrote anything down', () => {
    render(<RaceTrackSection season={null} track={trackOf({ heatmap: heatmapOf({ annotations: [] }) })} />)

    expect(screen.queryByTestId('track-testimony-sail')).not.toBeInTheDocument()
    expect(screen.queryByText(/What the sailor said/)).not.toBeInTheDocument()
  })

  it('names a token for every colour, so the night-vision theme stays in charge', () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    const svg = container.querySelector('svg')?.outerHTML ?? ''
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i)
  })

  it('rings a frozen run and bridges it with its own duration', () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

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
        season={null}
        track={trackOf({
          heatmap: heatmapOf({
            bridges: [
              { x1: 100, y1: 100, x2: 104, y2: 102, seconds: 95, from: '2026-06-20T16:05:00', to: '2026-06-20T16:06:35', rows: 3 },
            ],
          }),
        })}
      />
    )

    expect(screen.getByTestId('track-bridge')).toBeInTheDocument()
    expect(screen.queryByText(/feed dead/)).not.toBeInTheDocument()
  })

  it('keeps every stroke the width it was drawn at, however far the sailor zooms', () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    // Zooming in separates the segments; it does not fatten them. Without this the track becomes
    // one blue band at 12× and the heatmap stops being readable exactly where it is being read.
    expect(
      legs(container).every((leg) => leg.getAttribute('vector-effect') === 'non-scaling-stroke')
    ).toBe(true)
  })

  it('starts showing the whole track, with only zoom-in offered', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

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
    render(<RaceTrackSection season={null} track={trackOf()} />)

    // 360 units at 5 m per unit: a fifth of the box is 360m, 1-2-5-rounded to 200.
    expect(screen.getByTestId('track-scale-bar')).toHaveTextContent('200 m')
  })

  it('says there is no track where the recording logged no position', () => {
    render(<RaceTrackSection season={null} track={trackOf({ heatmap: null })} />)

    // A real case in the archive. An empty frame explains nothing, so the words go where the map
    // would be.
    expect(screen.getByTestId('track-no-fixes')).toHaveTextContent(/No position was logged/)
    expect(screen.queryByTestId('track-camera')).not.toBeInTheDocument()
  })
})

describe('switching what the track is coloured by', () => {
  it('paints sail agreement apart from a difference, and says a difference is not a fault', async () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sail vs chart' }))

    // The fixture's rows agree, bar the parked one, which this overlay cannot read either — it is
    // gated like a performance metric, because a manoeuvre's TWA sweeps through head to wind.
    expect(strokes(container)).toContain('var(--track-agree)')
    // The headline count is one line; "a difference and not a fault" is said where the colours
    // are explained — on the ramp's own line — and again in the detail behind the disclosure.
    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent(
      /agreed with the chart · differed — a difference, not a fault/
    )
    expect(screen.getByTestId('track-counts-why')).toHaveTextContent(/a difference and not a fault/)
  })

  it('says which of the four ways a row has no sail verdict, in the readout’s words', async () => {
    render(
      <RaceTrackSection
        season={null}
        track={trackOf({
          heatmap: heatmapOf({
            segments: [
              {
                points: '10.0,10.0 40.0,40.0',
                x1: 10,
                y1: 10,
                x2: 40,
                y2: 40,
                row: { ...ON_THE_PACE, sail_agreement: 'sail_unnamed', sail_recommended: null },
              },
            ],
          }),
        })}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Sail vs chart' }))

    // Not a dash: a sail the chart cannot name is a different fact from a chart that cannot answer.
    expect(screen.getByTestId('track-counts-why')).toHaveTextContent(/a sail the chart does not name/)
  })

  it('offers all six overlays, opening on percent of target', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    const chips = screen.getByTestId('track-overlays')
    expect(chips.children).toHaveLength(6)
    expect(screen.getByRole('button', { name: '% of target' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // Course is gone: a cyclic quantity drawn as quadrants was coarse, and the owner did not want
    // it. `COG` is still a figure in the readout, where it costs nothing and reads honestly.
    expect(screen.queryByRole('button', { name: 'Course' })).not.toBeInTheDocument()
  })

  it('repaints the track on the new scale, and nothing else moves', async () => {
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)
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
    // ADR 0038's asymmetry, drawn: the mid-manoeuvre row has no percent of target and does have a
    // speed over the ground, which is simply what the GPS recorded.
    const { container } = render(<RaceTrackSection season={null} track={trackOf()} />)

    const hairlines = () =>
      legs(container).filter((leg) => leg.getAttribute('stroke') === 'var(--text-muted)')
    expect(hairlines()).toHaveLength(1)

    return userEvent.click(screen.getByRole('button', { name: 'Boat speed' })).then(() => {
      expect(hairlines()).toHaveLength(0)
      expect(strokes(container)).toContain('var(--track-speed-1)')
    })
  })

  it('swaps the legend and its wording with the overlay', async () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent('slower than target')
    expect(screen.getByTestId('track-ramp').children).toHaveLength(7)

    await userEvent.click(screen.getByRole('button', { name: 'Wind angle' }))

    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent(/port · close-hauled/)
    expect(screen.getByTestId('track-ramp').children).toHaveLength(6)
  })

  it('states the caveat that travels with Target VMG and with every wind figure', async () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    // Percent of target speed needs none, so none is claimed.
    expect(screen.queryByTestId('track-caveat')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '% of VMG' }))
    expect(screen.getByTestId('track-caveat')).toHaveTextContent(/estimated from the grid/)

    await userEvent.click(screen.getByRole('button', { name: 'Wind speed' }))
    expect(screen.getByTestId('track-caveat')).toHaveTextContent(/computed by qtVlm/)
  })

  it('offers no ratio overlay on a race that records no Polar', () => {
    // A chip that painted a uniformly grey track would invite "no comparison recorded" to be read
    // as "slow everywhere".
    render(<RaceTrackSection season={null} track={trackOf({ scoring: 'no-polar-version' })} />)

    expect(screen.getByTestId('track-overlays').children).toHaveLength(4)
    expect(screen.queryByRole('button', { name: '% of target' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boat speed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('reading one stretch out', () => {
  it('says nothing, and asks for a tap on the map’s own line, until there is something to say', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    // The readout is a card *over* the map now, so there is no empty state to fill the page with:
    // the invitation lives on the frame's own line, and the card appears when a stretch is tapped.
    expect(screen.queryByTestId('track-readout')).not.toBeInTheDocument()
    expect(screen.queryByTestId('track-selection')).not.toBeInTheDocument()
    expect(screen.getByTestId('track-zoom-readout')).toHaveTextContent(/tap a stretch to read it/)
  })
})

describe('the legend beneath it', () => {
  it('reads as a polarity by day, which is what the diverging ramp is for', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    const wording = screen.getByTestId('track-ramp-wording')
    expect(wording).toHaveTextContent('slower than target')
    expect(wording).toHaveTextContent('100%')
    expect(wording).toHaveTextContent('faster')
  })

  it('keeps the daylight sentence after dark, because every scale keeps its meaning', async () => {
    // The ramp still diverges and the tacks are still two colours (ADR 0043), so a side and a tack
    // are as true at night as by day — there is no after-dark sentence to swap in.
    mockTheme = 'nightvision'
    render(<RaceTrackSection season={null} track={trackOf()} />)

    const wording = screen.getByTestId('track-ramp-wording')
    expect(wording).toHaveTextContent('slower than target · 100% · faster')

    await userEvent.click(screen.getByRole('button', { name: 'Wind angle' }))
    expect(screen.getByTestId('track-ramp-wording')).toHaveTextContent(
      'port · close-hauled · starboard; depth is how far off the wind'
    )
  })

  it('states in words how much of the race it could not colour', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    // The proportion is stated rather than inferred from how much grey is on screen (ADR 0033),
    // and it is one line, because a line nobody reads states nothing.
    // In time, never rows (ADR 0037): a row is thirty seconds on a beat and minutes in a dropout.
    expect(screen.getByTestId('track-counts')).toHaveTextContent(
      '1h 50m of the 3h window carries no colour on this overlay.'
    )

    // The reasons are a tap down, because "the boat was parked" and "the Polar cannot answer out
    // here" are different facts and the argument for each is longer than the claim.
    const why = screen.getByTestId('track-counts-why')
    expect(why).toHaveTextContent('1h sat inside a dropout')
    expect(why).toHaveTextContent('30m was parked or mid-manoeuvre')
    expect(why).toHaveTextContent('15m is in range of nothing the Polar can answer')
    expect(why).toHaveTextContent('5m of the window lies outside the recording')
  })

  it('states each swatch’s share of the track in time, never in rows', () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    // What is drawn and uncoloured is the window less its unrecorded edges.
    expect(screen.getByText('Drawn, not coloured — 1h 45m')).toBeInTheDocument()
    expect(screen.getByText('Filler-anchored — 20m')).toBeInTheDocument()
    expect(screen.getByText('Frozen feed — 1h')).toBeInTheDocument()

    for (const said of [
      screen.getByTestId('track-counts'),
      screen.getByTestId('track-counts-why'),
      ...screen.getAllByRole('listitem'),
    ]) {
      expect(said).not.toHaveTextContent(/\brows?\b/)
    }
  })

  it('counts a reading’s coverage by its own gate, not by the ratio’s', async () => {
    render(<RaceTrackSection season={null} track={trackOf()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Boat speed' }))

    expect(screen.getByTestId('track-counts')).toHaveTextContent(
      '1h 5m of the 3h window carries no colour on this overlay.'
    )
    // Coloured everywhere except the dead feed and the unrecorded edge. The detail says *why* a parked row
    // keeps its colour here, rather than listing it among the exclusions (ADR 0038).
    const why = screen.getByTestId('track-counts-why')
    expect(why).toHaveTextContent(/every value is a copy of the reading before it/)
    expect(why).toHaveTextContent(/Parked or mid-manoeuvre sailing keeps its colour here/)
  })

  it('says a race with no Polar Version has nothing to compare, and shows no ramp', async () => {
    render(<RaceTrackSection season={null} track={trackOf({ scoring: 'no-polar-version' })} />)

    // It opens on a channel overlay, which this race *can* draw…
    expect(screen.getByTestId('track-ramp')).toBeInTheDocument()

    // …and the ratio is not offered at all, so the missing Polar is said by whichever overlay the
    // sailor is on, in its own detail.
    await userEvent.click(screen.getByRole('button', { name: 'Wind speed' }))
    expect(screen.getByTestId('track-counts-why')).toHaveTextContent(/left this channel blank/)
  })
})

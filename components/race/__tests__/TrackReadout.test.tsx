/**
 * One stretch of track, read out — what the map answers once the sailor taps it.
 *
 * Three rules carry this suite, and each is a repo rule rather than a preference:
 *
 * **Provenance travels with every figure** (ADR 0008). `SOG` and `COG` are the GPS's own answer;
 * every wind figure was computed by qtVlm from a solved current and an instrument altitude the
 * export does not carry. A panel of numbers with no provenance is the thing this project's founding
 * principle is against, and it costs one line to avoid.
 *
 * **A missing figure says which kind of missing it is.** Four different facts produce "no percent
 * of target" — excluded by one of ADR 0025's three, or the Polar off its axis, or no Polar
 * recorded at all — and a dash would make them one shrug.
 *
 * **A flagged figure is shown flagged, not withheld** (ADR 0036). A sailed row is real however weak
 * the cell it was compared against.
 */

import { render, screen } from '@testing-library/react'
import type { TrackRowFacts } from '@/types'

import TrackReadout from '../TrackReadout'

function facts(over: Partial<TrackRowFacts> = {}): TrackRowFacts {
  return {
    row_index: 7,
    row_time: '2026-06-20T16:04:30',
    sog: 6.9,
    tws: 11,
    twa: -48,
    cog: 212,
    target_speed: 6.5,
    polar_efficiency: 6.9 / 6.5,
    target_vmg: 4.6,
    vmg_efficiency: 1.04,
    filler_anchored: false,
    excluded: null,
    ...over,
  }
}

describe('a stretch nobody has tapped yet', () => {
  it('asks to be tapped, in the treatment that is not a value', () => {
    render(<TrackReadout row={null} overlay="target_speed" scoring="polar" />)

    expect(screen.getByTestId('track-readout-empty')).toHaveTextContent(/Tap a stretch/)
    expect(screen.queryByTestId('track-readout')).not.toBeInTheDocument()
  })
})

describe('a stretch the boat sailed', () => {
  it('leads with the overlay the sailor is looking at, and says the row’s own clock', () => {
    render(<TrackReadout row={facts()} overlay="target_speed" scoring="polar" />)

    expect(screen.getByTestId('track-readout-headline')).toHaveTextContent(
      '106% of target speed'
    )
    // The recording's own naive stamp, with no timezone applied in either direction (ADR 0008).
    expect(screen.getByTestId('track-readout')).toHaveTextContent('16:04')
  })

  it('leads with a different figure on a different overlay, from the same row', () => {
    render(<TrackReadout row={facts()} overlay="twa" scoring="polar" />)

    // Signed as the recording wrote it: negative is port (ADR 0008), and the readout says which
    // rather than leaving a sailor to remember the sign convention.
    // A plain hyphen, because this is the number the recording's own sign convention produced and
    // the ramp's own ticks are written the same way.
    expect(screen.getByTestId('track-readout-headline')).toHaveTextContent('-48° true wind angle')
    expect(screen.getByTestId('track-readout-headline')).toHaveTextContent('port tack')
  })

  it('states every channel beside it, whichever overlay is chosen', () => {
    render(<TrackReadout row={facts()} overlay="sog" scoring="polar" />)

    const panel = screen.getByTestId('track-readout')
    expect(panel).toHaveTextContent('6.90 kt')
    expect(panel).toHaveTextContent('6.50 kt')
    expect(panel).toHaveTextContent('106%')
    expect(panel).toHaveTextContent('11.00 kt')
    expect(panel).toHaveTextContent('212°')
  })

  it('says where each figure came from, because a number with no provenance is not data', () => {
    render(<TrackReadout row={facts()} overlay="sog" scoring="polar" />)

    const panel = screen.getByTestId('track-readout')
    expect(panel).toHaveTextContent(/GPS’s own figures/)
    expect(panel).toHaveTextContent(/computed by qtVlm/)
    expect(panel).toHaveTextContent(/not the certificate’s published optimum/)
  })

  it('shows a Filler-Anchored figure, flagged, rather than withholding it', () => {
    render(<TrackReadout row={facts({ filler_anchored: true })} overlay="target_speed" scoring="polar" />)

    expect(screen.getByTestId('track-readout-headline')).toHaveTextContent('106%')
    expect(screen.getByTestId('track-readout-headline')).toHaveTextContent('filler-anchored')
  })

  it('does not flag a reading, because the flag is a property of a comparison', () => {
    render(<TrackReadout row={facts({ filler_anchored: true })} overlay="sog" scoring="polar" />)

    expect(screen.getByTestId('track-readout-headline')).not.toHaveTextContent('filler-anchored')
  })
})

describe('a stretch with no figure on this overlay', () => {
  it('says the boat was parked rather than showing a dash', () => {
    render(<TrackReadout row={facts({ excluded: 'low_speed' })} overlay="target_speed" scoring="polar" />)

    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(/below the speed gate/)
    expect(screen.queryByTestId('track-readout-headline')).not.toBeInTheDocument()
  })

  it('says it was mid-manoeuvre, which is a different fact', () => {
    render(
      <TrackReadout row={facts({ excluded: 'maneuver_window' })} overlay="target_speed" scoring="polar" />
    )

    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(/manoeuvre window/)
  })

  it('says the feed was dead, and that every value on the row is a copy', () => {
    render(<TrackReadout row={facts({ excluded: 'frozen' })} overlay="sog" scoring="polar" />)

    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(/copy of the row above/)
  })

  it('tells a Polar that cannot answer apart from a race that records none', () => {
    const { unmount } = render(
      <TrackReadout row={facts({ polar_efficiency: null })} overlay="target_speed" scoring="polar" />
    )
    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(
      /no answer at this angle and wind speed/
    )
    unmount()

    render(<TrackReadout row={facts()} overlay="target_speed" scoring="no-polar-version" />)
    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(/records no Polar Version/)
  })

  it('says a blank channel is blank, on a reading overlay', () => {
    render(<TrackReadout row={facts({ tws: null })} overlay="tws" scoring="polar" />)

    expect(screen.getByTestId('track-readout-why')).toHaveTextContent(/left this channel blank/)
    // And the dash in the list below is only ever absence of a value, never absence of a reason.
    expect(screen.getByTestId('track-readout')).toHaveTextContent('—')
  })
})

import { render, screen } from '@testing-library/react'
import InstrumentTuningTeaser from '@/components/analysis/InstrumentTuningTeaser'
import {
  asymmetrySeason,
  headingEra,
  raceDivergence,
  raceHeading,
  raceBins,
  speedEra,
  speedPoints,
  speedSeason,
  tuningSeason,
} from '@/components/boat/instrument-tuning/__tests__/fixtures'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import type { InstrumentTuningRead } from '@/services/analysis/readInstrumentTuning'

/**
 * The Overall tab's **Instrument tuning** row: three channels, each with its figure, what that
 * figure rests on, and a bar for how far that is from `solid`.
 *
 * The shape is LAY-149 variant D's per-Race tile, which the owner chose for this row over ADR
 * 0035's single word. What is pinned here is that the three figures are the ones ADR 0035 settled
 * and **not** the three the prototype printed — the prototype's `HDG` mean hides a ±10°
 * heading-dependent curve, and its single `AWA` mean states the opposite of a finding that leans
 * opposite ways upwind and downwind.
 *
 * Then ADR 0012, which the prototype's `—` breaks and this may not: every absence is words. A
 * channel that produced no figure says so and draws no bar, a point of sail that paired no tacks
 * says so on its own line, and an archive that could not be read gets no figures at all.
 *
 * The cut-points are `coverage-verdict.ts`'s and are asserted there. What these fixtures choose is
 * which side of them each channel lands on.
 */

const DAY = '2026-06-03 18:00:00'

/** The read, over a season every channel of which reads `SOLID` until a test moves one. */
function read(over: Partial<InstrumentTuningSeason> = {}): InstrumentTuningRead {
  return { ok: true, season: tuningSeason(over), log: [], races: [] }
}

const row = () => screen.getByTestId('instrument-tuning-teaser')
const word = () => screen.getByTestId('tuning-coverage')
const figures = (channel: string) =>
  document.querySelector(`[data-testid="tuning-figures"][data-channel="${channel}"]`)!
const reason = (channel: string) =>
  document.querySelector(`[data-testid="tuning-reason"][data-channel="${channel}"]`)!
const bar = (channel: string) =>
  document.querySelector(`[data-testid="coverage-bar"][data-channel="${channel}"]`)

describe('the three channels, side by side', () => {
  it('names each channel the way the card a tap opens is titled', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    const names = screen.getAllByTestId('tuning-channel').map((node) => node.textContent)
    // In the causal order the screen reads them in: HDG → AWA → STW.
    expect(names).toEqual(['Compass', 'Wind angle, tack to tack', 'Boat speed'])
  })

  it('leads the compass with the swing, not the mean the prototype printed', () => {
    render(
      <InstrumentTuningTeaser
        read={read({
          heading: [
            headingEra([
              raceHeading('race-1', DAY, raceBins({ 1: { mean: 12.7, rows: 40 } })),
              raceHeading('race-2', DAY, raceBins({ 20: { mean: -8.9, rows: 40 } })),
            ]),
          ],
        })}
      />
    )

    // 12.7 − (−8.9). The era mean of that curve is +1.9°, a figure matching no heading the compass
    // actually shows, which is why ADR 0035 leads with the spread instead.
    expect(figures('HDG')).toHaveTextContent('21.6° swing')
    expect(row().textContent).not.toMatch(/1\.9°/)
  })

  it('states both points of sail, each saying which tack reads wider', () => {
    render(<InstrumentTuningTeaser read={read({ asymmetry: asymmetrySeason(12, 10) })} />)

    // The fixture holds starboard 40° / port 46° upwind and starboard 150° / port 140° downwind —
    // the two leaning opposite ways, which a single mean of them would erase.
    expect(figures('AWA')).toHaveTextContent('up')
    expect(figures('AWA')).toHaveTextContent('port 6.0°')
    expect(figures('AWA')).toHaveTextContent('down')
    expect(figures('AWA')).toHaveTextContent('stbd 10.0°')
  })

  it('gives boat speed the line’s gap at 4 kt and at 8 kt, and no slope', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    // The fixture's line runs (2, 2.3) → (9, 9.1), so it sits +0.24 kt off 1:1 at 4 kt and +0.14 at
    // 8 — a gap that narrows, which one scalar could not say.
    expect(figures('STW')).toHaveTextContent('4 kt')
    expect(figures('STW')).toHaveTextContent('+0.24 kt')
    expect(figures('STW')).toHaveTextContent('8 kt')
    expect(figures('STW')).toHaveTextContent('+0.13 kt')
    // A slope or an intercept is a drafted correction however it is labelled (ADR 0027).
    expect(row().textContent).not.toMatch(/slope|intercept|multiplier|R²/i)
  })

  it('prints what each figure rests on, in the coverage verdict’s own words', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(reason('HDG')).toHaveTextContent('24 of 36 headings rest on two or more Races')
    expect(reason('AWA')).toHaveTextContent('10 Tack Pairs downwind, against 12 upwind')
    expect(reason('STW')).toHaveTextContent('9 of 10 Races carry a line of their own')
  })
})

describe('the bars', () => {
  it('draw how close each channel is to solid, so a full bar means one thing in all three', () => {
    // The default season's compass is two thirds covered, which is exactly the `SOLID` share.
    render(
      <InstrumentTuningTeaser
        read={read({ asymmetry: asymmetrySeason(12, 5), speed: speedSeason(10, 5) })}
      />
    )

    // 24/36 ÷ ⅔ = 1: at the cut, the bar is full.
    expect(bar('HDG')).toHaveAttribute('data-share', '1.00')
    // The weaker side's 5 pairs against the 10 that read `SOLID`.
    expect(bar('AWA')).toHaveAttribute('data-share', '0.50')
    // Half the Races carry a line, which is three quarters of the way to the two-thirds cut.
    expect(bar('STW')).toHaveAttribute('data-share', '0.75')
  })

  it('never draw past full, so a well-covered channel cannot run off the end', () => {
    render(<InstrumentTuningTeaser read={read({ asymmetry: asymmetrySeason(40, 40) })} />)

    expect(bar('AWA')).toHaveAttribute('data-share', '1.00')
  })
})

describe('the coverage word under them', () => {
  it('is the worst of the three, lowercased', () => {
    render(<InstrumentTuningTeaser read={read({ speed: speedSeason(10, 2) })} />)

    expect(word().textContent).toBe('anecdotal')
    expect(row()).toHaveTextContent('Coverage is anecdotal at its thinnest')
  })

  it('says solid only when every channel does', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(word().textContent).toBe('solid')
  })

  it('carries no count of channels, and no verdict on any instrument', () => {
    render(<InstrumentTuningTeaser read={read({ speed: speedSeason(10, 2) })} />)

    // ADR 0035 retired `2 of 3 off band`: a bare number beside "instrument tuning" reads as a
    // severity score whatever word sits next to it, and coverage is not a severity.
    expect(row().textContent).not.toMatch(/off band|\bof 3\b|worth watching/i)
    // And nothing here says an instrument is wrong — coverage is about the evidence.
    expect(row().textContent).not.toMatch(/wrong|error|off by|adjust|should read/i)
  })

  it('taps through to the screen the charts live on', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(row()).toHaveAttribute('href', '/boat-performance/instrument-tuning')
  })
})

describe('a channel that produced no figure', () => {
  it('says the compass has no reading yet, and draws no bar for it', () => {
    render(<InstrumentTuningTeaser read={read({ heading: [] })} />)

    expect(figures('HDG')).toHaveTextContent('No Race has produced a compass reading yet.')
    // A bar is a drawing of how much a figure rests on; there is no figure to rest.
    expect(bar('HDG')).toBeNull()
    // The other two still say what they found.
    expect(bar('STW')).not.toBeNull()
  })

  it('tells an Era with no readable heading apart from an Era with no Races', () => {
    render(
      <InstrumentTuningTeaser read={read({ heading: [headingEra([], { race_count: 4 })] })} />
    )

    expect(figures('HDG')).toHaveTextContent('No heading carries a figure yet.')
    expect(reason('HDG')).toHaveTextContent('0 of 36 headings rest on two or more Races')
  })

  it('says which point of sail paired no tacks, rather than letting the other stand alone', () => {
    render(<InstrumentTuningTeaser read={read({ asymmetry: asymmetrySeason(18, 0) })} />)

    expect(figures('AWA')).toHaveTextContent('port 6.0°')
    expect(figures('AWA')).toHaveTextContent('no pairs')
    expect(reason('AWA')).toHaveTextContent('no Tack Pair downwind, against 18 upwind')
    // The check that separates a vane set off-centre from everything else is the comparison
    // between the two sides, so an unpaired side is nought of the way to solid.
    expect(bar('AWA')).toHaveAttribute('data-share', '0.00')
  })

  it('says no Tack Pair at all, where neither side paired any', () => {
    render(<InstrumentTuningTeaser read={read({ asymmetry: asymmetrySeason(0, 0) })} />)

    expect(figures('AWA')).toHaveTextContent('No Tack Pair has been found yet.')
    expect(bar('AWA')).toBeNull()
  })

  it('says why boat speed has no line, where the Era could not be fitted', () => {
    const unfittable = speedEra([raceDivergence('race-1', DAY, speedPoints(2, 0.3))], {
      fit: { fitted: false, reason: 'too-few-points' },
      races_with_a_line: 0,
    })

    render(
      <InstrumentTuningTeaser
        read={read({ speed: { orthogonal: [unfittable], 'sog-on-stw': [unfittable] } })}
      />
    )

    // The gate in the chart's own words, so the row and the chart cannot word it differently.
    expect(figures('STW')).toHaveTextContent(
      'No season line yet — fewer than 5 rows carrying both speeds.'
    )
    // Coverage is still a real figure here: the Races are in the Era, none carries a line.
    expect(bar('STW')).toHaveAttribute('data-share', '0.00')
  })

  it('says no Race has produced a speed comparison yet, where the Era is missing', () => {
    render(<InstrumentTuningTeaser read={read({ speed: { orthogonal: [], 'sog-on-stw': [] } })} />)

    expect(figures('STW')).toHaveTextContent('No Race has produced a speed comparison yet.')
    expect(bar('STW')).toBeNull()
  })

  it('never prints a dash or a bare nought in place of a figure', () => {
    render(
      <InstrumentTuningTeaser
        read={read({ heading: [], asymmetry: asymmetrySeason(0, 0), speed: speedSeason(0, 0) })}
      />
    )

    // The prototype's tile printed `—` for each of these three. That is the one thing from its
    // shape that cannot ship (ADR 0012).
    expect(row().textContent).not.toMatch(/—|–/)
    expect(screen.queryAllByTestId('coverage-bar')).toHaveLength(0)
  })
})

describe('an archive with no season to read', () => {
  it('says it could not be read, and draws no figures over part of it', () => {
    render(<InstrumentTuningTeaser read={{ ok: false, reason: 'unreadable' }} />)

    expect(row()).toHaveTextContent('The archive could not be read.')
    expect(row()).toHaveTextContent('Nothing is shown rather than figures measured over part of it')
    // The read is all-or-nothing on purpose: a season over the Races that happened to load would
    // present as a complete season, and every figure on it would be a claim about other evidence.
    expect(screen.queryByTestId('tuning-coverage')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('tuning-channel')).toHaveLength(0)
    expect(row().textContent).not.toMatch(/\b(solid|thin|anecdotal)\b/i)
  })

  it('says nothing has been uploaded yet, which is not a failure', () => {
    render(<InstrumentTuningTeaser read={{ ok: false, reason: 'no-races' }} />)

    expect(row()).toHaveTextContent('No race has been uploaded yet.')
    expect(screen.queryByTestId('tuning-coverage')).not.toBeInTheDocument()
  })
})

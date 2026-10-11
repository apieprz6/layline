import { render, screen } from '@testing-library/react'
import InstrumentTuningTeaser from '@/components/analysis/InstrumentTuningTeaser'
import {
  asymmetrySeason,
  headingEra,
  speedSeason,
  tuningSeason,
} from '@/components/boat/instrument-tuning/__tests__/fixtures'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import type { InstrumentTuningRead } from '@/services/analysis/readInstrumentTuning'

/**
 * The Overall tab's **Instrument tuning** row: one coverage word, and the channel that earned it.
 *
 * What is pinned here is ADR 0035's decision and the two things it forbids. The word is the
 * **worst** of the three channels' own verdicts — so a season with one `ANECDOTAL` channel says
 * `anecdotal`, whatever the other two manage — and it arrives with **no count**: `2 of 3` beside
 * "instrument tuning" reads as a severity score, and low coverage is not a severity.
 *
 * The rest is ADR 0012 applied to a row. A channel that produced no figure is named in words, and
 * an archive that could not be read gets no coverage word at all: that read is deliberately
 * all-or-nothing, since a season computed over the Races that happened to load would present as a
 * complete season.
 *
 * The cut-points themselves are `coverage-verdict.ts`'s and are asserted there. What these
 * fixtures choose is which side of them each channel lands on.
 */

/** The read, over a season every channel of which reads `SOLID` until a test moves one. */
function read(over: Partial<InstrumentTuningSeason> = {}): InstrumentTuningRead {
  return { ok: true, season: tuningSeason(over), log: [], races: [] }
}

const row = () => screen.getByTestId('instrument-tuning-teaser')
const word = () => screen.getByTestId('tuning-coverage')

describe('the coverage word', () => {
  it('is the worst of the three channels, with the reason that earned it', () => {
    render(<InstrumentTuningTeaser read={read({ speed: speedSeason(10, 5) })} />)

    expect(word()).toHaveTextContent('thin')
    expect(row()).toHaveTextContent('coverage, at the thinnest of the three checks')
    // Never the word alone: a verdict with no reason beside it is a grade, and this grades nothing.
    expect(row()).toHaveTextContent('Boat speed: 5 of 10 Races carry a line of their own')
  })

  it('reads anecdotal over a thin and a solid channel, rather than averaging the three', () => {
    render(
      <InstrumentTuningTeaser
        read={read({
          heading: [headingEra([], { headings_on_two_or_more_races: 11 })],
          asymmetry: asymmetrySeason(9, 5),
        })}
      />
    )

    expect(word()).toHaveTextContent('anecdotal')
    expect(row()).toHaveTextContent('Compass: 11 of 36 headings rest on two or more Races')
  })

  it('says solid only when every channel does', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(word()).toHaveTextContent('solid')
    expect(row()).toHaveTextContent('Compass: 24 of 36 headings rest on two or more Races')
  })

  it('is lowercased, the uppercase word being a chart’s', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(word().textContent).toBe('solid')
  })

  it('gives a tie to the first channel in the causal order the screen reads in', () => {
    render(
      <InstrumentTuningTeaser
        read={read({
          heading: [headingEra([], { headings_on_two_or_more_races: 12 })],
          asymmetry: asymmetrySeason(9, 5),
        })}
      />
    )

    // Both the compass and the Asymmetry read `THIN`. The compass is named, because `HDG` is where
    // the screen starts and where its deviation propagates from.
    expect(word()).toHaveTextContent('thin')
    expect(row()).toHaveTextContent('Compass: 12 of 36 headings')
  })

  it('carries no count of channels, and no verdict on any instrument', () => {
    render(
      <InstrumentTuningTeaser
        read={read({ heading: [headingEra([], { headings_on_two_or_more_races: 2 })] })}
      />
    )

    // ADR 0035 retired `2 of 3 off band`: a bare number beside "instrument tuning" reads as a
    // severity score whatever word sits next to it, and coverage is not a severity.
    expect(row().textContent).not.toMatch(/off band|\bof 3\b|worth watching/i)
    // And nothing here says an instrument is wrong — `anecdotal` is about the evidence.
    expect(row().textContent).not.toMatch(/wrong|error|off by|adjust|should read/i)
  })

  it('taps through to the screen the charts live on', () => {
    render(<InstrumentTuningTeaser read={read()} />)

    expect(row()).toHaveAttribute('href', '/boat-performance/instrument-tuning')
  })
})

describe('a channel that produced no figure', () => {
  it('says the compass has no reading yet, rather than a word over nothing', () => {
    render(<InstrumentTuningTeaser read={read({ heading: [] })} />)

    expect(word()).toHaveTextContent('anecdotal')
    expect(row()).toHaveTextContent('Compass: no Race has produced a compass reading yet')
    // Not a dash and not a nought: the absence is the finding (ADR 0012).
    expect(row().textContent).not.toMatch(/—|\b0\b/)
  })

  it('says no Tack Pair was found at either point of sail', () => {
    render(<InstrumentTuningTeaser read={read({ asymmetry: asymmetrySeason(0, 0) })} />)

    expect(word()).toHaveTextContent('anecdotal')
    expect(row()).toHaveTextContent(
      'Wind angle, tack to tack: no Tack Pair at either point of sail'
    )
  })

  it('says no Race has produced a speed comparison yet', () => {
    render(<InstrumentTuningTeaser read={read({ speed: { orthogonal: [], 'sog-on-stw': [] } })} />)

    expect(word()).toHaveTextContent('anecdotal')
    expect(row()).toHaveTextContent('Boat speed: no Race has produced a speed comparison yet')
  })
})

describe('an archive with no season to read', () => {
  it('says it could not be read, and prints no coverage word over part of it', () => {
    render(<InstrumentTuningTeaser read={{ ok: false, reason: 'unreadable' }} />)

    expect(row()).toHaveTextContent('The archive could not be read.')
    expect(row()).toHaveTextContent('Nothing is shown rather than a coverage word over part of it')
    // The read is all-or-nothing on purpose: a season over the Races that happened to load would
    // present as a complete season, and its coverage word would be a claim about other evidence.
    expect(screen.queryByTestId('tuning-coverage')).not.toBeInTheDocument()
    expect(row().textContent).not.toMatch(/\b(solid|thin|anecdotal)\b/i)
  })

  it('says nothing has been uploaded yet, which is not a failure', () => {
    render(<InstrumentTuningTeaser read={{ ok: false, reason: 'no-races' }} />)

    expect(row()).toHaveTextContent('No race has been uploaded yet.')
    expect(screen.queryByTestId('tuning-coverage')).not.toBeInTheDocument()
  })
})

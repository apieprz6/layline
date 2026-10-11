import Link from 'next/link'
import type { ReactElement } from 'react'
import {
  CHANNEL_TITLE,
  type CheckedChannel,
} from '@/components/boat/instrument-tuning/chart-text'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import {
  asymmetryCoverage,
  headingCoverage,
  speedCoverage,
} from '@/services/analysis/coverage-verdict'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import type { InstrumentTuningRead } from '@/services/analysis/readInstrumentTuning'
import type { CoverageStatement, CoverageVerdict } from '@/types'

interface InstrumentTuningTeaserProps {
  /**
   * The season, or the reason there is none — the read as `readInstrumentTuning` hands it over.
   *
   * The whole union and not an unwrapped season, because this row has something to say in each of
   * its three states and the words differ: an archive that could not be read is not an archive with
   * nothing in it, and neither is a coverage word. The screen behind this row unwraps the same read
   * into three different screens for the same reason.
   */
  read: InstrumentTuningRead
}

/**
 * The Overall tab's **Instrument tuning** row, tapping through to the three charts.
 *
 * One word: the **worst of the three channels' coverage verdicts**, lowercased (ADR 0035). It says
 * how much of a season the figures behind it rest on and nothing whatever about the instruments —
 * `solid` is not a pass mark and `anecdotal` is not an alarm. So the word is **never carried by
 * colour**: the figure slot keeps the accent its two neighbours' percentages use and keeps it
 * whichever of the three words lands there, because a tone that moved with the verdict would be the
 * severity reading ADR 0034 took away. There is no count beside it for the same reason — `2 of 3`
 * reads as a severity score regardless of the word next to it, and low coverage is not a severity.
 *
 * A row and not a hero, like the Sail selection row above it: eyebrow, figure, muted caption, in
 * the same card. The Overall tab's rows are a list of doors, and what this one is for is deciding
 * whether to open the screen at all.
 *
 * ## Why the word arrives with a channel and a reason
 *
 * A verdict printed alone is a grade (`types/index.ts`, `CoverageStatement`), and the charts
 * themselves never print one without the reason that earned it. So the caption names the channel
 * the word came from and states what it rests on — a sailor who taps `anecdotal` lands on the screen
 * already knowing which of the three charts sent them there. The name is `CHANNEL_TITLE`'s and not
 * this row's, so it is the title of the card they will find rather than a second word for it.
 *
 * A Server Component: a link, a word and a sentence, with nothing to interact with.
 */
export default function InstrumentTuningTeaser({
  read,
}: InstrumentTuningTeaserProps): ReactElement {
  const said = read.ok ? fromSeason(read.season) : WITHOUT_A_SEASON[read.reason]

  return (
    <Link
      href="/boat-performance/instrument-tuning"
      data-testid="instrument-tuning-teaser"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(1),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: spacing(3),
        textDecoration: 'none',
      }}
    >
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Instrument tuning</span>

      {said.kind === 'instead' ? (
        <span
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
        >
          {said.instead}
        </span>
      ) : (
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing(2),
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-accent)',
          }}
        >
          <span data-testid="tuning-coverage" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
            {said.word}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            coverage, at the thinnest of the three checks
          </span>
        </span>
      )}

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {said.caption}
      </span>
    </Link>
  )
}

/**
 * Everything the row prints, as one shape per state.
 *
 * A union and not a word that might be missing: the row has three states — a season, an archive
 * that could not be read, and one with nothing in it — and in two of them there is no coverage word
 * to print at all, rather than a blank one.
 */
type RowWords =
  /** A season was read: the worst word, and the channel and reason that earned it. */
  | { kind: 'coverage'; word: string; caption: string }
  /** None was, so a sentence stands where the word would have been. */
  | { kind: 'instead'; instead: string; caption: string }

/**
 * What the row says where there is no season behind it.
 *
 * Both in the words the screen itself uses, so the row and the screen a tap opens cannot drift into
 * disagreeing about what happened. An empty archive is not a failure and says so; a failed read
 * says that **nothing** is shown rather than printing a word over the part that loaded.
 */
const WITHOUT_A_SEASON: Record<
  Extract<InstrumentTuningRead, { ok: false }>['reason'],
  Extract<RowWords, { kind: 'instead' }>
> = {
  'no-races': {
    kind: 'instead',
    instead: 'No race has been uploaded yet.',
    caption: 'These checks read a season of recordings. Tap for the three charts.',
  },
  unreadable: {
    kind: 'instead',
    instead: 'The archive could not be read.',
    caption: 'Nothing is shown rather than a coverage word over part of it. Try again shortly.',
  },
}

/**
 * The worst channel's word, and the sentence that says what earned it.
 *
 * Lower case here and upper case on the charts, deliberately: `ANECDOTAL` beside a chart is a term
 * being quoted, and a row on a tab is reading English.
 */
function fromSeason(season: InstrumentTuningSeason): RowWords {
  const { channel, verdict, reason } = worst(channels(season))

  return {
    kind: 'coverage',
    word: verdict.toLowerCase(),
    caption: `${CHANNEL_TITLE[channel]}: ${reason}. Over every Race in the archive. Tap for the three charts.`,
  }
}

/** One channel's coverage, carrying the channel so the caption can name it. */
interface ChannelCoverage extends CoverageStatement {
  channel: CheckedChannel
}

/** Worst first, which is the order a `max` over the three verdicts reads in (ADR 0035). */
const WORST_FIRST: readonly CoverageVerdict[] = ['ANECDOTAL', 'THIN', 'SOLID']

/**
 * The floor under a channel that produced nothing at all.
 *
 * Not a new cut-point: `coverage-verdict.ts` already decides that an empty population is
 * `ANECDOTAL` — "by decision rather than by `NaN` falling through two failed comparisons" — and a
 * channel with no Era to read is the emptiest population there is. What is added here is only the
 * sentence, because there is no Era to compose one from.
 */
function nothingMeasured(reason: string): CoverageStatement {
  return { verdict: 'ANECDOTAL', reason }
}

/**
 * The three channels' own verdicts, in the causal order the screen reads them in.
 *
 * Each over **what a tap would show**: the current Era on the compass and on boat speed — the last
 * of each, as `InstrumentTuningCharts` draws — and the pooled season on the **Tack Dial**, which is
 * the level that dial opens at. A row stating a verdict over an Era the screen does not draw would
 * send a sailor looking for a figure that is not there.
 */
function channels(season: InstrumentTuningSeason): ChannelCoverage[] {
  const heading = season.heading[season.heading.length - 1] ?? null
  const speed = season.speed.orthogonal[season.speed.orthogonal.length - 1] ?? null

  return [
    {
      channel: 'HDG',
      ...(heading === null
        ? nothingMeasured('no Race has produced a compass reading yet')
        : headingCoverage(heading)),
    },
    {
      channel: 'AWA',
      // No absence to compose for: an Asymmetry over no **Tack Pair** at either point of sail is a
      // state `asymmetryCoverage` already states in its own words.
      ...asymmetryCoverage(season.asymmetry.season),
    },
    {
      channel: 'STW',
      ...(speed === null
        ? nothingMeasured('no Race has produced a speed comparison yet')
        : speedCoverage(speed)),
    },
  ]
}

/**
 * The worst of them.
 *
 * A tie goes to the earliest channel, which is the `HDG → AWA → STW` order the screen reads in and
 * the order deviation propagates in. Nothing is lost by it: the word is the same either way, and
 * the reason beside it should name the first chart the sailor will meet.
 */
function worst(coverage: readonly ChannelCoverage[]): ChannelCoverage {
  return coverage.reduce((found, channel) =>
    WORST_FIRST.indexOf(channel.verdict) < WORST_FIRST.indexOf(found.verdict) ? channel : found
  )
}

import Link from 'next/link'
import type { ReactElement } from 'react'
import ChannelColumns from '@/components/boat/instrument-tuning/ChannelColumns'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { seasonHeadlines, thinnestChannel } from '@/services/analysis/instrument-tuning-headlines'
import type { InstrumentTuningRead } from '@/services/analysis/readInstrumentTuning'
import type { SeasonChannelHeadline } from '@/types'

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
 * The Overall tab's **Instrument tuning** row: three channels, each with its figure, what that
 * figure rests on, and a bar for how far that is from `solid`.
 *
 * **The shape is LAY-149's variant D**, the recommended mix the owner chose — its per-Race
 * "Instrument calibration check" tile, three columns of `Stat` over a coverage bar, brought to the
 * Overall tab. It replaces ADR 0035's single worst-of-three word by the owner's decision on LAY-160
 * (see that ADR's amendment): a sailor deciding whether to open the screen is better served by the
 * three figures and their evidence than by one word standing for all three.
 *
 * What each column leads with, how close to `solid` each bar is drawn and which channel is the
 * thinnest are `instrument-tuning-headlines.ts`'s, which the MCP `instrument_tuning` tool states
 * too. Drawn as one bar per channel at that share, so a full bar means the same thing in all three
 * — three bars that looked alike while scaling differently would be worse than no bars.
 *
 * Neutral throughout, one tone whatever the figures say (ADR 0034): coverage states how much
 * evidence there is and never that an instrument is wrong.
 *
 * A Server Component: a link, some figures and three bars, with nothing to interact with.
 */
export default function InstrumentTuningTeaser({
  read,
}: InstrumentTuningTeaserProps): ReactElement {
  return (
    <Link
      href="/boat-performance/instrument-tuning"
      data-testid="instrument-tuning-teaser"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing(2),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: spacing(3),
        textDecoration: 'none',
      }}
    >
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Instrument tuning</span>

      {!read.ok ? (
        <WithoutASeason read={read} />
      ) : (
        <Season headlines={seasonHeadlines(read.season)} />
      )}
    </Link>
  )
}

/** The three channels side by side, and the one sentence under them. */
function Season({ headlines }: { headlines: readonly SeasonChannelHeadline[] }): ReactElement {
  return (
    <>
      <ChannelColumns
        columns={headlines.map((headline) => ({
          channel: headline.channel,
          figures: headline.figures,
          instead: headline.instead,
          basis: headline.coverage.reason,
          bar: headline.towards_solid,
        }))}
        testIds={{
          name: 'tuning-channel',
          figures: 'tuning-figures',
          basis: 'tuning-reason',
          bar: 'coverage-bar',
        }}
      />

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {/* The coverage word ADR 0035 chose, kept as a clause rather than as the row's whole
            figure: it is the one sentence saying which of the three to trust least, and what the
            bars above are a summary of. */}
        Coverage is{' '}
        <span data-testid="tuning-coverage">{thinnestChannel(headlines).coverage.verdict.toLowerCase()}</span> at
        its thinnest, each bar being how close that channel is to solid. Over every Race in the
        archive. Tap for the three charts.
      </span>
    </>
  )
}

/**
 * What the row says where there is no season behind it.
 *
 * Both in the words the screen itself uses, so the row and the screen a tap opens cannot drift into
 * disagreeing about what happened. An empty archive is not a failure and says so; a failed read
 * says that **nothing** is shown rather than drawing three bars over the part that loaded.
 */
function WithoutASeason({
  read,
}: {
  read: Extract<InstrumentTuningRead, { ok: false }>
}): ReactElement {
  const said =
    read.reason === 'no-races'
      ? {
          instead: 'No race has been uploaded yet.',
          caption: 'These checks read a season of recordings. Tap for the three charts.',
        }
      : {
          instead: 'The archive could not be read.',
          caption:
            'Nothing is shown rather than figures measured over part of it. Try again shortly.',
        }

  return (
    <>
      <span
        style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
      >
        {said.instead}
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {said.caption}
      </span>
    </>
  )
}

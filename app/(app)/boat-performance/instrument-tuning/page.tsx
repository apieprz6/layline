import type { ReactElement } from 'react'
import EmptyState from '@/components/common/EmptyState'
import InstrumentTuningCharts from '@/components/boat/instrument-tuning/InstrumentTuningCharts'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'
import { readInstrumentTuning } from '@/services/analysis/readInstrumentTuning'

export const dynamic = 'force-dynamic'

/**
 * **Instrument tuning** — what the archive says is still off, as the three charts behind it.
 *
 * A signed-in screen and only that: every figure here is a read, and Role governs writes alone
 * (ADR 0019). A **Guest** is turned away first, so nothing about the archive reaches a request with
 * no session — not even whether it has anything in it.
 *
 * Uncached and `force-dynamic`, because everything on it is derived at read and stored nowhere
 * (ADR 0009): the Countable rule, the three-row bin gate and the fit's gates can move without a
 * migration, and a cached season would survive the move. It is also expensive — see
 * `readInstrumentTuning` on what it costs and what ADR 0026 will do about it.
 *
 * **The charts, not yet the screen.** The three cards each headlined for their own channel, the
 * bottom sheet they open, the two-dimension Analysis Filter rail and the Overall-tab teaser all
 * belong to the next ticket; this route exists so the charts can be read against the real archive
 * and driven in a real browser before the furniture goes around them.
 */
export default async function InstrumentTuningPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance/instrument-tuning')

  const read = await readInstrumentTuning()

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
      <h1
        style={{
          margin: `0 0 ${spacing(4)}`,
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        Instrument tuning
      </h1>

      {read.ok ? (
        <InstrumentTuningCharts season={read.season} log={read.log} races={read.races} />
      ) : read.reason === 'no-races' ? (
        <EmptyState
          mark="⛵"
          title="No races to measure yet"
          detail="These checks read a season of recordings. They appear once a race has been uploaded."
        />
      ) : (
        // Said rather than drawn around. A season computed over the Races that happened to load
        // would present as a complete season, and its coverage verdict would be a claim about
        // evidence that is not the evidence it had.
        <EmptyState
          mark="⚠"
          title="The archive could not be read"
          detail="Nothing is shown rather than a season measured over part of it. Try again shortly."
        />
      )}
    </div>
  )
}

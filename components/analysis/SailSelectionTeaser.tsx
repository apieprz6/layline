import Link from 'next/link'
import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import type { ChartAgreement } from '@/services/analysis/sail-selection'

/**
 * How many races the card looks back over. Said in the card, never implied.
 *
 * Ten, and deliberately more than the Polar card's five above it. Agreement is only legible where
 * a race recorded which sails it carried, and on this archive that is the seven most recent races
 * — so a ten-race window holds **every judgeable row the archive has** (1,241 of them) and 149 of
 * its 150 reached cells, for ten races' reading rather than thirteen. Five would have cost nothing
 * less to read and seen a third fewer of them.
 */
export const SAIL_SELECTION_TEASER_RACES = 10

interface SailSelectionTeaserProps {
  /**
   * What the window's sailing says about the chart, or null where there is no chart to say it of.
   *
   * Null is not an error. The grid *is* the **Crossover Chart**, so with none uploaded there is
   * nothing for the archive to be laid over, however much racing has been logged.
   */
  agreement: ChartAgreement | null
  /** How many Races the figures are over — fewer than the window on a young archive. */
  races: number
}

/**
 * The Overall tab's **Sail selection chart** row, tapping through to the full screen.
 *
 * A row and not a second hero: the Polar performance card above it is the tab's one glance figure.
 * What this says is **how well the chart matches what the boat actually does** — the share of
 * judgeable sailing that carried the sail its own cell calls for, with each side's own percent of
 * target under it.
 *
 * ## Why the pair, and why no verdict from it
 *
 * The share alone is ambiguous by construction. Low agreement is either a crew that does not
 * follow the chart or a chart that does not fit the boat, and this archive holds a race of each
 * kind — so the two efficiencies are what turn a compliance number into a calibration one. They
 * are stated side by side and **never subtracted**: across the whole archive they differ by half a
 * point over 294 differing rows, a fifth of those Filler-Anchored, and "0.5% faster ignoring the
 * chart" would be a finding invented out of noise. ADR 0030's rule stands — the word is never
 * "wrong", about the chart or about the crew.
 *
 * ## It says what it rests on
 *
 * Half this archive's placed sailing carries no **Sail Configuration**, and the ten-race window
 * holds three races that were never annotated. So the card states the share of its sailing that
 * could be judged at all rather than quietly shrinking its own denominator (ADR 0035, ADR 0029) —
 * and where nothing could be judged it says so in words instead of printing `0%`.
 *
 * **A recent window here and the whole archive there**, like the card above and for the same
 * reason: a tab is a glance, a screen is where a sailor reasons. The two figures are allowed to
 * differ without looking like a bug, which is why this says which races it is over.
 *
 * A Server Component: a link and some digits, with nothing to interact with.
 */
export default function SailSelectionTeaser({
  agreement,
  races,
}: SailSelectionTeaserProps): ReactElement {
  const share = agreement === null ? null : efficiencyPercent(agreement.agreement)

  return (
    <Link
      href="/boat-performance/sail-selection"
      data-testid="sail-selection-teaser"
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
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>Sail selection chart</span>

      {share === null ? (
        <span
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
        >
          {agreement === null
            ? 'No Crossover Chart has been uploaded yet.'
            : 'No race in this window recorded which sails it carried.'}
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
          <span data-testid="chart-agreement" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
            {share}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            carried what the chart calls for
          </span>
        </span>
      )}

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {agreement === null
          ? 'Upload one under Boat setup, and this is where the archive gets laid over it.'
          : // With nothing judgeable there is no share for either clause to describe, and both
            // would be absurd: a percent of target for rows sorted into sides nobody can sort, and
            // "the 0% of that sailing whose sail was written down" beside a headline that has just
            // said so in words. The window alone is what is left to say.
            share === null
            ? `Over the last ${races} race${races === 1 ? '' : 's'}. Tap for the whole archive, filterable, in four layers.`
            : `${sides(agreement)}over the last ${races} race${races === 1 ? '' : 's'}${judged(
                agreement
              )}. Tap for the whole archive, filterable, in four layers.`}
      </span>
    </Link>
  )
}

/**
 * Each side's own percent of target, or a sentence where one side is empty.
 *
 * Never a dash for a missing side: a window where nothing differed is a real and flattering state,
 * and `88.1% / —` reads as a figure withheld rather than as a window with nothing in it (ADR 0012).
 */
function sides(agreement: ChartAgreement): string {
  const following = efficiencyPercent(agreement.following.polar_efficiency)
  const differing = efficiencyPercent(agreement.differing.polar_efficiency)

  if (following !== null && differing !== null) {
    return `${following} of target when it did, ${differing} when it did not — `
  }
  if (following !== null) return `${following} of target when it did, and nothing carried otherwise — `
  if (differing !== null) {
    return `${differing} of target when it did not, and nothing carried what the chart calls for — `
  }

  // Judgeable rows with no scorable sailing behind either side: rare, and a sentence rather than
  // two dashes.
  return 'Nothing in this window could be scored against the Polar — '
}

/**
 * What share of the window's placed sailing could be compared with the chart at all.
 *
 * Said whenever it is not all of it, because that is the figure the share actually rests on: this
 * archive's ten-race window is 63% judgeable, and the other 37% is races nobody annotated rather
 * than sailing that disagreed.
 *
 * Only ever called where there is a share to describe, so `judgeable_rows` is at least one and
 * `placed_rows` cannot be nought.
 */
function judged(agreement: ChartAgreement): string {
  const { judgeable_rows, placed_rows } = agreement

  if (judgeable_rows === placed_rows) return ', all of which recorded their sails'

  return `, on the ${sharePercent(judgeable_rows / placed_rows)} of that sailing whose sail was written down`
}

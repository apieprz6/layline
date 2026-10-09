import Link from 'next/link'
import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import { fillerAnchoredShare } from '@/services/analysis/polar-performance'
import { describeDuration } from '@/services/recordings/coverage'
import type { EfficiencyAggregate } from '@/types'

/** How many races the teaser looks back over. Said in the card, never implied. */
export const TEASER_RACES = 5

interface PolarPerformanceTeaserProps {
  /** How many Races the figure is actually over — fewer than `TEASER_RACES` on a young archive. */
  races: number
  efficiency: EfficiencyAggregate
}

/**
 * The Overall tab's hero card: the last five races, tapping through to the detail screen.
 *
 * **A recent window here and the whole archive there**, deliberately. A hero is a glance — "how is
 * the boat going lately" — and the last five races is an answer to that question; the detail
 * screen's default is the whole archive, because that is where a sailor goes to reason rather than
 * to glance. The two are different figures over different rows, so the card says which it is in
 * words. A card that silently showed a recent window under the same name as the screen's figure
 * would make two honest numbers look like a bug.
 *
 * A Server Component: a link and some digits, with nothing to interact with.
 */
export default function PolarPerformanceTeaser({
  races,
  efficiency,
}: PolarPerformanceTeaserProps): ReactElement {
  const polar = efficiencyPercent(efficiency.polar_efficiency)
  const vmg = efficiencyPercent(efficiency.vmg_efficiency)
  const filler = fillerAnchoredShare(efficiency)

  return (
    <Link
      href="/boat-performance/polar"
      data-testid="polar-performance-teaser"
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
      <span style={{ ...EYEBROW_STYLE, marginBottom: 0 }}>
        Polar performance · last {TEASER_RACES} races
      </span>

      {polar === null ? (
        <span
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
        >
          {races === 0
            ? 'No race has been uploaded yet.'
            : 'Nothing in these races could be scored against the Polar.'}
        </span>
      ) : (
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing(3),
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-accent)',
          }}
        >
          <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{polar}</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {/* Never a dash in place of the VMG figure: the two are computed over different
                subsets, and a row with a Target Speed and no Target VMG is a real case. */}
            VMG {vmg === null ? 'not scorable' : vmg}
          </span>
        </span>
      )}

      {/* The teaser states its own coverage, like every other card that headlines a figure: a
          figure with nothing stated behind it cannot be argued with.

          In **time**, not rows, for the reason the ledger is: "812 rows" cannot be held against a
          sailor's memory of the afternoon (ADR 0009), and because qtVlm logs on events rather than
          on a clock the count is not even proportional to one. "Scored" is doing work too — this is
          the sailing that carried both a measured interval and a Target Speed, which is less than
          the whole of the five races, and the detail screen is where that is broken out. */}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {describeDuration(efficiency.elapsed_seconds)} scored across {races} race
        {races === 1 ? '' : 's'}
        {filler !== null && filler > 0 && `, ${sharePercent(filler)} of it filler-anchored`}. Tap
        for the whole archive, filterable.
      </span>
    </Link>
  )
}

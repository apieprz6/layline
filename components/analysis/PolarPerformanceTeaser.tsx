import Link from 'next/link'
import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import PolarPlot from '@/components/analysis/PolarPlot'
import { fillerAnchoredShare } from '@/services/analysis/polar-performance'
import {
  familiesFor,
  familyKnots,
  plotMoments,
  plotPatches,
  rimKnots,
} from '@/services/analysis/polar-plot'
import { describeDuration } from '@/services/recordings/coverage'
import type { EfficiencyAggregate, MatchableRow, PolarPayload } from '@/types'

/** How many races the teaser looks back over. Said in the card, never implied. */
export const TEASER_RACES = 5

/** The rose's width: `PolarPlot`'s own teaser cap, so the column and the drawing agree. */
const TEASER_PLOT_WIDTH = '150px'

interface PolarPerformanceTeaserProps {
  /** How many Races the figure is actually over — fewer than `TEASER_RACES` on a young archive. */
  races: number
  efficiency: EfficiencyAggregate
  /** Those Races' rows: what the small **Polar Plot** under the figure is drawn from. */
  rows: readonly MatchableRow[]
  /** Every Polar those rows were scored against, by Version id. */
  polars: Readonly<Record<string, PolarPayload>>
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
 * Beside the figure, the **Polar Plot** in its small patched form over the same five races (ADR
 * 0040): about 150px wide, no labels, the figure first in reading order. At that size a cloud of
 * dots is a smudge, so it is patches; and it is all the wind the five races sailed in, because a
 * glance has no window to set. The detail screen is where the window is.
 *
 * Beside and not under since LAY-178, when the card moved into Boat performance's rail: a half rose
 * is twice as tall as it is wide, so under the words it took a third of the card's width and left
 * the rest of a tall card empty. Beside them it runs the card's height, and the card is shorter.
 *
 * A Server Component: a link, some digits and a drawing, with nothing to interact with.
 */
export default function PolarPerformanceTeaser({
  races,
  efficiency,
  rows,
  polars,
}: PolarPerformanceTeaserProps): ReactElement {
  const polar = efficiencyPercent(efficiency.polar_efficiency)
  const patches = plotPatches(rows)
  const families = familiesFor(rows, polars)
  const vmg = efficiencyPercent(efficiency.vmg_efficiency)
  const filler = fillerAnchoredShare(efficiency)

  return (
    <Link
      href="/boat-performance/polar"
      data-testid="polar-performance-teaser"
      style={{
        display: 'flex',
        gap: spacing(3),
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: radius('md'),
        padding: spacing(3),
        textDecoration: 'none',
      }}
    >
      {/* The words in a column of their own, the figure at its head and the coverage at its foot,
          so the rose beside them can run the card's whole height. */}
      <span
        style={{
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing(1),
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
          // The figure over its VMG rather than beside it, and at the card's largest size: with the
          // rose standing the card's full height beside it, a 24px figure on one line left the
          // whole column under it empty. 36px still fits "100.0%" in a phone's narrower column.
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing(1),
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-accent)',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-4xl)',
                fontWeight: 700,
                lineHeight: 'var(--leading-tight)',
              }}
            >
              {polar}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {/* Never a dash in place of the VMG figure: the two are computed over different
                  subsets, and a row with a Target Speed and no Target VMG is a real case. */}
              VMG {vmg === null ? 'not scorable' : vmg}
            </span>
          </span>
        )}

        {/* The teaser states its own coverage, like every other card that headlines a figure:
            a figure with nothing stated behind it cannot be argued with.

            In **time**, not rows, for the reason the ledger is: "812 rows" cannot be held
            against a sailor's memory of the afternoon (ADR 0009), and because qtVlm logs on
            events rather than on a clock the count is not even proportional to one. "Scored" is
            doing work too — this is the sailing that carried both a measured interval and a
            Target Speed, which is less than the whole of the five races, and the detail screen
            is where that is broken out.

            At the column's foot, `marginTop: auto`, so with a rose beside it the figure and its
            coverage bracket the picture rather than bunching at the top of it. */}
        <span
          style={{
            marginTop: 'auto',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          {describeDuration(efficiency.elapsed_seconds)} scored across {races} race
          {races === 1 ? '' : 's'}
          {filler !== null && filler > 0 && `, ${sharePercent(filler)} of it filler-anchored`}. Tap
          for the whole archive, filterable.
        </span>
      </span>

      {patches.length > 0 && (
        // Beside the words and not under them: the half rose is twice as tall as it is wide, so
        // under a line of text it filled a third of the card's width and left the rest empty.
        // Its own fixed width, since an `auto`-sized column has no width for `100%` to take.
        <span style={{ flex: 'none', width: TEASER_PLOT_WIDTH, alignSelf: 'center' }}>
          <PolarPlot
            teaser
            reading="knots"
            // Fitted to the columns this card draws rather than the whole certificate: it has no
            // focus window to move, so a rim set by the Polar's 20 kt column only left the drawing
            // in the middle of a frame nothing on the card reaches (`familyKnots`).
            rim={rimKnots(plotMoments(rows), [], familyKnots(families))}
            families={families}
            patches={patches}
            label={`The boat's speed at each wind angle against its certificate, over the last ${races} race${races === 1 ? '' : 's'}.`}
          />
        </span>
      )}
    </Link>
  )
}

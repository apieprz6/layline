import Link from 'next/link'
import type { ReactElement } from 'react'
import { EYEBROW_STYLE } from '@/components/common/eyebrow'
import { radius, spacing } from '@/lib/utils/design'
import type { GridCoverage } from '@/services/analysis/sail-selection'

interface SailSelectionTeaserProps {
  /** What the last `races` races reached on the chart, or null where there is no chart to reach. */
  coverage: GridCoverage | null
  /** How many Races the figure is over — fewer than the window on a young archive. */
  races: number
}

/**
 * The Overall tab's **Sail selection chart** row, tapping through to the full screen.
 *
 * A row and not a second hero. The Polar performance card above it is the tab's one glance figure;
 * this says what there is to go and look at, and the thing worth saying is **coverage** — how much
 * of the boat's own chart its racing has actually visited (ADR 0035's stance, that a teaser states
 * its coverage rather than headlining a number with nothing behind it).
 *
 * **A recent window here and the whole archive there**, like the card above and for the same
 * reason: a tab is a glance, a screen is where a sailor reasons. So this says which races it is
 * over in words, and the two figures are allowed to differ without looking like a bug.
 *
 * A Server Component: a link and some digits, with nothing to interact with.
 */
export default function SailSelectionTeaser({
  coverage,
  races,
}: SailSelectionTeaserProps): ReactElement {
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

      {coverage === null ? (
        <span
          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}
        >
          {/* Not an error. The grid *is* the chart, so with none uploaded there is nothing to lay
              the archive over, however much racing has been logged. */}
          No Crossover Chart has been uploaded yet.
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
          <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
            {coverage.reached}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            of {coverage.cells} cells reached
          </span>
        </span>
      )}

      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {coverage === null
          ? 'Upload one under Boat setup, and this is where the archive gets laid over it.'
          : `Over the last ${races} race${races === 1 ? '' : 's'}${
              coverage.mixed > 0
                ? `, with ${coverage.mixed} ${coverage.mixed === 1 ? 'cell' : 'cells'} where the crew both agreed and differed with the chart`
                : ''
            }. Tap for the whole archive, filterable, in four layers.`}
      </span>
    </Link>
  )
}

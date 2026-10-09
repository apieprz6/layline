import Link from 'next/link'
import { Suspense, type ReactElement } from 'react'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import SailSelectionContent from '@/components/analysis/SailSelectionContent'
import SailSelectionSkeleton from '@/components/analysis/SailSelectionSkeleton'
import EmptyState from '@/components/common/EmptyState'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'
import { filterFromSearchParams } from '@/services/analysis/filter-url'
import { SAIL_SELECTION_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { polarDomain } from '@/services/analysis/polar-targets'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { readCrossoverChartScreen } from '@/services/boat/readCrossoverChartVersions'
import { readPolarScreen } from '@/services/boat/readPolarVersions'

export const dynamic = 'force-dynamic'

/** What Next hands a page in `searchParams`: one key, one value or many. */
type SearchParams = Record<string, string | string[] | undefined>

/**
 * **Sail selection** — the Crossover Chart with the season laid over it.
 *
 * A signed-in screen and only that, the same shape as `/boat-performance/polar`: a Guest is turned
 * away before anything is read, so a signed-out request reveals nothing about the archive, not even
 * whether it has anything in it (ADR 0015, ADR 0019). Every signed-in sailor reads the same
 * figures — **Role** governs writes only — so nothing here asks `canWrite`.
 *
 * `searchParams` is read on the server so a shared narrowing renders before hydration, and the
 * filter still lives in the browser so a chip tap never waits on a navigation (ADR 0029). The
 * sanitising reader is `filterFromSearchParams`, which drops bucket ids this build's vocabulary
 * does not hold.
 */
export default async function SailSelectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance/sail-selection')

  return (
    <Suspense fallback={<SailSelectionSkeleton />}>
      <SailSelectionScreen params={await searchParams} />
    </Suspense>
  )
}

/**
 * The reads, behind the boundary.
 *
 * Three of them, in one wave, because none depends on another's answer: the archive's rows, the
 * **Crossover Chart** the grid *is*, and the **Polar** whose axes decide which cells can ever hold
 * a figure.
 *
 * Four screens, and they are deliberately different:
 *
 *   - a failed archive read says so, because "no races" over a failed read would be Layline
 *     claiming the sailor has sailed nothing;
 *   - an empty archive says no race has been uploaded, which is true and actionable;
 *   - **no Crossover Chart** is its own answer and not an error. The grid is the chart; with none
 *     uploaded there is nothing to draw and nothing a row could be laid onto, however much racing
 *     has been logged. It points at Boat Setup rather than at the upload wizard.
 *   - a failed or absent **Polar** is none of the above: the grid still draws and every figure on
 *     it still holds, because each row's Target Speed came from the Polar its own Race was sailed
 *     under (ADR 0012) and is not re-derived here. All that is lost is the claim that a region can
 *     *never* hold a figure, which is why `domain` is nullable rather than required.
 */
async function SailSelectionScreen({ params }: { params: SearchParams }): Promise<ReactElement> {
  const [archive, chart, polar] = await Promise.all([
    readAnalysisArchive(),
    readCrossoverChartScreen(),
    readPolarScreen(),
  ])

  if (archive === null) {
    return (
      <Screen>
        <ArchiveUnreadable />
      </Screen>
    )
  }

  const payload = chart?.current?.payload ?? null

  if (payload === null) {
    return (
      <Screen>
        <EmptyState
          mark="⛵"
          title="No Crossover Chart yet"
          detail="This screen is the boat's own sail selection chart, with the archive laid over it. Upload one under Boat setup and it appears here."
        />
      </Screen>
    )
  }

  if (archive.rows.length === 0) {
    return (
      <Screen>
        <EmptyState
          mark="⛵"
          title="No sailing to lay over the chart yet"
          detail="Every layer but the chart itself reads the rows inside each race's window. Upload a race and they appear here."
        />
      </Screen>
    )
  }

  const dimensions = analysisDimensions(SAIL_SELECTION_DIMENSIONS, archive.vocabulary)

  return (
    <Screen>
      <SailSelectionContent
        rows={archive.rows}
        races={archive.races}
        dimensions={dimensions}
        initialFilter={filterFromSearchParams(params, dimensions)}
        chart={payload}
        domain={polar?.current == null ? null : polarDomain(polar.current.payload)}
      />
    </Screen>
  )
}

/** The screen's own box: the title, the way back, and whatever is under them. */
function Screen({ children }: { children: ReactElement }): ReactElement {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <div>
          <Link
            href="/boat-performance"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-accent)', textDecoration: 'none' }}
          >
            ← Boat performance
          </Link>
          <h1
            style={{
              margin: `${spacing(1)} 0 0`,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              color: 'var(--text-primary)',
            }}
          >
            Sail selection
          </h1>
        </div>

        {children}
      </div>
    </div>
  )
}

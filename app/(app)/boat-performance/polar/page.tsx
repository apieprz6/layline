import Link from 'next/link'
import { Suspense, type ReactElement } from 'react'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import ArchiveUnreadable from '@/components/analysis/ArchiveUnreadable'
import PolarPerformanceSkeleton from '@/components/analysis/PolarPerformanceSkeleton'
import EmptyState from '@/components/common/EmptyState'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'
import { filterFromSearchParams } from '@/services/analysis/filter-url'
import { POLAR_PERFORMANCE_DIMENSIONS, analysisDimensions } from '@/services/analysis/filter'
import { readAnalysisArchive } from '@/services/analysis/readArchive'

export const dynamic = 'force-dynamic'

/** What Next hands a page in `searchParams`: one key, one value or many. */
type SearchParams = Record<string, string | string[] | undefined>

/**
 * **Polar performance** — the filterable detail screen.
 *
 * A signed-in screen and only that, the same shape as `/boat-performance`: a Guest is turned away
 * before the archive is read, so a signed-out request reveals nothing about it, not even whether
 * it has anything in it (ADR 0015, ADR 0019). Every signed-in sailor reads the same figures —
 * **Role** governs writes only — so nothing here asks `canWrite`.
 *
 * ## Why `searchParams` is read here and the filter still lives in the browser
 *
 * Both halves of ADR 0029. The filter is client state, so narrowing never waits on a navigation —
 * but **first paint still reads `searchParams` on the server**, so a shared link renders its own
 * narrowing before hydration rather than flashing the whole archive. The sanitising reader is
 * `filterFromSearchParams`, which drops bucket ids this build's vocabulary does not hold.
 *
 * The vocabulary has to be built before the params can be read, which is why the read comes
 * first: a `sail` chip's id is a **Sail Definition**'s own words, and which words those are is a
 * fact about the archive (ADR 0023).
 *
 * ## No API route
 *
 * There is still nothing here a client needs to fetch. The rows travel with the first render and
 * matching runs in the browser from the same functions the server used (ADR 0026, ADR 0029).
 */
export default async function PolarPerformancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance/polar')

  return (
    <Suspense fallback={<PolarPerformanceSkeleton />}>
      <PolarPerformanceScreen params={await searchParams} />
    </Suspense>
  )
}

/**
 * The read, behind the boundary.
 *
 * A failed read and an empty archive are deliberately **different** screens. An empty archive says
 * no race has been uploaded, which is true and actionable; a failed read says the archive could not
 * be read, because every figure below is a statement about how much of the archive is behind it and
 * "no races" over a failed read would be Layline claiming the sailor has sailed nothing.
 */
async function PolarPerformanceScreen({ params }: { params: SearchParams }): Promise<ReactElement> {
  const archive = await readAnalysisArchive()

  if (archive === null) {
    return (
      <Screen>
        <ArchiveUnreadable />
      </Screen>
    )
  }

  if (archive.rows.length === 0) {
    return (
      <Screen>
        <EmptyState
          mark="⛵"
          title="No rows to measure yet"
          detail="Polar performance reads the rows inside each race's window. Upload a race and it appears here."
        />
      </Screen>
    )
  }

  const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, archive.vocabulary)

  return (
    <Screen>
      <PolarPerformanceContent
        rows={archive.rows}
        races={archive.races}
        dimensions={dimensions}
        initialFilter={filterFromSearchParams(params, dimensions)}
      />
    </Screen>
  )
}

/** The screen's own box: the title, the way back, and whatever is under them. */
function Screen({ children }: { children: ReactElement }): ReactElement {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--page-bg)', padding: spacing(4) }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <div>
          <Link
            href="/boat-performance"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-accent)',
              textDecoration: 'none',
            }}
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
            Polar performance
          </h1>
        </div>

        {children}
      </div>
    </div>
  )
}

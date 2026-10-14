/**
 * TEST HARNESS — the Polar performance screen and the Overall tab's teaser, on a synthetic season,
 * for the browser suite only.
 *
 * Off unless `LAYLINE_TRACK_HARNESS=1`, the flag `playwright.config.ts` already sets for
 * `/dev/race-track`, so it 404s in a deployed Layline like any other unknown path.
 *
 * It exists for the reason that route does: the **Polar Plot**'s patch tap and its focus window
 * need a hydrated page (a click on an un-hydrated node *succeeds* in this environment), and there
 * is no archive in any local database to open the real screen over. It mounts
 * `PolarPerformanceContent` and `PolarPerformanceTeaser` — the components the two real pages mount
 * — over rows built by `racePlottableRows`, the function the per-Race page scores with. Only the
 * data is a fixture.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import PolarPerformanceContent from '@/components/analysis/PolarPerformanceContent'
import PolarPerformanceTeaser from '@/components/analysis/PolarPerformanceTeaser'
import ScreenHeading from '@/components/analysis/ScreenHeading'
import { spacing } from '@/lib/utils/design'
import { sumEfficiency } from '@/services/analysis/efficiency'
import {
  EMPTY_FILTER,
  POLAR_PERFORMANCE_DIMENSIONS,
  analysisDimensions,
} from '@/services/analysis/filter'

import { SEASON_POLAR, SEASON_POLAR_ID, seasonRaces, seasonRows } from './fixture'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

export default function PolarPerformanceHarnessPage(): ReactElement {
  if (process.env.LAYLINE_TRACK_HARNESS !== '1') notFound()

  const rows = seasonRows()
  const races = seasonRaces(rows)
  const polars = { [SEASON_POLAR_ID]: SEASON_POLAR }
  const dimensions = analysisDimensions(POLAR_PERFORMANCE_DIMENSIONS, {
    sails: [],
    months: [...new Set(rows.map((row) => row.day.slice(0, 7)))].sort(),
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing(3) }}>
        <ScreenHeading title="Polar performance" />

        <PolarPerformanceContent
          rows={rows}
          races={races}
          dimensions={dimensions}
          initialFilter={EMPTY_FILTER}
          polars={polars}
        />

        <div style={{ maxWidth: 360 }}>
          <PolarPerformanceTeaser
            races={races.length}
            efficiency={sumEfficiency(rows)}
            rows={rows}
            polars={polars}
          />
        </div>
      </div>
    </div>
  )
}

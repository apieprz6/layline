/**
 * TEST HARNESS — one race's page, on a synthetic race, for the browser suite only.
 *
 * Off unless `LAYLINE_TRACK_HARNESS=1`, which `playwright.config.ts` sets on the server it starts.
 * A request without it gets the same 404 as any other unknown path, so this is unreachable in a
 * deployed Layline.
 *
 * ## Why it exists
 *
 * ADR 0033 requires a browser test that asserts the map's own transform rather than a click: in
 * this environment `next dev` never hydrates, and a Playwright click on an un-hydrated node
 * *succeeds*, so "the zoom button was pressed" proves nothing. The gesture therefore has to be
 * exercised in a real browser against a real hydrated map — and the page's own layout has to be
 * seen at a desktop width, which is the other thing no amount of jsdom will answer.
 *
 * It cannot be exercised on the race page itself. There is no race in any local database and there
 * will not be one: the archive is hand-entered through the finished UI, so nothing seeds a
 * recording, and the per-race route answers a browser with a redirect or a 404. This route is the
 * smallest thing that puts the real component in front of a real browser.
 *
 * ## Why it is not a second renderer
 *
 * It mounts `RaceDetailView` — the component the race page mounts — over a `RaceDetail` whose track
 * comes from `raceTrackHeatmap`, the same function `readRaceTrack` calls, scored through the same
 * `polarTargets` and compared against the chart through the same `compareSailToChart`. The only
 * thing that is a fixture is the data. Nothing about the layout, the drawing, the banding or the
 * camera is reimplemented here, so there is nothing for it to drift from.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import type { DeleteRaceResult } from '@/types'
import RaceDetailView from '@/components/race/RaceDetailView'
import { polarTargets } from '@/services/analysis/polar-targets'
import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { compareSailToChart } from '@/services/analysis/sail-agreement'
import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'

import {
  HARNESS_CHART,
  HARNESS_POLAR,
  HARNESS_SAILS,
  HARNESS_TESTIMONY,
  harnessRace,
  harnessRows,
} from './fixture'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

/** Never called: `canDelete` is false, so nothing renders the panel that would call it. */
const deleteNothing = async (): Promise<DeleteRaceResult> => ({ ok: true, bytes_removed: true })

export default function RaceTrackHarnessPage(): ReactElement {
  if (process.env.LAYLINE_TRACK_HARNESS !== '1') notFound()

  // The chart verdict is attached by the caller on the real page too (`readRaceTrack`), because it
  // is resolved against the Race's own Crossover Chart Version and its own Testimony.
  const chart = { lookup: crossoverLookup(HARNESS_CHART), entries: HARNESS_SAILS }
  const rows = harnessRows().map((row) => ({
    ...row,
    sail: compareSailToChart(
      { row_time: row.row_time, twa: Number(row.twa), tws: Number(row.tws) },
      chart
    ),
  }))

  const heatmap = raceTrackHeatmap(rows, polarTargets(HARNESS_POLAR), {
    annotations: HARNESS_TESTIMONY,
  })

  return (
    <RaceDetailView
      race={harnessRace({ heatmap, scoring: 'polar' })}
      // `canDelete` off, and not for want of a Role: `RaceDeletePanel` is a Client Component, so
      // the action it takes has to be a real Server Action rather than a closure a harness can
      // make up — and a no-op action is a production endpoint this route has no business adding.
      // The panel has its own suite; the layout question does not turn on it.
      canDelete={false}
      canAmend
      deleteRace={deleteNothing}
    />
  )
}

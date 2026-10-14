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
 * comes from `raceTrackHeatmap` and whose **Polar Plot** from `racePolarPlot`, the same functions
 * `readRaceTrack` calls, scored through the same
 * `polarTargets` and compared against the chart through the same `compareSailToChart`. The only
 * thing that is a fixture is the data. Nothing about the layout, the drawing, the banding or the
 * camera is reimplemented here, so there is nothing for it to drift from.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import type { DeleteRaceResult, RaceTrack } from '@/types'
import RaceDetailView from '@/components/race/RaceDetailView'
import { raceInstrumentCheck } from '@/services/analysis/instrument-tuning'
import { buildMatchableRows } from '@/services/analysis/matchable-rows'
import { racePlottableRows, racePolarPlot, seasonTrace } from '@/services/analysis/polar-plot'
import { polarDomain, polarTargets } from '@/services/analysis/polar-targets'
import { crossoverLookup } from '@/services/analysis/crossover-lookup'
import { compareSailToChart } from '@/services/analysis/sail-agreement'
import { raceChartAgreement, type RaceSailChartRead } from '@/services/analysis/sail-selection'
import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'

import {
  HARNESS_ANNOTATIONS,
  HARNESS_CHART,
  HARNESS_POLAR,
  HARNESS_SAILS,
  HARNESS_TESTIMONY,
  HARNESS_WINDOW,
  harnessRace,
  harnessRecording,
  harnessRows,
} from './fixture'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

/** Never called: `canDelete` is false, so nothing renders the panel that would call it. */
const deleteNothing = async (): Promise<DeleteRaceResult> => ({ ok: true, bytes_removed: true })

export default async function RaceTrackHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  if (process.env.LAYLINE_TRACK_HARNESS !== '1') notFound()

  // `?breakdown=none` draws the same race as one that produced no figure anywhere under the map:
  // no Polar named, no chart uploaded, and nothing any calibration check could read — which is the
  // state every one of those tiles has to say in words rather than leave blank.
  const empty = (await searchParams).breakdown === 'none'

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

  const targets = polarTargets(HARNESS_POLAR)
  const heatmap = raceTrackHeatmap(rows, targets, { annotations: HARNESS_TESTIMONY })
  // The Polar Plot from the same rows and the same Polar, through the function `readRaceTrack`
  // calls, so the two pictures here are linked exactly as they are on the race page.
  const race = { id: 'harness-race', polar_version_id: 'harness-polar' }
  const plot = racePolarPlot(rows, race, HARNESS_POLAR, targets)

  // The rows a Recording carries, read by the same calibration checks and the same sail-vs-chart
  // fold the race page calls, so the tiles under the map are the real ones over synthetic data.
  const recording = harnessRecording()
  const matchable = buildMatchableRows(
    recording,
    {
      id: race.id,
      window: HARNESS_WINDOW,
      polar_version_id: race.polar_version_id,
      crossover_chart_version_id: 'harness-chart',
    },
    HARNESS_ANNOTATIONS,
    targets
  )

  const track: RaceTrack = empty
    ? { heatmap, scoring: 'no-polar-version', plot: null }
    : { heatmap, scoring: 'polar', plot }
  const instruments = raceInstrumentCheck({
    race_id: race.id,
    rows: empty ? [] : recording,
    window: HARNESS_WINDOW,
  })
  const sailChart: RaceSailChartRead = empty
    ? { ok: false, reason: 'no-chart' }
    : {
        ok: true,
        agreement: raceChartAgreement(
          matchable,
          race.id,
          HARNESS_CHART,
          polarDomain(HARNESS_POLAR),
          'harness-chart'
        ),
      }

  return (
    <RaceDetailView
      race={harnessRace(track, instruments)}
      sailChart={sailChart}
      // A harness has no archive, so the season behind this race is the race itself: enough to
      // put the trace on screen, which is all a browser can judge of it.
      season={seasonTrace(racePlottableRows(rows, race, targets))}
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

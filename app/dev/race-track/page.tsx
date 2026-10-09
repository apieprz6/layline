/**
 * TEST HARNESS — the **Race Track Heatmap** on a synthetic race, for the browser suite only.
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
 * exercised in a real browser against a real hydrated map.
 *
 * It cannot be exercised on the race page itself. There is no race in any local database and there
 * will not be one: the archive is hand-entered through the finished UI, so nothing seeds a
 * recording, and the per-race route answers a browser with a redirect or a 404. This route is the
 * smallest thing that puts the real component in front of a real browser.
 *
 * ## Why it is not a second renderer
 *
 * It mounts `RaceTrackSection` — the same component the race page mounts — over geometry from
 * `raceTrackHeatmap`, the same function `readRaceTrack` calls, scored through the same
 * `polarTargets`. The only thing that is a fixture is the rows. Nothing about the drawing, the
 * banding or the camera is reimplemented here, so there is nothing for it to drift from.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import RaceTrackSection from '@/components/race/RaceTrackSection'
import { spacing } from '@/lib/utils/design'
import { polarTargets } from '@/services/analysis/polar-targets'
import { raceTrackHeatmap } from '@/services/analysis/track-heatmap'

import { HARNESS_POLAR, harnessRows } from './fixture'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

export default function RaceTrackHarnessPage(): ReactElement {
  if (process.env.LAYLINE_TRACK_HARNESS !== '1') notFound()

  const heatmap = raceTrackHeatmap(harnessRows(), polarTargets(HARNESS_POLAR))

  return (
    // The same column the race page gives this section — `maxWidth: 720` and a `spacing(4)` gutter
    // — so what a screenshot here shows is what the page shows, at both the 390px target and on a
    // desktop window.
    <div
      style={{
        background: 'var(--page-bg)',
        minHeight: '100vh',
        padding: spacing(4),
        maxWidth: 720,
      }}
    >
      <p style={{ margin: `0 0 ${spacing(3)}`, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Test harness — a synthetic race, not the archive.
      </p>
      <RaceTrackSection track={{ heatmap, scoring: 'polar' }} />
    </div>
  )
}

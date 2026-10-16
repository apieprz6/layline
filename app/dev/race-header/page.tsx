/**
 * TEST HARNESS — the signed-in header, naming a boat with a long name, for the browser suite only.
 *
 * Off unless `LAYLINE_TRACK_HARNESS=1`, the flag `playwright.config.ts` already sets for
 * `/dev/race-track`, so it 404s in a deployed Layline like any other unknown path.
 *
 * It exists because the boat's name is the one row every e2e run shares: renaming it to something
 * long enough to crowd the WIND NOW readout would race the guest specs that assert it is never
 * served. It mounts `RaceHeader` — the component the `(app)` layout mounts — with a fixture name
 * (`HarnessHeader`).
 * Only the name is a fixture.
 */

import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import HarnessHeader from './HarnessHeader'

/** So the env guard is read per request rather than baked into a build. */
export const dynamic = 'force-dynamic'

export default function RaceHeaderHarnessPage(): ReactElement {
  if (process.env.LAYLINE_TRACK_HARNESS !== '1') notFound()

  return <HarnessHeader />
}

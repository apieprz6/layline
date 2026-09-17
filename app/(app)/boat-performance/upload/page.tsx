import type { ReactElement } from 'react'
import RaceFlow from '@/components/race-flow/RaceFlow'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'
import { readCrossoverChartChoices } from '@/services/boat/readCrossoverChartChoices'
import { readRaceBoatSetupChoices } from '@/services/boat/readRaceBoatSetupChoices'

import { stageRecording, submitRace } from './actions'

export const dynamic = 'force-dynamic'

/**
 * **Upload a race** — an admin screen behind a signed-in one.
 *
 * Two refusals, in order. A **Guest** is sent back to the dashboard with the **Auth Sheet** open and
 * this route remembered, so nothing about the archive is served to someone who is not signed in
 * (ADR 0015). A signed-in sailor who is not an admin is told so plainly and shown nothing else: Role
 * governs writes, and uploading is the write (ADR 0019).
 *
 * The flow itself is `RaceFlow`, which is also the amend surface (ADR 0010 Amendment 1) — the same
 * component with its File step absent. This page is the upload door into it, so it hands it the `upload`
 * mode: the two Server Actions, and nothing to amend.
 *
 * Those actions are passed as props rather than imported by the flow. That keeps it a plain client
 * component with an injectable seam — a test drives the whole five-step flow against two stubs — and it
 * keeps the `'use server'` module out of the client bundle's import graph except as the two references
 * Next replaces with endpoints.
 *
 * The Crossover Chart Versions are read here, on the server, and handed down whole: the Sails step
 * names a sail by naming a Sail Definition of one of them (ADR 0023), and a client component fetching
 * that would be a spinner between the sailor and a chip row. Every Version travels, not only the one
 * in force — the archive is hand-entered, so most races annotated here were sailed under a chart the
 * boat has since replaced, and `chartInForceOn` is what picks the default from the recording's own
 * start time. A null list is passed as null, because "could not be read" is not "the boat has no
 * chart", and the step says which of the two it is.
 *
 * The Polar, Rig Tune and Instrument Calibration Versions are read here for the same reasons and handed
 * down the same way, for the Review step's other three pointers and the Wind Band (ADR 0012). Two reads
 * rather than one because the chart's list carries the sail vocabulary the Sails step needs, and reading
 * the chart twice would give the flow two lists that could disagree.
 *
 * Both actions re-check the Role anyway. This page decides what to render; a Server Action is a public
 * endpoint and decides for itself.
 */
export default async function RaceUploadPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-performance/upload')

  if (!canWrite(account)) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--page-bg)', padding: spacing(4) }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
          }}
        >
          Only an admin can upload a race
        </h1>
        <p style={{ marginTop: spacing(2), fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Every race in the archive is readable by every signed-in sailor. Adding one is the boat
          owner’s job.
        </p>
      </div>
    )
  }

  const [charts, boatSetup] = await Promise.all([
    readCrossoverChartChoices(),
    readRaceBoatSetupChoices(),
  ])

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <RaceFlow
        mode={{ kind: 'upload', stageRecording, submitRace }}
        charts={charts}
        boatSetup={boatSetup}
      />
    </div>
  )
}

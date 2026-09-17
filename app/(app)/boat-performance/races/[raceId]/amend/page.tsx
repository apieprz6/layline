import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import RaceFlow from '@/components/race-flow/RaceFlow'
import { amendSection } from '@/components/race-flow/sections'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { spacing } from '@/lib/utils/design'
import { readCrossoverChartChoices } from '@/services/boat/readCrossoverChartChoices'
import { readRaceBoatSetupChoices } from '@/services/boat/readRaceBoatSetupChoices'
import { readRaceAmendment } from '@/services/races/readRaceAmendment'

import { amendRace } from '../actions'

export const dynamic = 'force-dynamic'

/**
 * **Amend a race** — the same flow as the upload, entered from the other side of the parse.
 *
 * The component below is `RaceFlow`, the very one `/boat-performance/upload` renders, handed its `amend`
 * mode instead of its `upload` one (ADR 0010 Amendment 1). It is not a parallel form and there is no
 * second set of annotation gestures to drift from the first: the gestures a sailor uses to say when the
 * race started and what was up are the gestures they need to correct those answers. What is absent is the
 * File step, absent because the rows come from a stored Transcription rather than from a parse — which is
 * exactly why the parse boundary is a page and not a step.
 *
 * `?section=` is what makes each chip on the race's page land where the sailor pointed. Parsed through
 * `amendSection`, so a hand-typed or stale value falls back to the window rather than opening a flow with
 * nothing in it — and `file` is not in `AMEND_SECTIONS`, so the one section that could offer to replace a
 * recording is unreachable by URL as well as by button.
 *
 * The Role is asked here and again in the action. A race is a read and every signed-in sailor may open
 * one; amending is a write, so this route is the owner's (ADR 0019). A Guest never gets this far
 * (ADR 0015).
 *
 * Three reads, in parallel, all on the server: the race itself in the shape the flow draws, and the two
 * lists of Boat Setup Versions the sections offer. Every Version travels rather than the one in force
 * now, because a race sailed two summers ago was sailed under a chart the boat has since replaced, and
 * the pointer it records is the one that must stay selected (ADR 0012). A null list is passed as null:
 * "could not be read" is not "the boat has none", and the flow says which of the two it is rather than
 * offering an invented answer.
 *
 * A race that cannot be read *whole* is a 404 rather than a partly-filled flow. Everything here reaches
 * the database through one Save, so a list that came back one entry short would be a list one Save turned
 * into the truth.
 *
 * Nothing on this route can touch the Recording. `readRaceAmendment` reads rows and writes none,
 * `amendRace` has no parameter for one, and `amend_race` names neither `recordings` nor `recording_rows`
 * — so the Transcription and its bytes are unreachable for edit from here, which is the point.
 */
export default async function AmendRacePage({
  params,
  searchParams,
}: {
  params: Promise<{ raceId: string }>
  searchParams: Promise<{ section?: string }>
}): Promise<ReactElement> {
  const [{ raceId }, { section }] = await Promise.all([params, searchParams])
  const account = await resolveAccount()

  // This route, not the tab: a sailor who followed a chip lands back on the section they pressed.
  if (!account) {
    signInFirst(`/boat-performance/races/${raceId}/amend${section ? `?section=${section}` : ''}`)
  }

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
          Only an admin can amend a race
        </h1>
        <p style={{ marginTop: spacing(2), fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Every race in the archive is readable by every signed-in sailor. Correcting what one says is
          the boat owner’s job.
        </p>
      </div>
    )
  }

  const [race, charts, boatSetup] = await Promise.all([
    readRaceAmendment(raceId),
    readCrossoverChartChoices(),
    readRaceBoatSetupChoices(),
  ])

  if (!race) notFound()

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <RaceFlow
        mode={{ kind: 'amend', race, amendRace, section: amendSection(section) }}
        charts={charts}
        boatSetup={boatSetup}
      />
    </div>
  )
}

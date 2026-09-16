import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import RaceDetailView from '@/components/race/RaceDetailView'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readCrossoverChartChoices } from '@/services/boat/readCrossoverChartChoices'
import { readRaceBoatSetupChoices } from '@/services/boat/readRaceBoatSetupChoices'
import { readRace } from '@/services/races/readRace'

import { amendRaceBoatSetup, deleteRace } from './actions'

export const dynamic = 'force-dynamic'

/**
 * One race, open to every signed-in sailor.
 *
 * No Role check on the page itself. Role governs writes only, and a race is a read — the crew that
 * sailed it can open it, and only the owner can add another (ADR 0019). A **Guest** is turned away
 * first, so nothing about the archive reaches a request with no session (ADR 0015).
 *
 * A race that is not there and a race RLS is hiding are the same 404 on purpose: distinguishing them
 * would answer a question about the archive that the reader is not entitled to ask.
 *
 * The two writes on the page are amending the Boat Setup and deleting the race, and those the Role does
 * decide: `canWrite` is what draws either affordance at all. The actions are passed down rather than
 * imported by their panels, matching the upload wizard, and each re-checks the Role itself — a Server
 * Action is a public endpoint, and this page only decides what to render.
 *
 * The Version lists the Boat Setup panel offers are read here, on the server, and only when the panel is
 * going to be drawn: a viewer's page has no reason to read the boat's Version history in order to render
 * nothing with it. Every Version travels, not only the one in force — an amendment is usually a pointer
 * being filled in years late, at a Version the boat has since replaced (ADR 0012). Two reads, because the
 * chart's list carries the sail vocabulary and the other three do not.
 */
export default async function RacePage({
  params,
}: {
  params: Promise<{ raceId: string }>
}): Promise<ReactElement> {
  const { raceId } = await params
  const account = await resolveAccount()

  // This race, not the tab: a sailor sent a link to one race lands on it after signing in.
  if (!account) signInFirst(`/boat-performance/races/${raceId}`)

  const race = await readRace(raceId)

  if (!race) notFound()

  const mayWrite = canWrite(account)

  const [boatSetupChoices, charts] = mayWrite
    ? await Promise.all([readRaceBoatSetupChoices(), readCrossoverChartChoices()])
    : [null, null]

  return (
    <RaceDetailView
      race={race}
      canWrite={mayWrite}
      boatSetupChoices={boatSetupChoices}
      charts={charts}
      amendBoatSetup={amendRaceBoatSetup}
      deleteRace={deleteRace}
    />
  )
}

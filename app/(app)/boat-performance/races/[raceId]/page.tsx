import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import RaceDetailView from '@/components/race/RaceDetailView'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { seasonTrace } from '@/services/analysis/polar-plot'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { readRace } from '@/services/races/readRace'

import { deleteRace } from './actions'

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
 * The one write on the page is the delete, and that the Role does decide: `canDelete` is what draws
 * the affordance at all. The action is passed down rather than imported by the panel, matching the
 * upload wizard, and it re-checks the Role itself — a Server Action is a public endpoint, and this
 * page only decides what to render.
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

  // Together: the season behind this Race's Polar Plot waits on no part of the Race. An archive
  // that cannot be read costs the trace and nothing else — the race is still true without it.
  const [race, archive] = await Promise.all([readRace(raceId), readAnalysisArchive()])

  if (!race) notFound()

  const writable = canWrite(account)

  return (
    <RaceDetailView
      race={race}
      canDelete={writable}
      canAmend={writable}
      deleteRace={deleteRace}
      season={archive === null ? null : seasonTrace(archive.rows)}
    />
  )
}

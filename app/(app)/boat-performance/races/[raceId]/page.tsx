import { notFound } from 'next/navigation'
import type { ReactElement } from 'react'
import RaceDetailView from '@/components/race/RaceDetailView'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readRace } from '@/services/races/readRace'

export const dynamic = 'force-dynamic'

/**
 * One race, open to every signed-in sailor.
 *
 * No Role check. Role governs writes only, and a race is a read — the crew that sailed it can open it,
 * and only the owner can add another (ADR 0019). A **Guest** is turned away first, so nothing about
 * the archive reaches a request with no session (ADR 0015).
 *
 * A race that is not there and a race RLS is hiding are the same 404 on purpose: distinguishing them
 * would answer a question about the archive that the reader is not entitled to ask.
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

  return <RaceDetailView race={race} />
}

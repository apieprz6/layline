import type { ReactElement } from 'react'
import CrossoverChartVersionContent from '@/components/boat/CrossoverChartVersionContent'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readCrossoverChartVersion } from '@/services/boat/readCrossoverChartVersions'

export const dynamic = 'force-dynamic'

interface CrossoverChartVersionPageProps {
  /** Next 16 hands params as a promise. */
  params: Promise<{ versionId: string }>
}

/**
 * One **Crossover Chart Version**, at its own address, so a Version can be linked to and come back
 * the same.
 *
 * No `canWrite`: there is nothing to write here. A Crossover Chart Version is immutable once
 * recorded — the way to change the boat's sail choices is to upload the next pair of files — so this
 * screen has no editor for an admin to be shown and no affordance a viewer is missing.
 */
export default async function CrossoverChartVersionPage({
  params,
}: CrossoverChartVersionPageProps): Promise<ReactElement> {
  const account = await resolveAccount()

  const { versionId } = await params

  if (!account) signInFirst(`/boat-management/crossover-chart/${versionId}`)

  const version = await readCrossoverChartVersion(versionId)

  return <CrossoverChartVersionContent version={version} />
}

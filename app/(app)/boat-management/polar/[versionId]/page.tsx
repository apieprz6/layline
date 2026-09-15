import type { ReactElement } from 'react'
import PolarVersionContent from '@/components/boat/PolarVersionContent'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readPolarVersion } from '@/services/boat/readPolarVersions'

export const dynamic = 'force-dynamic'

interface PolarVersionPageProps {
  /** Next 16 hands params as a promise. */
  params: Promise<{ versionId: string }>
}

/**
 * One **Polar Version**, at its own address, so a Version can be linked to and come back the same.
 *
 * No `canWrite`: there is nothing to write here. A Polar Version is immutable once recorded — the
 * way to change the boat's polar is to upload the next one — so this screen has no editor for an
 * admin to be shown and no affordance a viewer is missing.
 */
export default async function PolarVersionPage({
  params,
}: PolarVersionPageProps): Promise<ReactElement> {
  const account = await resolveAccount()

  const { versionId } = await params

  if (!account) signInFirst(`/boat-management/polar/${versionId}`)

  const version = await readPolarVersion(versionId)

  return <PolarVersionContent version={version} />
}

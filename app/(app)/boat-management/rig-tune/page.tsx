import type { ReactElement } from 'react'
import RigTuneContent from '@/components/boat/rig/RigTuneContent'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readRigTune } from '@/services/boat/readRigTune'

export const dynamic = 'force-dynamic'

interface RigTunePageProps {
  /** A promise in Next 16 — a page reads its query only by awaiting it. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * **Rig Tune** — the band table the boat is set to, and every Version of it.
 *
 * Signed-in only, and only that: a **Guest** who deep-links here is sent back to the
 * dashboard with the **Auth Sheet** open and this route remembered, so nothing about the
 * boat's rig — including that it has one recorded — reaches someone who is not signed in
 * (ADR 0015). Every signed-in sailor reads every Version; only an admin mints one (ADR 0019).
 */
export default async function RigTunePage({ searchParams }: RigTunePageProps): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-management/rig-tune')

  // Read only after the Guest has been turned away, so a signed-out request costs nothing
  // and reveals nothing.
  const [query, page] = await Promise.all([searchParams, readRigTune()])

  return (
    <RigTuneContent
      page={page}
      canWrite={canWrite(account)}
      requestedVersion={readVersionNumber(query.version)}
      readerId={account.userId}
    />
  )
}

/**
 * `?version=2` → `2`. Anything else is no request at all, which shows the Version in force.
 *
 * A query is a view, not a value: a crafted one names a Version that either exists or does
 * not, and either way nothing here is written and nothing invented.
 */
function readVersionNumber(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null

  const asked = Number(raw)
  if (!Number.isInteger(asked) || asked < 1) return null

  return asked
}

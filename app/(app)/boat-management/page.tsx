import { Suspense, type ReactElement } from 'react'
import BoatManagementContent from '@/components/boat/BoatManagementContent'
import BoatManagementSkeleton from '@/components/boat/BoatManagementSkeleton'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readBoatSetup } from '@/services/boat/readBoatSetup'

export const dynamic = 'force-dynamic'

/**
 * **Boat management** — a signed-in screen, and only that.
 *
 * There is no signed-out form of it: not a locked one, not a placeholder one. A
 * **Guest** who deep-links here is sent back to the dashboard with the **Auth
 * Sheet** open and this route remembered, so nothing about the boat — including
 * that it has a name — is ever served to someone who is not signed in (ADR 0015).
 *
 * This is the *second* `resolveAccount()` of the request — the group layout made
 * the first, for the drawer. ADR 0018 put one resolve site in that layout and
 * passed the Account down as a prop, but a Next layout cannot pass props to a
 * page, and this decision is the page's own: it either serves this screen or it
 * serves nobody, and only the server can decide that. The duplicate costs a JWT
 * verification and one small `profiles` read. Wrapping the resolver in React's
 * `cache()` would collapse the two, and is deliberately not done here — it would
 * change the one function every auth decision in the app runs through, on a ticket
 * about navigation.
 *
 * The skeleton is a `<Suspense>` boundary *here*, below the guard, rather than a
 * `loading.tsx` beside this file. A `loading.tsx` is a boundary above the page, and the
 * page's first `await` is the auth resolve — so it would flush a placeholder of this
 * screen to a Guest and turn their redirect into a client-side one, which is the
 * signed-out rendering this page exists not to have (LAY-132).
 */
export default async function BoatManagementPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-management')

  return (
    <Suspense fallback={<BoatManagementSkeleton />}>
      <BoatSetupScreen canWrite={canWrite(account)} />
    </Suspense>
  )
}

/**
 * The read, behind the boundary.
 *
 * Reached only once the guard above has let the request through, so a signed-out request
 * still costs nothing and reveals nothing — not even that the boat has a name.
 *
 * Not named `BoatSetup`: that is the four artifacts (ADR 0012) and the type
 * `readBoatSetup()` returns, and this is the screen around them.
 */
async function BoatSetupScreen({
  canWrite: writable,
}: {
  canWrite: boolean
}): Promise<ReactElement> {
  const page = await readBoatSetup()

  return <BoatManagementContent page={page} canWrite={writable} />
}

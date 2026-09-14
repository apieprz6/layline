import type { ReactElement } from 'react'
import BoatManagementContent from '@/components/boat/BoatManagementContent'
import LockedBoatScreen from '@/components/boat/LockedBoatScreen'
import { resolveAccount } from '@/lib/account/resolveAccount'

export const dynamic = 'force-dynamic'

/**
 * **Boat management** — locked for a **Guest**, open for a signed-in sailor.
 *
 * The route renders for everyone. A guest who deep-links here gets the locked
 * screen with its invitation, not a 404 and not a redirect to a login page, which
 * ADR 0004 declined and ADR 0015 forbids outright.
 *
 * This is the *second* `resolveAccount()` of the request — the group layout made
 * the first, for the drawer. ADR 0018 put one resolve site in that layout and
 * passed the Account down as a prop, but a Next layout cannot pass props to a
 * page, and this decision is the page's own: only the server can make it, because
 * ADR 0018 also observed that a client provider "cannot unlock a screen". The
 * duplicate costs a local JWT verification against a cached JWKS and one small
 * `profiles` read. Wrapping the resolver in React's `cache()` would collapse the
 * two, and is deliberately not done here — it would change the one function every
 * auth decision in the app runs through, on a ticket about navigation.
 */
export default async function BoatManagementPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) {
    return (
      <LockedBoatScreen
        title="Boat management"
        invitation="Sign in to read how this boat is set up."
      />
    )
  }

  return <BoatManagementContent />
}

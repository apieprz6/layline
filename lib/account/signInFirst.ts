import { redirect } from 'next/navigation'

/**
 * Sends a **Guest** away from a route that has no signed-out form, to the
 * dashboard with the **Auth Sheet** open and `route` remembered as where signing
 * in should land.
 *
 * There is no signed-out version of the boat screens — not a locked one, not a
 * partial one — so a **Guest** who deep-links to one is not served a page at all
 * (ADR 0015). The drawer is where the offer lives, and this puts the sailor in
 * front of the same offer with their destination kept, so the trip they started
 * still finishes where they aimed it.
 *
 * The value is read back through `relativePathOrHome`, so a crafted `?signin=`
 * cannot name another origin.
 */
export function signInFirst(route: string): never {
  redirect(`/?signin=${encodeURIComponent(route)}`)
}

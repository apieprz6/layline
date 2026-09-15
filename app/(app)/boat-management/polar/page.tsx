import type { ReactElement } from 'react'
import PolarContent from '@/components/boat/PolarContent'
import { canWrite } from '@/lib/account/canWrite'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { signInFirst } from '@/lib/account/signInFirst'
import { readPolarScreen } from '@/services/boat/readPolarVersions'

export const dynamic = 'force-dynamic'

/**
 * The **Polar** screen — a signed-in screen, and only that.
 *
 * A **Guest** who deep-links here is sent to the dashboard with the **Auth Sheet** open and this
 * route remembered, the same as `/boat-management` itself. The ticket calls this "the locked
 * screen", which was ADR 0015's original shape; LAY-104 replaced it with `signInFirst()` on the
 * grounds that a locked screen still serves the fact that there is a boat, and this page follows
 * its sibling rather than reintroducing the older one.
 *
 * A signed-in non-admin gets the whole screen bar the upload panel. Role governs writes only
 * (ADR 0019), so every Version is readable and every file downloadable by anyone signed in.
 */
export default async function PolarPage(): Promise<ReactElement> {
  const account = await resolveAccount()

  if (!account) signInFirst('/boat-management/polar')

  // The grid in force needs the payload, which the list deliberately does not carry — so the
  // screen is one list plus one grid, rather than every grid to render a list of names. Both come
  // off a single read of the artifact that holds the pointer.
  const screen = await readPolarScreen()

  return (
    <PolarContent
      list={screen?.list ?? null}
      current={screen?.current ?? null}
      canWrite={canWrite(account)}
    />
  )
}

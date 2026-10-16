import type { ReactNode } from 'react'
import AppLayout from '@/components/dashboard/AppLayout'
import { resolveAccount } from '@/lib/account/resolveAccount'
import { readBoatHeaderIdentity } from '@/services/boat/readBoatHeaderIdentity'

/**
 * Layout for the routes that carry the app chrome — `/`, `/wind-data`,
 * `/boat-management`, `/boat-performance` and `/settings`. The route group keeps
 * every one of those URLs unchanged.
 *
 * This is the one place the **Account** is resolved (ADR 0018): a Server
 * Component verifying the JWT locally with `getClaims()` and reading the **Role**
 * from `profiles`, then handing the result down as a prop. Reading cookies makes
 * every route in the group dynamic, which costs `/settings` the static render it
 * was the only page to have.
 *
 * The boat the header names is read here too, and only once there is an Account: a
 * **Guest** costs no read and is served no name (ADR 0015, amended by LAY-180).
 *
 * `/station/[buoyId]` stays outside the group; `StationLayout` supplies its own
 * header and dock, and nothing on a station screen is gated.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const account = await resolveAccount()
  const boat = account ? await readBoatHeaderIdentity() : null

  return (
    <AppLayout account={account} boat={boat}>
      {children}
    </AppLayout>
  )
}

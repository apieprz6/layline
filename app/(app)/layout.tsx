import type { ReactNode } from 'react'
import AppLayout from '@/components/dashboard/AppLayout'
import { resolveAccount } from '@/lib/account/resolveAccount'

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
 * `/station/[buoyId]` stays outside the group; `StationLayout` supplies its own
 * header and dock, and nothing on a station screen is gated.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const account = await resolveAccount()

  return <AppLayout account={account}>{children}</AppLayout>
}

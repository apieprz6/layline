import type { ReactNode } from 'react'
import AppLayout from '@/components/dashboard/AppLayout'

/**
 * Layout for the routes that carry the app chrome — `/`, `/wind-data` and
 * `/settings`. The route group keeps every one of those URLs unchanged.
 *
 * Structural only for now: it resolves no Account and reads no cookies. ADR 0018
 * adds that resolve here, so the chrome has one mount point to receive it.
 * `/station/[buoyId]` stays outside the group; `StationLayout` supplies its own
 * header and dock, and nothing on a station screen is gated.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>
}

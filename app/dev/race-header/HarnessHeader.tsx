'use client'

import type { ReactElement } from 'react'
import RaceHeader from '@/components/dashboard/RaceHeader'

/** Long enough to overrun a 390px header by a wide margin. */
const LONG_BOAT_NAME = 'Handsome Pete the Magnificent of Monroe Harbor'

/**
 * The header as the `(app)` layout's `AppLayout` mounts it — hamburger included, since it is part
 * of what the name has to share the row with. A client island because the menu handler is a
 * function, which a Server Component cannot hand across.
 */
export default function HarnessHeader(): ReactElement {
  return (
    <RaceHeader onOpenMenu={() => {}} boat={{ name: LONG_BOAT_NAME, iconUpdatedAt: null }} />
  )
}

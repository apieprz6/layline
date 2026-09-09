/**
 * PROTOTYPE ROUTE — throwaway. See ./README.md.
 *
 * /prototype/boat?variant=A&viewer=admin
 *
 * Answers LAY-95: what the boat sections look like before an analysis engine
 * exists, and what a Guest sees where they would be. Nothing here is production
 * code, no data is real, and no write does anything.
 */

import { Suspense } from 'react'
import AppLayout from '@/components/dashboard/AppLayout'
import PrototypeBoat from './PrototypeBoat'

export default function BoatPrototypePage() {
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <PrototypeBoat />
      </Suspense>
    </AppLayout>
  )
}

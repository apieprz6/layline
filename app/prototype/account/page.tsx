/**
 * PROTOTYPE ROUTE — throwaway. See ./README.md.
 *
 * /prototype/account?variant=A&account=guest
 *
 * Answers LAY-119: what the drawer's account block looks like signed out and
 * signed in (including the null Display Name case), and what the Auth Sheet
 * becomes now that ADR 0020 left one button on it. Real chrome and the real
 * LiveWindCard sit behind the drawer on purpose. Nothing here is production
 * code, nobody is really signed in, and no button does anything.
 */

import { Suspense } from 'react'
import LiveWindCard from '@/components/dashboard/LiveWindCard'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'
import PrototypeAccount from './PrototypeAccount'

export const dynamic = 'force-dynamic'

export default async function AccountPrototypePage() {
  const buoyData = await Promise.all([fetchCHII2(), fetchPurdueBuoy()])

  return (
    <Suspense fallback={null}>
      <PrototypeAccount>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          <LiveWindCard buoys={buoyData} />
        </div>
      </PrototypeAccount>
    </Suspense>
  )
}

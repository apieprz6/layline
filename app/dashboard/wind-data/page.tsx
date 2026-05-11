import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import WindDataContent from '@/components/dashboard/WindDataContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

export const dynamic = 'force-dynamic'

export default async function WindDataPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch live buoy data directly from services (uses internal cache)
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  const buoyData = [chii2Result, purdueResult]

  return (
    <DashboardLayout>
      <WindDataContent buoys={buoyData} />
    </DashboardLayout>
  )
}

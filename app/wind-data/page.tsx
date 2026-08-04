import AppLayout from '@/components/dashboard/AppLayout'
import WindDataContent from '@/components/dashboard/WindDataContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

export const dynamic = 'force-dynamic'

export default async function WindDataPage() {
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  const buoyData = [chii2Result, purdueResult]

  return (
    <AppLayout>
      <WindDataContent buoys={buoyData} />
    </AppLayout>
  )
}

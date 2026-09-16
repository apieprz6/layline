import WindDataContent from '@/components/dashboard/WindDataContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

// Buoy freshness window, matching the buoy service's own. Wherever Supabase is
// configured the parent layout reads cookies and this route renders per request
// anyway, so the Data Cache — not this export — is what keeps a repeated visit
// off NDBC. It states the same window for the prerender a keyless checkout gets.
export const revalidate = 300

export default async function WindDataPage() {
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  const buoyData = [chii2Result, purdueResult]

  return <WindDataContent buoys={buoyData} />
}

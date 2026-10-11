import WindDataContent from '@/components/dashboard/WindDataContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

// Buoy freshness window, matching the buoy service's own. The parent layout reads
// cookies, so this route renders per request and the Data Cache — not this export —
// is what keeps a repeated visit off NDBC. It is here so the freshness the screen
// actually offers is stated where a reader of the page will look for it.
export const revalidate = 300

export default async function WindDataPage() {
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  const buoyData = [chii2Result, purdueResult]

  return <WindDataContent buoys={buoyData} />
}

import AppLayout from '@/components/dashboard/AppLayout'
import WindDataContent from '@/components/dashboard/WindDataContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

export const dynamic = 'force-dynamic'

export default async function WindDataPage() {
  // Fetch live buoy data directly from services (uses internal cache)
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  const buoyData = [chii2Result, purdueResult]

  // Mock race time - Wednesday 7:00 PM
  function getNextRaceTime(): Date {
    // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
    const now = Date.now()
    const raceTime = new Date()
    raceTime.setHours(19, 0, 0, 0)
    if (raceTime.getTime() < now) {
      raceTime.setDate(raceTime.getDate() + 7)
    }
    return raceTime
  }
  const raceTime = getNextRaceTime()

  // Get current wind from first available buoy
  const currentWind = {
    speed: chii2Result.data?.windSpeed || purdueResult.data?.windSpeed || 12,
    direction: chii2Result.data?.windDirection || purdueResult.data?.windDirection || 245,
  }

  return (
    <AppLayout raceTime={raceTime} currentWind={currentWind}>
      <WindDataContent buoys={buoyData} />
    </AppLayout>
  )
}

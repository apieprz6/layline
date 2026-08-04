import AppLayout from '@/components/dashboard/AppLayout'
import SettingsContent from './SettingsContent'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
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
  const currentWind = { speed: 0, direction: 0 }

  return (
    <AppLayout raceTime={raceTime} currentWind={currentWind}>
      <SettingsContent />
    </AppLayout>
  )
}

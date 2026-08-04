import AppLayout from '@/components/dashboard/AppLayout'
import SettingsContent from './SettingsContent'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

export const dynamic = 'force-dynamic'

const STALENESS_THRESHOLD_MS = 25 * 60 * 1000

export default async function SettingsPage() {
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])

  // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
  const now = Date.now()
  const preferred = purdueResult.data ?? chii2Result.data
  let currentWind: { speed: number; direction: number } | null = null
  if (preferred) {
    const age = now - new Date(preferred.timestamp).getTime()
    if (age <= STALENESS_THRESHOLD_MS) {
      currentWind = { speed: preferred.windSpeed, direction: preferred.windDirection }
    }
  }

  return (
    <AppLayout currentWind={currentWind}>
      <SettingsContent />
    </AppLayout>
  )
}

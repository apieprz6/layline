import AppLayout from '@/components/dashboard/AppLayout'
import WindCard from '@/components/dashboard/WindCard'
import ForecastChart from '@/components/dashboard/ForecastChart'
import TacticalBriefing from '@/components/dashboard/TacticalBriefing'
import RigRecommendation from '@/components/dashboard/RigRecommendation'
import ModelComparison from '@/components/dashboard/ModelComparison'
import LiveWindCard from '@/components/dashboard/LiveWindCard'
import { fetchCHII2, fetchPurdueBuoy } from '@/services/buoys/ndbc'

export const dynamic = 'force-dynamic'

const SHOW_CURRENT_WIND_CARD = false
const SHOW_RACE_BRIEFING = false
const SHOW_WIND_FORECAST = false
const SHOW_MODEL_COMPARISON = false
const SHOW_RIG_SETUP = false

const STALENESS_THRESHOLD_MS = 25 * 60 * 1000

export default async function DashboardPage() {
  const [chii2Result, purdueResult] = await Promise.all([
    fetchCHII2(),
    fetchPurdueBuoy(),
  ])
  const buoyData = [chii2Result, purdueResult]

  // eslint-disable-next-line react-hooks/purity -- Server Component with force-dynamic, re-renders on every request
  const now = Date.now()

  function getHeaderWind(): { speed: number; direction: number } | null {
    // Prefer Purdue buoy, fall back to Harrison Dever
    const preferred = purdueResult.data ?? chii2Result.data
    if (!preferred) return null

    const age = now - new Date(preferred.timestamp).getTime()
    if (age > STALENESS_THRESHOLD_MS) return null

    return { speed: preferred.windSpeed, direction: preferred.windDirection }
  }

  const currentWind = getHeaderWind()

  const forecastData = [
    { time: '17:00', speed: 10, direction: 240, gust: 13 },
    { time: '18:00', speed: 12, direction: 245, gust: 15 },
    { time: '19:00', speed: 14, direction: 248, gust: 17, isRaceTime: true },
    { time: '20:00', speed: 16, direction: 255, gust: 20 },
    { time: '21:00', speed: 17, direction: 260, gust: 22 },
    { time: '22:00', speed: 14, direction: 258, gust: 17 },
  ]

  const models = [
    { name: 'NAM', speed: 14, direction: 248, gust: 17 },
    { name: 'HRRR', speed: 12, direction: 242, gust: 15 },
    { name: 'GFS', speed: 16, direction: 255, gust: 20 },
    { name: 'ICON', speed: 15, direction: 250, gust: 18 },
    { name: 'MBLUE', speed: 13, direction: 252, gust: 16 },
    { name: 'HRDPS', speed: 14, direction: 247, gust: 17 },
  ]

  const briefing = `We're seeing a WSW flow building through the evening as a frontal system approaches from the west. Models converge on 14–16 kts at race time with a gradual veer expected.

Start strategy: Port tack lift out of the pin looks favorable. The left side of the course should pay as the wind backs 10–15° in the first 20 minutes.

Watch for: Increased pressure on the right after 19:30. GFS shows 18+ kts developing, while NAM/HRRR stay moderate. If you see sustained building, consider getting to the right side upwind.

Rig for medium air initially. Keep reef lines ready if gusts exceed 18 kts.`

  const rigRecommendations = [
    'Full main, standard jib — no reef needed',
    'Moderate backstay tension for 12–15 kts range',
    'Outhaul pulled to medium stripe',
    'Vang: light-to-moderate — ease for the puffs',
    'Consider cunningham if gusts hit 18+',
  ]

  return (
    <AppLayout currentWind={currentWind}>
      <div className="p-4 space-y-4">
        {SHOW_CURRENT_WIND_CARD && (
          <WindCard
            current={{ speed: 12, direction: 245, gust: 15 }}
            forecast={{ speed: 14, direction: 248 }}
          />
        )}

        <LiveWindCard buoys={buoyData} />

        {SHOW_RACE_BRIEFING && (
          <TacticalBriefing
            briefing={briefing}
            generatedAt={new Date()}
          />
        )}

        {SHOW_WIND_FORECAST && (
          <ForecastChart data={forecastData} />
        )}

        {SHOW_MODEL_COMPARISON && (
          <ModelComparison models={models} />
        )}

        {SHOW_RIG_SETUP && (
          <RigRecommendation
            condition="medium"
            windSpeed={14}
            recommendations={rigRecommendations}
          />
        )}
      </div>
    </AppLayout>
  )
}

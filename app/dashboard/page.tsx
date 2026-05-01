import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import RaceHeader from '@/components/dashboard/RaceHeader'
import WindCard from '@/components/dashboard/WindCard'
import ForecastChart from '@/components/dashboard/ForecastChart'
import TacticalBriefing from '@/components/dashboard/TacticalBriefing'
import RigRecommendation from '@/components/dashboard/RigRecommendation'
import ModelComparison from '@/components/dashboard/ModelComparison'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Mock race time - Wednesday 7:00 PM
  const raceTime = new Date()
  raceTime.setHours(19, 0, 0, 0)
  if (raceTime.getTime() < Date.now()) {
    raceTime.setDate(raceTime.getDate() + 7)
  }

  // Mock data - in production, this would come from your API
  const currentWind = {
    speed: 12,
    direction: 245,
    gust: 15
  }

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
    <DashboardLayout>
      <RaceHeader raceTime={raceTime} currentWind={currentWind} />

      <div className="p-4 space-y-4">
        {/* Current Wind */}
        <WindCard
          current={currentWind}
          forecast={{ speed: 14, direction: 248 }}
        />

        {/* Tactical Briefing */}
        <TacticalBriefing
          briefing={briefing}
          generatedAt={new Date()}
        />

        {/* Wind Forecast Timeline */}
        <ForecastChart data={forecastData} />

        {/* Model Comparison */}
        <ModelComparison models={models} />

        {/* Rig Recommendation */}
        <RigRecommendation
          condition="medium"
          windSpeed={14}
          recommendations={rigRecommendations}
        />
      </div>
    </DashboardLayout>
  )
}

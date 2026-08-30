import Anthropic from '@anthropic-ai/sdk'
import type { WindForecast, BuoyData, RaceBriefing } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface RaceAnalysisInput {
  windForecasts: WindForecast[]
  buoyData: BuoyData[]
  location: string
  /**
   * Optional Target Time the sailor has anchored the forecast to (ISO 8601).
   * Omit for a current-conditions briefing — Layline assumes no schedule.
   */
  targetTime?: string
}

export async function generateRaceBriefing(
  input: RaceAnalysisInput
): Promise<RaceBriefing> {
  const occasion = input.targetTime
    ? `The sailor has anchored this briefing to ${input.targetTime}. Reason about the conditions expected at that specific time — do not assume any particular day of the week or start time beyond what is given.`
    : `No target time was given. Brief on current and near-term conditions, and state plainly how far ahead your advice holds.`

  const prompt = `You are an expert sailing tactician analyzing weather data for a recreational competitive PHRF fleet racing on Lake Michigan. The occasion could be a weeknight series race, a weekend regatta, or a distance race — reason from the conditions and the time being asked about, not from an assumed schedule.

Venue: ${input.location}
The COLYC Race Circle sits roughly 2.5nm offshore of Navy Pier in an urban lakefront setting. Shoreline thermals matter: on warm afternoons a lake breeze can fill from the E/NE and override a light gradient, and wind often goes lighter and shiftier toward sunset as thermal forcing collapses.

${occasion}

Wind Forecasts (from multiple sources):
${JSON.stringify(input.windForecasts, null, 2)}

Live Buoy Data:
${JSON.stringify(input.buoyData, null, 2)}

Based on this data, provide a comprehensive race strategy briefing including:

1. **Course Recommendation**: Which course will likely be set (windward-leeward, triangle, etc.) and why
2. **Rig Setup**: Should we tune for light/medium/heavy air? Specific backstay, cunningham, outhaul settings
3. **Sail Trim**: Guidance for jib and main trimmers based on expected conditions
4. **Tactical Advice**:
   - Expected wind shifts and timing
   - Which side of the course to favor
   - Sea state impact on boat speed and sail shape
5. **Key Insights**: Any specific conditions or opportunities to watch for

Format your response as JSON matching this structure:
{
  "courseRecommendations": [{"courseName": string, "probability": number, "reasoning": string}],
  "rigSetup": {"tension": string, "backstay": string, "cunningham": string, "outhaul": string, "reasoning": string},
  "sailTrim": {"conditions": string, "jibSheet": string, "mainSheet": string, "traveler": string, "vangTension": string, "reasoning": string},
  "tactical": {"windShiftExpected": boolean, "shiftTiming": string, "favoredSide": string, "seaStateImpact": string, "strategyNotes": string[]},
  "rawDataSummary": string,
  "confidence": number
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  // Parse the JSON response
  const analysisText = content.text
  const jsonMatch = analysisText.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response')
  }

  const analysis = JSON.parse(jsonMatch[0])

  return {
    generatedAt: new Date().toISOString(),
    targetTime: input.targetTime ?? null,
    ...analysis,
  }
}

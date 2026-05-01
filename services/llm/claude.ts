import Anthropic from '@anthropic-ai/sdk'
import type { WindForecast, BuoyData, RaceBriefing } from '@/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface RaceAnalysisInput {
  windForecasts: WindForecast[]
  buoyData: BuoyData[]
  raceDate: string
  raceTime: string
  location: string
}

export async function generateRaceBriefing(
  input: RaceAnalysisInput
): Promise<RaceBriefing> {
  const prompt = `You are an expert sailing tactician analyzing weather data for a Wednesday night beer can regatta.

Race Details:
- Date: ${input.raceDate}
- Time: ${input.raceTime}
- Location: ${input.location}

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
    raceDate: input.raceDate,
    ...analysis,
  }
}

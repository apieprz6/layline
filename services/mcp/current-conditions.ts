import { buoyMetadata } from '@/services/buoys/ndbc'
import { formatRelativeTime } from '@/lib/utils/timeFormatting'
import { getStationInfo } from '@/lib/config/stations'
import type {
  BuoyDataResult,
  CurrentConditionsAnswer,
  McpStationOutOfSeason,
  McpStationReading,
} from '@/types'

export const OUT_OF_SEASON_NOTE =
  'The Purdue Buoy is deployed May through October and is out of the water now. It is not late; there is no reading to report until it returns.'

interface CurrentConditionsInput {
  /** `fetchCHII2()`'s result, the one the dashboard's Live Wind card renders. */
  chii2: BuoyDataResult
  /** `fetchPurdueBuoy()`'s result, likewise. */
  purdue: BuoyDataResult
  now: Date
  /** `isPurdueSeason()`, passed in so a test can be in January. */
  purdueInSeason: boolean
}

/** The Station Row's own name for it, so Claude calls a station what the screen does. */
export function stationName(station: 'CHII2' | '45198'): string {
  return getStationInfo(station)?.name ?? station
}

function stationReading(station: 'CHII2' | '45198', result: BuoyDataResult, now: Date): McpStationReading {
  const metadata = buoyMetadata(station)
  const data = result.data

  return {
    station,
    name: stationName(station),
    seasonal: station === '45198',
    dataStatus: result.status,
    observedAt: data?.timestamp ?? null,
    fetchedAt: result.fetchedAt,
    staleness: data
      ? {
          minutes: Math.floor((now.getTime() - new Date(data.timestamp).getTime()) / 60000),
          label: formatRelativeTime(data.timestamp, now.getTime()),
        }
      : null,
    // Exactly the figures the Station Row prints. CHII2's stays the 85 ft reading: the height
    // and the note travel beside it, and nothing here works out a surface figure (ADR 0008).
    wind: data ? { speedKnots: data.windSpeed, directionDegreesTrue: data.windDirection } : null,
    ...(result.error && !data ? { fetchError: result.error } : {}),
    anemometerHeightFeet: metadata.windMeasurementHeight,
    ...(metadata.adjustmentNote ? { note: metadata.adjustmentNote } : {}),
  }
}

/**
 * **Current Conditions** as the dashboard states them, for the MCP `current_conditions` tool.
 *
 * Pure: the caller hands in the same cached buoy results the dashboard renders, so the tool
 * makes no upstream call of its own and cannot disagree with the screen (ADR 0042).
 *
 * Out of season with nothing to show, Purdue is reported as seasonal rather than as a station
 * with a missing number. In season, a failed read stays a failure: `wind: null` beside its
 * Data Status, never a figure in its place.
 */
export function currentConditions({
  chii2,
  purdue,
  now,
  purdueInSeason,
}: CurrentConditionsInput): CurrentConditionsAnswer {
  const purdueAnswer: McpStationReading | McpStationOutOfSeason =
    !purdueInSeason && !purdue.data
      ? {
          station: '45198',
          name: stationName('45198'),
          seasonal: true,
          dataStatus: purdue.status,
          note: OUT_OF_SEASON_NOTE,
        }
      : stationReading('45198', purdue, now)

  return { stations: [stationReading('CHII2', chii2, now), purdueAnswer] }
}

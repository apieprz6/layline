import { render, screen } from '@testing-library/react'
import { buoyHistory as answerFor } from '../buoy-history'
import { buoyMetadata } from '@/services/buoys/ndbc'
import { formatRelativeTime } from '@/lib/utils/timeFormatting'
import { TIME_SCALES, withMinutesAgo } from '@/lib/utils/windowing'
import StationStatsPanel from '@/components/dashboard/StationStatsPanel'
import type { BuoyHistoryData, McpStationHistory, WindDataPoint } from '@/types'

/** The answer for a station that has a history to state, which every case but out-of-season is. */
function buoyHistory(input: Parameters<typeof answerFor>[0]): McpStationHistory {
  const answer = answerFor(input)
  if (!('readings' in answer)) throw new Error('expected a history, got an out-of-season answer')
  return answer
}

const NOW = new Date('2026-07-15T23:12:00Z')

function history(buoyId: 'CHII2' | '45198', points: WindDataPoint[] | null): BuoyHistoryData {
  return {
    buoyId,
    name: buoyId === 'CHII2' ? 'Harrison Dever Crib' : 'Purdue Buoy',
    history: points,
    status: 'online',
    fetchedAt: '2026-07-15T23:10:00.000Z',
    metadata: buoyMetadata(buoyId),
  }
}

/** CHII2 as NDBC realtime2 reports it: newest first, every ten minutes, gust nullable. */
const CHII2_POINTS: WindDataPoint[] = [
  { timestamp: '2026-07-15T23:00:00.000Z', spd: 17.3, dir: 245, gust: 21.0 },
  { timestamp: '2026-07-15T22:50:00.000Z', spd: 16.1, dir: 240, gust: null },
  { timestamp: '2026-07-15T22:40:00.000Z', spd: 15.2, dir: 238, gust: 19.4 },
  { timestamp: '2026-07-15T22:30:00.000Z', spd: 14.0, dir: 232, gust: 18.1 },
  // 82 minutes old: inside the 6h window, outside the station page's default "Last hour".
  { timestamp: '2026-07-15T21:50:00.000Z', spd: 9.8, dir: 210, gust: 12.5 },
]

/** Purdue from Supabase: waves carried, period and direction too, though the page shows neither. */
const PURDUE_POINTS: WindDataPoint[] = [
  { timestamp: '2026-07-15T23:00:00.000Z', spd: 11.8, dir: 230, gust: 14.2, waveHeight: null, wavePeriod: 4, waveDir: 210 },
  { timestamp: '2026-07-15T22:50:00.000Z', spd: 11.2, dir: 228, gust: 13.9, waveHeight: 2.1, wavePeriod: 4, waveDir: 212 },
]

describe('buoyHistory', () => {
  it("states CHII2's readings in the window as recorded, newest first, with its 85 ft elevation", () => {
    const answer = buoyHistory({
      station: 'CHII2',
      history: history('CHII2', CHII2_POINTS),
      window: '1h',
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer).toMatchObject({
      station: 'CHII2',
      name: 'Harrison Dever Crib',
      seasonal: false,
      dataStatus: 'online',
      fetchedAt: '2026-07-15T23:10:00.000Z',
      latestObservedAt: '2026-07-15T23:00:00.000Z',
      // The Station Row's own age formatter, so the tool and the screen print the same "12m ago".
      staleness: { label: formatRelativeTime('2026-07-15T23:00:00.000Z', NOW.getTime()) },
      window: { id: '1h', label: TIME_SCALES['1h'].label },
      anemometerHeightFeet: 85,
      note: 'Wind at this height typically reads 20–30% higher than at the surface.',
    })
    expect(answer.readings).toEqual([
      { observedAt: '2026-07-15T23:00:00.000Z', speedKnots: 17.3, directionDegreesTrue: 245, gustKnots: 21.0 },
      { observedAt: '2026-07-15T22:50:00.000Z', speedKnots: 16.1, directionDegreesTrue: 240, gustKnots: null },
      { observedAt: '2026-07-15T22:40:00.000Z', speedKnots: 15.2, directionDegreesTrue: 238, gustKnots: 19.4 },
      { observedAt: '2026-07-15T22:30:00.000Z', speedKnots: 14.0, directionDegreesTrue: 232, gustKnots: 18.1 },
    ])
  })

  it.each(['1h', '6h', '24h', '72h'] as const)(
    'states the Stats panel the station page prints for the %s window, labelled derived',
    (window) => {
      const answer = buoyHistory({
        station: 'CHII2',
        history: history('CHII2', CHII2_POINTS),
        window,
        now: NOW,
        purdueInSeason: true,
      })

      // The station page's own data path over the same fixture, at the same scale, live.
      render(
        <StationStatsPanel
          dataWithOffset={withMinutesAgo(CHII2_POINTS, NOW)}
          timeWindowMinutes={TIME_SCALES[window].minutes}
          nowOffsetMinutes={0}
        />
      )
      const tile = (label: string): string =>
        screen.getByText(label).parentElement!.textContent!.slice(label.length)

      const stats = answer.windowStats!
      expect(stats.derived).toBe(true)
      expect(tile('Mean dir')).toMatch(new RegExp(`^${stats.meanDirectionDegreesTrue}°`))
      expect(tile('Mean spd')).toBe(`${stats.meanSpeedKnots.toFixed(1)}kts`)
      expect(tile('Range')).toBe(`${stats.speedMinKnots.toFixed(0)}–${stats.speedMaxKnots.toFixed(0)}kts`)
      expect(tile('Veer/back')).toBe(`${stats.veerBackSpreadDegrees.toFixed(0)}°spread`)
      expect(stats.readingCount).toBe(answer.readings!.length)
    }
  )

  it('states no Stats where the station page says "No data in window."', () => {
    const answer = buoyHistory({
      station: 'CHII2',
      history: history('CHII2', CHII2_POINTS),
      window: '30m',
      now: NOW,
      purdueInSeason: true,
    })

    render(<StationStatsPanel dataWithOffset={withMinutesAgo(CHII2_POINTS, NOW)} timeWindowMinutes={30} nowOffsetMinutes={0} />)

    expect(screen.getByText('No data in window.')).toBeInTheDocument()
    expect(answer.readings).toHaveLength(2)
    expect(answer.windowStats).toBeNull()
  })

  it('carries wave height where the station page shows it, and nothing it does not show', () => {
    const answer = buoyHistory({
      station: '45198',
      history: history('45198', PURDUE_POINTS),
      window: '1h',
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer).toMatchObject({ station: '45198', seasonal: true, anemometerHeightFeet: 3 })
    expect(answer.readings).toEqual([
      { observedAt: '2026-07-15T23:00:00.000Z', speedKnots: 11.8, directionDegreesTrue: 230, gustKnots: 14.2, waveHeightFeet: null },
      { observedAt: '2026-07-15T22:50:00.000Z', speedKnots: 11.2, directionDegreesTrue: 228, gustKnots: 13.9, waveHeightFeet: 2.1 },
    ])
  })

  it("leaves wave height out entirely when the history's fetch path never reads waves", () => {
    // Purdue's NDBC fallback reads no waves: the page draws nothing for them, not "—".
    const answer = buoyHistory({
      station: '45198',
      history: history('45198', [{ timestamp: '2026-07-15T23:00:00.000Z', spd: 11.8, dir: 230, gust: 14.2 }]),
      window: '1h',
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer.readings![0]).not.toHaveProperty('waveHeightFeet')
  })

  it('keeps a failed read as a failure: no readings, no Stats, the Data Status and the reason', () => {
    const answer = buoyHistory({
      station: 'CHII2',
      history: { ...history('CHII2', null), status: 'error', error: 'NDBC API error: 503 Service Unavailable' },
      window: '1h',
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer).toEqual({
      station: 'CHII2',
      name: 'Harrison Dever Crib',
      seasonal: false,
      dataStatus: 'error',
      fetchedAt: '2026-07-15T23:10:00.000Z',
      latestObservedAt: null,
      staleness: null,
      window: { id: '1h', label: TIME_SCALES['1h'].label },
      readings: null,
      windowStats: null,
      fetchError: 'NDBC API error: 503 Service Unavailable',
      anemometerHeightFeet: 85,
      note: 'Wind at this height typically reads 20–30% higher than at the surface.',
    })
  })

  it('reports Purdue as seasonal out of season, with no history at all rather than a missing one', () => {
    const answer = answerFor({
      station: '45198',
      history: { ...history('45198', null), status: 'error', error: 'No historical data available' },
      window: '6h',
      now: new Date('2026-01-15T23:12:00Z'),
      purdueInSeason: false,
    })

    expect(answer).toEqual({
      station: '45198',
      name: 'Purdue Buoy',
      seasonal: true,
      dataStatus: 'error',
      note: 'The Purdue Buoy is deployed May through October and is out of the water now. It is not late; there is no reading to report until it returns.',
    })
  })
})

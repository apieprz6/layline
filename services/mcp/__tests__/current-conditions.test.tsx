import { render, screen } from '@testing-library/react'
import { currentConditions } from '../current-conditions'
import { buoyMetadata } from '@/services/buoys/ndbc'
import { observationAgeMinutes } from '@/lib/utils/timeFormatting'
import StationRow from '@/components/dashboard/StationRow'
import type { BuoyDataResult, McpStationReading } from '@/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const NOW = new Date('2026-07-15T23:12:00Z')

function reading(
  buoyId: 'CHII2' | '45198',
  overrides: Partial<{ windSpeed: number; windDirection: number; timestamp: string }> = {}
): BuoyDataResult {
  return {
    data: {
      buoyId,
      name: buoyId === 'CHII2' ? 'Harrison Dever Crib' : 'Purdue Buoy',
      timestamp: overrides.timestamp ?? '2026-07-15T23:00:00.000Z',
      windSpeed: overrides.windSpeed ?? 17.3,
      windDirection: overrides.windDirection ?? 245,
      metadata: buoyMetadata(buoyId),
    },
    status: 'online',
    fetchedAt: '2026-07-15T23:10:00.000Z',
  }
}

describe('currentConditions', () => {
  it('states the CHII2 reading as recorded, with its 85 ft elevation beside it', () => {
    const answer = currentConditions({
      chii2: reading('CHII2'),
      purdue: reading('45198'),
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer.stations[0]).toEqual({
      station: 'CHII2',
      name: 'Harrison Dever Crib',
      seasonal: false,
      dataStatus: 'online',
      observedAt: '2026-07-15T23:00:00.000Z',
      fetchedAt: '2026-07-15T23:10:00.000Z',
      staleness: { minutes: 12, label: '12m ago' },
      wind: { speedKnots: 17.3, directionDegreesTrue: 245 },
      anemometerHeightFeet: 85,
      note: 'Wind at this height typically reads 20–30% higher than at the surface.',
    })
  })

  it('never offers a derived surface figure in place of the recorded one', () => {
    const answer = currentConditions({
      chii2: reading('CHII2', { windSpeed: 20 }),
      purdue: reading('45198'),
      now: NOW,
      purdueInSeason: true,
    })

    const numbers: number[] = []
    JSON.stringify(answer.stations[0], (_key, value: unknown) => {
      if (typeof value === 'number') numbers.push(value)
      return value
    })

    expect(answer.stations[0].wind).toEqual({ speedKnots: 20, directionDegreesTrue: 245 })
    // 20 kts less 20-30% is 14-16 kts. No figure in that range may appear anywhere.
    expect(numbers.filter((n) => n >= 14 && n <= 16)).toEqual([])
    expect(JSON.stringify(answer)).not.toMatch(/surface(Speed|Wind)/i)
  })

  it('reports Purdue as seasonal out of season, with no wind at all rather than a missing one', () => {
    const answer = currentConditions({
      chii2: reading('CHII2'),
      purdue: {
        data: null,
        status: 'offline',
        fetchedAt: '2026-01-15T23:10:00.000Z',
        error: 'Purdue Buoy is seasonal (May-October only)',
      },
      now: new Date('2026-01-15T23:12:00Z'),
      purdueInSeason: false,
    })

    const purdue = answer.stations[1]
    expect(purdue).toEqual({
      station: '45198',
      name: 'Purdue Buoy',
      seasonal: true,
      dataStatus: 'offline',
      note: 'The Purdue Buoy is deployed May through October and is out of the water now. It is not late; there is no reading to report until it returns.',
    })
    expect(purdue).not.toHaveProperty('wind')
  })

  it('keeps an in-season failure as a failure: no wind, the Data Status, and the reason', () => {
    const answer = currentConditions({
      chii2: {
        data: null,
        status: 'error',
        fetchedAt: '2026-07-15T23:10:00.000Z',
        error: 'NDBC API error: 503 Service Unavailable',
      },
      purdue: reading('45198'),
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer.stations[0]).toEqual({
      station: 'CHII2',
      name: 'Harrison Dever Crib',
      seasonal: false,
      dataStatus: 'error',
      observedAt: null,
      fetchedAt: '2026-07-15T23:10:00.000Z',
      staleness: null,
      wind: null,
      fetchError: 'NDBC API error: 503 Service Unavailable',
      anemometerHeightFeet: 85,
      note: 'Wind at this height typically reads 20–30% higher than at the surface.',
    })
  })

  it('carries a Purdue reading in season with its surface height', () => {
    const answer = currentConditions({
      chii2: reading('CHII2'),
      purdue: reading('45198', { windSpeed: 11.8, windDirection: 230, timestamp: '2026-07-15T21:40:00.000Z' }),
      now: NOW,
      purdueInSeason: true,
    })

    expect(answer.stations[1]).toMatchObject({
      station: '45198',
      seasonal: true,
      dataStatus: 'online',
      staleness: { minutes: 92, label: '1h ago' },
      wind: { speedKnots: 11.8, directionDegreesTrue: 230 },
      anemometerHeightFeet: 3,
    })
  })

  describe('Staleness parity with the Station Row', () => {
    afterEach(() => jest.useRealTimers())

    // A partial minute, an hour boundary and a multi-day gap: the cases a rounding rule moves.
    it.each([
      '2026-07-15T23:11:30.000Z',
      '2026-07-15T23:00:00.000Z',
      '2026-07-15T21:40:00.000Z',
      '2026-07-12T09:00:00.000Z',
    ])('states the age the Station Row prints for a reading taken at %s', (timestamp) => {
      jest.useFakeTimers({ now: NOW })
      const chii2 = reading('CHII2', { timestamp })
      const answer = currentConditions({ chii2, purdue: reading('45198'), now: NOW, purdueInSeason: true })
      const staleness = (answer.stations[0] as McpStationReading).staleness

      render(
        <StationRow
          buoyId="CHII2"
          windSpeed={chii2.data!.windSpeed}
          windDirection={chii2.data!.windDirection}
          status={chii2.status}
          timestamp={timestamp}
        />
      )

      expect(screen.getByText(staleness!.label)).toBeInTheDocument()
      expect(staleness!.minutes).toBe(observationAgeMinutes(timestamp, NOW.getTime()))
    })
  })
})

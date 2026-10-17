/**
 * The race tools' answers, pinned to what the race page prints for the same Race.
 *
 * The Race is read the way its page reads it — `readRace` over a caller's client, stubbed at the
 * table (`archive-client.ts`) — and the page's own tiles are rendered from that same read. The
 * contract ADR 0042 sets is that equality: a figure Claude is handed is the figure on the screen.
 */

import { render, screen, within } from '@testing-library/react'
import CoverageReadout from '@/components/race/CoverageReadout'
import RaceBreakdown from '@/components/race/RaceBreakdown'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { readRace } from '@/services/races/readRace'
import { readRaces } from '@/services/races/readRaces'
import type { RaceDetail } from '@/types'

import { raceList, raceSummary } from '../races'
import {
  FIXTURE_POLAR,
  FIXTURE_RACE_ID,
  OLDER_RACE_ID,
  archiveClient,
  fixtureArchive,
  fixtureStamp,
} from './archive-client'

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarVersion: async (versionId: string) =>
    versionId === 'polar-v1' ? { payload: FIXTURE_POLAR } : null,
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersion: async () => null,
  readCrossoverChartScreen: async () => null,
}))

async function fixtureRace(): Promise<RaceDetail> {
  const race = await readRace(FIXTURE_RACE_ID, archiveClient(fixtureArchive()).client)
  if (race === null) throw new Error('the fixture Race did not read')
  return race
}

describe('raceSummary', () => {
  it('prints the race page’s own Polar and VMG efficiency, each with its Filler-Anchored share', async () => {
    const race = await fixtureRace()
    const summary = raceSummary(race)

    render(
      <RaceBreakdown
        track={race.track}
        sailChart={{ ok: false, reason: 'no-chart-version' }}
        instruments={race.instruments}
      />
    )

    if (summary.performance.scoring !== 'polar') throw new Error('the fixture Race was not scored')
    const { polarEfficiency, vmgEfficiency } = summary.performance

    const polarTile = screen.getByTestId('race-polar-efficiency')
    expect(polarEfficiency.percent).not.toBeNull()
    expect(within(polarTile).getByText(polarEfficiency.percent!)).toBeTruthy()
    // Half the scored rows sail at 45°, which the ramp answers out of its own filler.
    expect(polarEfficiency.fillerAnchoredShare).toBeGreaterThan(0)
    expect(polarEfficiency.fillerAnchoredShare).toBeLessThan(1)
    expect(screen.getByTestId('race-polar-efficiency-filler-anchored').textContent).toContain(
      `${Math.round(polarEfficiency.fillerAnchoredShare! * 100)}%`
    )

    const vmgTile = screen.getByTestId('race-vmg-efficiency')
    expect(within(vmgTile).getByText(vmgEfficiency.percent!)).toBeTruthy()
    expect(vmgEfficiency.fillerAnchoredShare).not.toBeNull()
  })

  it('states coverage in time, in the coverage readout’s own words', async () => {
    const race = await fixtureRace()
    const summary = raceSummary(race)

    render(<CoverageReadout coverage={race.coverage} />)

    // Rows 2 to 17 at 30 seconds: seven and a half minutes, every one of them measured.
    expect(summary.coverage).toMatchObject({
      windowSeconds: 450,
      recordedSeconds: 450,
      frozenSeconds: 0,
      leadGapSeconds: 0,
      tailGapSeconds: 0,
      window: '7m 30s',
      recorded: '7m 30s',
    })
    expect(screen.getAllByText(summary.coverage.recorded).length).toBeGreaterThan(0)
  })

  it('states the Boat Setup the Race froze, by the Versions it names and never the newest', async () => {
    const summary = raceSummary(await fixtureRace())

    expect(summary.boatSetup).toEqual({
      polar: { versionNumber: 1, effectiveFrom: '2026-03-01' },
      crossoverChart: null,
      rigTune: null,
      instrumentCalibration: null,
      windBand: null,
      loggedTwsMeanKnots: 10,
    })
  })

  it('states the Maneuvers inside the window', async () => {
    const summary = raceSummary(await fixtureRace())

    expect(summary.maneuvers).toMatchObject({
      counts: { tack: 1, gybe: 0, rounding: 0 },
      flips: [{ at: fixtureStamp(10), maneuver: 'tack', twaBefore: '45', twaAfter: '-55' }],
    })
  })

  it('names the Race by what the sailor wrote and the day it was sailed', async () => {
    const summary = raceSummary(await fixtureRace())

    expect(summary.race).toEqual({
      id: FIXTURE_RACE_ID,
      title: 'Saturday Lake Series 4',
      day: '2026-08-22',
      weekday: 'Saturday',
      windowStart: fixtureStamp(2),
      windowFinish: fixtureStamp(17),
      recordingFilename: '08-22-26-lake-series.csv',
    })
  })

  it('hands over aggregates and never a Recording Row', async () => {
    const text = JSON.stringify(raceSummary(await fixtureRace()))

    expect(text).not.toContain('row_index')
    expect(text).not.toContain('latitude')
    expect(text).not.toMatch(/rowCount|row_count/)
  })

  it('says why there is no efficiency figure on a Race that records no Polar', async () => {
    const race = await readRace(OLDER_RACE_ID, archiveClient(fixtureArchive()).client)
    const summary = raceSummary(race!)

    expect(summary.performance).toEqual({
      scoring: 'no-polar-version',
      note: expect.stringContaining('no Polar Version'),
    })
  })
})

describe('raceList', () => {
  it('lists every Race newest first, with its window and how much of it was recorded', async () => {
    const { client } = archiveClient(fixtureArchive())
    const [races, archive] = await Promise.all([readRaces(client), readAnalysisArchive(client)])

    const list = raceList(races, archive)

    expect(list).toEqual({
      ok: true,
      races: [
        {
          id: FIXTURE_RACE_ID,
          title: 'Saturday Lake Series 4',
          day: '2026-08-22',
          weekday: 'Saturday',
          windowStart: fixtureStamp(2),
          windowFinish: fixtureStamp(17),
          windowSeconds: 450,
          loggedSeconds: 450,
          countableSeconds: expect.any(Number),
          window: '7m 30s',
          logged: '7m 30s',
          countable: expect.any(String),
        },
        {
          id: OLDER_RACE_ID,
          title: null,
          day: '2025-07-09',
          weekday: 'Wednesday',
          windowStart: '2025-07-09T19:00:00',
          windowFinish: '2025-07-09T19:02:00',
          windowSeconds: 120,
          // The recording stops a minute in: half the window is all there is.
          loggedSeconds: 60,
          countableSeconds: 60,
          window: '2m',
          logged: '1m',
          countable: '1m',
        },
      ],
    })
    // A tack's Window is not Countable, so the scored share is less than what was logged.
    if (!list.ok) throw new Error('unreachable')
    expect(list.races[0].countableSeconds).toBeLessThan(450)
  })

  it('refuses rather than answer over an archive that could not be read', async () => {
    const { client } = archiveClient(fixtureArchive(), ['recording_rows'])
    const [races, archive] = await Promise.all([readRaces(client), readAnalysisArchive(client)])

    expect(raceList(races, archive)).toEqual({ ok: false })
  })

  it('refuses where the race list failed and the archive did not, rather than call it empty', async () => {
    const { client } = archiveClient(fixtureArchive())
    const archive = await readAnalysisArchive(client)

    expect(raceList([], archive)).toEqual({ ok: false })
  })
})

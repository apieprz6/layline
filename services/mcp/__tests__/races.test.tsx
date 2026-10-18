/**
 * The race tools' answers, held equal to what the race screens state for the same Race.
 *
 * Parity, not literals (ADR 0042, *A tool inherits every rule and owns none*). Each test runs the
 * screen's own data path over one fixture — `readRace` or the analysis archive over a caller's
 * client, stubbed at the table (`archive-client.ts`) — renders or reads what the screen states
 * from it, and asserts the tool says the same. A changed rule then moves both sides together,
 * and a tool that grew its own copy of one would come apart from the screen here. The figures
 * themselves are pinned where they already are: in the suites for each rule, and against the
 * owner's archive.
 */

import { render, screen, within } from '@testing-library/react'
import CoverageReadout from '@/components/race/CoverageReadout'
import RaceBreakdown from '@/components/race/RaceBreakdown'
import RaceDetailView from '@/components/race/RaceDetailView'
import { coverageLedger } from '@/services/analysis/coverage-ledger'
import { EMPTY_FILTER } from '@/services/analysis/filter'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { readRace } from '@/services/races/readRace'
import { readRaces } from '@/services/races/readRaces'
import type { RaceDetail } from '@/types'

import { raceList, raceSummary } from '../races'
import {
  FIXTURE_CHART,
  FIXTURE_POLAR,
  FIXTURE_RACE_ID,
  OLDER_RACE_ID,
  archiveClient,
  fixtureArchive,
} from './archive-client'

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarVersion: async (versionId: string) =>
    versionId === 'polar-v1' ? { payload: FIXTURE_POLAR } : null,
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersion: async (versionId: string) =>
    versionId === 'chart-v1' ? { payload: FIXTURE_CHART } : null,
  readCrossoverChartScreen: async () => null,
}))

/** A Race as its page reads it. */
async function pageRead(raceId: string): Promise<RaceDetail> {
  const race = await readRace(raceId, archiveClient(fixtureArchive()).client)
  if (race === null) throw new Error(`the fixture Race ${raceId} did not read`)
  return race
}

/** The value the coverage readout prints beside `label`, or null where it prints no such row. */
function printed(label: string): string | null {
  return screen.queryByText(label)?.nextElementSibling?.textContent ?? null
}

describe('raceSummary', () => {
  it('states the race page’s own Polar and VMG efficiency, each with its Filler-Anchored share', async () => {
    const race = await pageRead(FIXTURE_RACE_ID)
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

    expect(
      within(screen.getByTestId('race-polar-efficiency')).getByText(polarEfficiency.percent!)
    ).toBeTruthy()
    expect(
      within(screen.getByTestId('race-vmg-efficiency')).getByText(vmgEfficiency.percent!)
    ).toBeTruthy()

    // The page flags a figure exactly where its share is above zero, with the share the tool carries.
    for (const [testId, share] of [
      ['race-polar-efficiency', polarEfficiency.fillerAnchoredShare],
      ['race-vmg-efficiency', vmgEfficiency.fillerAnchoredShare],
    ] as const) {
      const flag = screen.queryByTestId(`${testId}-filler-anchored`)
      if (share !== null && share > 0) {
        expect(flag?.textContent).toContain(`${Math.round(share * 100)}%`)
      } else {
        expect(flag).toBeNull()
      }
    }
    // The fixture sails half its scored rows at an angle the Polar answers from its own filler, so
    // the flagged branch is the one exercised for Polar Efficiency.
    expect(polarEfficiency.fillerAnchoredShare).toBeGreaterThan(0)
  })

  it.each([
    ['a Race with a Dropout', FIXTURE_RACE_ID],
    ['a Race whose recording stops before the finish', OLDER_RACE_ID],
  ])('states coverage in time as the coverage readout prints it, on %s', async (_, raceId) => {
    const race = await pageRead(raceId)
    const { coverage } = raceSummary(race)

    render(<CoverageReadout coverage={race.coverage} />)

    expect(printed('Window')).toBe(coverage.window.label)
    expect(printed('Recorded')).toBe(coverage.recorded.label)
    // The readout prints the last three only where they are not zero.
    expect(printed('Feed dropped')).toBe(coverage.frozen.seconds > 0 ? coverage.frozen.label : null)
    expect(printed('Before the first row')).toBe(
      coverage.beforeFirstRow.seconds > 0 ? coverage.beforeFirstRow.label : null
    )
    expect(printed('After the last row')).toBe(
      coverage.afterLastRow.seconds > 0 ? coverage.afterLastRow.label : null
    )
  })

  it('exercises the readout’s conditional rows between the two Races', async () => {
    // So the parity above is not vacuous: between them the fixtures print a Dropout and a gap.
    const [withDropout, cutShort] = await Promise.all([
      pageRead(FIXTURE_RACE_ID),
      pageRead(OLDER_RACE_ID),
    ])

    expect(raceSummary(withDropout).coverage.frozen.seconds).toBeGreaterThan(0)
    expect(raceSummary(cutShort).coverage.afterLastRow.seconds).toBeGreaterThan(0)
  })

  it('states the Boat Setup the Race froze, as the page reads it', async () => {
    const race = await pageRead(FIXTURE_RACE_ID)
    const { boatSetup } = raceSummary(race)

    expect(boatSetup.polar).toEqual({
      versionNumber: race.boat_setup.polar!.version_number,
      effectiveFrom: race.boat_setup.polar!.effective_from,
    })
    expect(boatSetup.crossoverChart).toEqual({
      versionNumber: race.boat_setup.crossover_chart!.version_number,
      effectiveFrom: race.boat_setup.crossover_chart!.effective_from,
    })
    // Not recorded stays not recorded, never the boat's current Version.
    expect(boatSetup.rigTune).toBeNull()
    expect(boatSetup.instrumentCalibration).toBeNull()
    expect(boatSetup.windBand).toBeNull()
    expect(boatSetup.loggedTwsMeanKnots).toBe(race.boat_setup.logged_tws_mean)
  })

  it('states the Maneuvers the page’s read detected inside the window', async () => {
    const race = await pageRead(FIXTURE_RACE_ID)
    const { maneuvers } = raceSummary(race)

    expect(maneuvers.flips).toEqual(
      race.maneuvers.map((flip) => ({
        at: flip.row_time,
        maneuver: flip.maneuver,
        twaBefore: flip.twa_before,
        twaAfter: flip.twa_after,
      }))
    )
    expect(maneuvers.counts.tack).toBe(
      race.maneuvers.filter((flip) => flip.maneuver === 'tack').length
    )
    expect(maneuvers.flips.length).toBeGreaterThan(0)
  })

  it('names the Race by what the sailor wrote, and its day as the archive files it', async () => {
    const race = await pageRead(FIXTURE_RACE_ID)
    const archive = await readAnalysisArchive(archiveClient(fixtureArchive()).client)
    const summary = raceSummary(race)

    expect(summary.race).toMatchObject({
      id: race.id,
      title: race.title,
      windowStart: race.window_start,
      windowFinish: race.window_finish,
      recordingFilename: race.recording.filename,
      day: archive!.races.find((entry) => entry.id === race.id)!.day,
    })
  })

  it.each([
    ['a Race with sails and sea state recorded', FIXTURE_RACE_ID],
    ['a Race with neither recorded', OLDER_RACE_ID],
  ])('states the sailor’s Testimony as the race page’s own sections do, on %s', async (_, raceId) => {
    const race = await pageRead(raceId)
    const { testimony } = raceSummary(race)

    render(
      <RaceDetailView
        race={race}
        canDelete={false}
        canAmend={false}
        deleteRace={jest.fn()}
        season={null}
        sailChart={{ ok: false, reason: 'no-chart-version' }}
      />
    )

    // Every entry the page lists, in its words and at its time, and nothing it does not.
    const section = (heading: string): HTMLElement =>
      screen.getByRole('heading', { name: heading }).closest('section')!
    for (const [heading, entries] of [
      ['Sails', testimony.sails],
      ['Sea state', testimony.seaState],
    ] as const) {
      const shown = section(heading)
      expect(entries.map((entry) => within(shown).getByText(entry.text))).toHaveLength(
        entries.length
      )
    }
    expect(testimony.sails.map((entry) => entry.at)).toEqual(race.annotations.sails.map((entry) => entry.at))
    expect(testimony.seaState.map((entry) => entry.at)).toEqual(
      race.annotations.sea_state.map((entry) => entry.at)
    )

    // An empty list is "not recorded", which the page says in words and the description tells Claude.
    if (testimony.sails.length === 0) {
      expect(within(section('Sails')).getByText(/Not recorded/)).toBeTruthy()
    }
  })

  it('exercises a named sail, a note beside one, and a note-only entry', async () => {
    const { testimony } = raceSummary(await pageRead(FIXTURE_RACE_ID))

    expect(testimony.sails.map((entry) => [entry.sail, entry.note])).toEqual([
      ['Main + Jib 1', null],
      // The note as stored; the page's trimmed words are in `text`.
      ['Main + Jib 3', ' eased early '],
      [null, 'Borrowed code zero'],
    ])
  })

  it('hands over aggregates and never a Recording Row', async () => {
    const text = JSON.stringify(raceSummary(await pageRead(FIXTURE_RACE_ID)))

    expect(text).not.toContain('row_index')
    expect(text).not.toContain('latitude')
    expect(text).not.toMatch(/rowCount|row_count/)
  })

  it('says why there is no efficiency figure in the page’s own words', async () => {
    const race = await pageRead(OLDER_RACE_ID)
    const summary = raceSummary(race)

    render(
      <RaceBreakdown
        track={race.track}
        sailChart={{ ok: false, reason: 'no-chart-version' }}
        instruments={race.instruments}
      />
    )

    if (summary.performance.scoring === 'polar') throw new Error('the older Race names no Polar')
    expect(summary.performance.scoring).toBe('no-polar-version')
    expect(screen.getByTestId('race-performance').textContent).toContain(summary.performance.note)
  })
})

describe('raceList', () => {
  it('lists every Race the archive lists, newest first, with the time the screens state for it', async () => {
    const { client } = archiveClient(fixtureArchive())
    const [races, archive] = await Promise.all([readRaces(client), readAnalysisArchive(client)])

    const list = raceList(races, archive)
    if (!list.ok) throw new Error('the fixture archive did not list')

    expect(list.races.map((race) => race.id)).toEqual(races.map((race) => race.id))
    for (const [index, entry] of list.races.entries()) {
      expect(entry).toMatchObject({
        title: races[index].title,
        windowStart: races[index].window_start,
      })
      expect(entry.window.seconds).toBe(races[index].window_seconds)
      // The analysis screens' own Race list figure for the same Race.
      expect(entry.logged.seconds).toBe(
        archive!.races.find((race) => race.id === entry.id)!.seconds
      )
    }

    // Each Race's countable time is its share of the archive's own ledger, and they add up to it.
    const whole = coverageLedger(archive!.rows, EMPTY_FILTER, [])
    expect(list.races.reduce((sum, race) => sum + race.countable.seconds, 0)).toBe(
      whole.countable_seconds
    )
    // A tack's Window and a Dropout are not Countable, so the fixture Race's figures read less.
    expect(list.races[0].countable.seconds).toBeLessThan(list.races[0].logged.seconds)
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

/**
 * `instrument_tuning` against the screens that state the same findings, over one fixture each.
 *
 * Parity, not literals (ADR 0042, *A tool inherits every rule and owns none*). Every assertion
 * renders the component a sailor reads — the "This season" row, the `STW` card's verdict, a Race
 * page's calibration tile — and holds the tool's answer equal to what it prints. A changed rule
 * moves both sides together; a tool that grew its own copy of one comes apart from the screen
 * here. The figures themselves are pinned in the suites for each rule, and against the archive.
 */

import { render, screen } from '@testing-library/react'
import RaceBreakdown from '@/components/race/RaceBreakdown'
import InstrumentTuningTeaser from '@/components/analysis/InstrumentTuningTeaser'
import CompassChart from '@/components/boat/instrument-tuning/CompassChart'
import SpeedCheckChart from '@/components/boat/instrument-tuning/SpeedCheckChart'
import {
  asymmetrySeason,
  speedSeason,
  event,
  tuningSeason,
} from '@/components/boat/instrument-tuning/__tests__/fixtures'
import { buildCalibrationLog } from '@/lib/boat/calibrationLog'
import type { InstrumentTuningSeason } from '@/services/analysis/instrument-tuning'
import { signedDegrees } from '@/services/analysis/instrument-tuning-text'
import { readRace } from '@/services/races/readRace'
import type { CheckedChannel, McpTuningChannel, RaceDetail } from '@/types'

import { instrumentTuningRaceAnswer, instrumentTuningSeasonAnswer } from '../instrument-tuning'
import { FIXTURE_CHART, FIXTURE_POLAR, FIXTURE_RACE_ID, OLDER_RACE_ID, archiveClient, fixtureArchive } from './archive-client'

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarVersion: async (versionId: string) =>
    versionId === 'polar-v1' ? { payload: FIXTURE_POLAR } : null,
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersion: async (versionId: string) =>
    versionId === 'chart-v1' ? { payload: FIXTURE_CHART } : null,
  readCrossoverChartScreen: async () => null,
}))

const SEASONS: [string, InstrumentTuningSeason][] = [
  ['every channel solid', tuningSeason()],
  ['a thin downwind side', tuningSeason({ asymmetry: asymmetrySeason(12, 2) })],
  ['few Races with their own line', tuningSeason({ speed: speedSeason(10, 2) })],
  ['no compass Era at all', tuningSeason({ heading: [] })],
]

const inTeaser = (testId: string, channel: CheckedChannel): Element | null =>
  document.querySelector(`[data-testid="${testId}"][data-channel="${channel}"]`)

function channelOf(channels: readonly McpTuningChannel[], channel: CheckedChannel): McpTuningChannel {
  const found = channels.find((each) => each.channel === channel)
  if (found === undefined) throw new Error(`no ${channel} in the answer`)
  return found
}

describe.each(SEASONS)('instrumentTuningSeasonAnswer over %s', (_name, season) => {
  const answer = instrumentTuningSeasonAnswer(season, 10)

  beforeEach(() => {
    render(<InstrumentTuningTeaser read={{ ok: true, season, log: [], races: [] }} />)
  })

  it.each(['HDG', 'AWA', 'STW'] as const)(
    'headlines %s with what the "This season" row prints for it',
    (channel) => {
      const { headline, name } = channelOf(answer.channels, channel)
      const figures = inTeaser('tuning-figures', channel)

      expect(screen.getAllByTestId('tuning-channel').map((node) => node.textContent)).toContain(name)
      if (headline.instead !== null) expect(figures).toHaveTextContent(headline.instead)
      for (const figure of headline.figures) {
        expect(figures).toHaveTextContent(figure.reading)
        if (figure.at !== undefined) expect(figures).toHaveTextContent(figure.at)
      }
      expect(inTeaser('tuning-reason', channel)).toHaveTextContent(headline.coverage.reason)

      const bar = inTeaser('coverage-bar', channel)
      if (headline.coverage.towardsSolid === null) expect(bar).toBeNull()
      else expect(bar).toHaveAttribute('data-share', headline.coverage.towardsSolid.toFixed(2))
    }
  )

  it('names the thinnest coverage the row names', () => {
    expect(answer.thinnest?.verdict.toLowerCase()).toBe(screen.getByTestId('tuning-coverage').textContent)
  })
})

describe('the charts behind each card', () => {
  it('gives the compass Era the highest and lowest heading its chart leads with', () => {
    const season = tuningSeason()
    const compass = channelOf(instrumentTuningSeasonAnswer(season, 2).channels, 'HDG')
    if (compass.channel !== 'HDG') throw new Error('not the compass')
    const current = compass.eras[compass.eras.length - 1]

    render(<CompassChart era={season.heading[0]} previous={null} log={[]} labels={{}} />)

    const readout = screen.getByTestId('chart-readout')
    const { highest, lowest } = current.swing!
    expect(readout).toHaveTextContent(`${signedDegrees(highest.offsetDegrees)} ${highest.compassPoint}`)
    expect(readout).toHaveTextContent(`${signedDegrees(lowest.offsetDegrees)} ${lowest.compassPoint}`)
  })

  it.each([
    ['most Races with a line', speedSeason(10, 9)],
    ['too few Races at any speed', speedSeason(1, 1)],
  ])('gives each STW Era the Recalibration Verdict its card leads with, over %s', (_name, speed) => {
    const boatSpeed = channelOf(instrumentTuningSeasonAnswer(tuningSeason({ speed }), 10).channels, 'STW')
    if (boatSpeed.channel !== 'STW') throw new Error('not boat speed')
    const { recalibration } = boatSpeed.eras[boatSpeed.eras.length - 1]

    render(
      <SpeedCheckChart
        byMethod={{ orthogonal: speed.orthogonal[0], 'sog-on-stw': speed['sog-on-stw'][0] }}
        log={[]}
        labels={{}}
      />
    )

    const banner = screen.getByTestId('speed-verdict')
    expect(banner).toHaveTextContent(recalibration.headline)
    expect(banner).toHaveTextContent(recalibration.detail)
  })

  it('never states a value to set the paddlewheel to', () => {
    const text = JSON.stringify(instrumentTuningSeasonAnswer(tuningSeason(), 10))

    // A slope, an intercept or a percentage is a drafted correction however it is labelled (ADR 0041).
    expect(text).not.toMatch(/slope|intercept|multiplier"|measured_offset|measuredOffset/i)
  })
})

describe('one channel', () => {
  it('answers that channel alone, with no thinnest word to compare it against', () => {
    const answer = instrumentTuningSeasonAnswer(tuningSeason(), 10, 'AWA')

    expect(answer.channels.map((each) => each.channel)).toEqual(['AWA'])
    expect(answer.thinnest).toBeUndefined()
  })
})

describe('instrumentTuningRaceAnswer', () => {
  /** A Race as its page reads it, through the page's own `readRace`. */
  async function pageRead(raceId: string): Promise<RaceDetail> {
    const race = await readRace(raceId, archiveClient(fixtureArchive()).client)
    if (race === null) throw new Error(`the fixture Race ${raceId} did not read`)
    return race
  }

  it.each([
    ['a Race with a track', FIXTURE_RACE_ID],
    ['a Race too short to measure', OLDER_RACE_ID],
  ])('states what the race page’s calibration tile prints, for %s', async (_name, raceId) => {
    const race = await pageRead(raceId)
    const answer = instrumentTuningRaceAnswer(race, [])

    render(
      <RaceBreakdown
        track={race.track}
        sailChart={{ ok: false, reason: 'no-chart-version' }}
        instruments={race.instruments}
      />
    )

    const tile = screen.getByTestId('race-calibration')
    expect(answer.race).toEqual({ id: race.id, title: race.title, windowStart: race.window_start })
    expect(answer.channels.map((each) => each.channel)).toEqual(['HDG', 'AWA', 'STW'])

    for (const finding of answer.channels) {
      const figures = tile.querySelector(
        `[data-testid="race-calibration-figures"][data-channel="${finding.channel}"]`
      )
      if (finding.instead !== null) expect(figures).toHaveTextContent(finding.instead)
      for (const figure of finding.figures) expect(figures).toHaveTextContent(figure.reading)
      if (finding.coverage.basis !== null) expect(tile).toHaveTextContent(finding.coverage.basis)

      const bar = tile.querySelector(
        `[data-testid="race-calibration-bar"][data-channel="${finding.channel}"]`
      )
      if (finding.coverage.share === null) expect(bar).toBeNull()
      else expect(bar).toHaveAttribute('data-share', finding.coverage.share.toFixed(2))

      // Every caveat the tile folds behind its disclosure travels with its own figure.
      expect(tile).toHaveTextContent(finding.caveat)
    }
  })

  it('names the Calibration Era each channel’s figure belongs to, cut on that channel’s own Log', async () => {
    const race = await pageRead(FIXTURE_RACE_ID)
    // An autocompensation on 4 July, before this Race of 22 August: the compass is in the Era it
    // opened, while the paddlewheel and the vane, which nobody touched, are still in their first.
    const log = buildCalibrationLog([], [event('2026-07-04', ['HDG'], 'autocompensation')])

    const eras = Object.fromEntries(
      instrumentTuningRaceAnswer(race, log).channels.map((each) => [each.channel, each.era])
    )

    expect(eras.HDG).toMatchObject({ fromDate: '2026-07-04', untilDate: null, label: 'since 4 Jul' })
    expect(eras.HDG?.openedBy).toHaveLength(1)
    expect(eras.AWA).toMatchObject({ fromDate: null, untilDate: null, label: 'the whole archive' })
    expect(eras.STW).toMatchObject({ fromDate: null, untilDate: null, openedBy: [] })
  })

  it('answers one channel alone', async () => {
    const answer = instrumentTuningRaceAnswer(await pageRead(FIXTURE_RACE_ID), [], 'STW')

    expect(answer.channels.map((each) => each.channel)).toEqual(['STW'])
  })
})

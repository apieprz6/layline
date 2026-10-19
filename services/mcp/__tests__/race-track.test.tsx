/**
 * `race_track`'s answer, held equal to what the race page states for the same Race.
 *
 * Parity, not literals (ADR 0042), as `races.test.tsx` does it: the page's own data path —
 * `readRace` and `readRaceSailChart` over a caller's client, stubbed at the table — renders the
 * legend, the Polar Plot's payload and the sail tile, and the tool must say the same. The figures
 * themselves are pinned in `track-time.test.ts` and in each rule's own suite.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RaceBreakdown from '@/components/race/RaceBreakdown'
import RaceTrackSection from '@/components/race/RaceTrackSection'
import { efficiencyPercent } from '@/services/analysis/figures'
import { readAnalysisArchive } from '@/services/analysis/readArchive'
import { TRACK_OVERLAYS, TRACK_SCALES } from '@/services/analysis/track-overlays'
import { raceComposition, readRaceSailChart } from '@/services/races/race-sail-chart'
import { readRace } from '@/services/races/readRace'
import { trackView } from '@/services/races/track-view'
import type { McpRaceTrack, RaceDetail } from '@/types'

import { raceTrack } from '../race-track'
import {
  FIXTURE_CHART,
  FIXTURE_POLAR,
  FIXTURE_RACE_ID,
  OLDER_RACE_ID,
  archiveClient,
  fixtureArchive,
} from './archive-client'

jest.mock('@/lib/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'solar', preference: 'auto', setPreference: jest.fn() }),
}))

jest.mock('@/services/boat/readPolarVersions', () => ({
  readPolarVersion: async (versionId: string) =>
    versionId === 'polar-v1' ? { payload: FIXTURE_POLAR } : null,
}))

jest.mock('@/services/boat/readCrossoverChartVersions', () => ({
  readCrossoverChartVersion: async (versionId: string) =>
    versionId === 'chart-v1' ? { payload: FIXTURE_CHART } : null,
  readCrossoverChartScreen: async () => null,
}))

/** A Race as its page reads it: the Race, and the sail tile from the archive beside it. */
async function pageRead(raceId: string): Promise<{
  race: RaceDetail
  sailChart: Awaited<ReturnType<typeof readRaceSailChart>>
}> {
  const { client } = archiveClient(fixtureArchive())
  const [race, archive] = await Promise.all([readRace(raceId, client), readAnalysisArchive(client)])
  if (race === null) throw new Error(`the fixture Race ${raceId} did not read`)
  return { race, sailChart: await readRaceSailChart(race, archive, client) }
}

async function toolRead(raceId: string): Promise<{ race: RaceDetail; answer: McpRaceTrack }> {
  const { race, sailChart } = await pageRead(raceId)
  return { race, answer: raceTrack(race, sailChart) }
}

function trackOf(answer: McpRaceTrack): NonNullable<McpRaceTrack['track']> {
  if (answer.track === null) throw new Error('the fixture Race drew no track')
  return answer.track
}

describe('raceTrack, against the heatmap’s legend', () => {
  it('states each overlay’s uncoloured time as the legend does, overlay by overlay', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)
    render(<RaceTrackSection season={null} track={trackView(race.track)} />)

    for (const overlay of trackOf(answer).overlays) {
      const chip = within(screen.getByTestId('track-overlays')).queryByRole('button', {
        name: TRACK_SCALES[overlay.overlay].chip,
      })
      // The switcher offers only what the Race can colour; the rest are still stated by the tool.
      if (chip === null) continue
      await userEvent.click(chip)

      expect(screen.getByTestId('track-counts')).toHaveTextContent(
        `${overlay.coverage.uncoloured.label} of the ${answer.window.label} window`
      )
      const frozen = overlay.coverage.uncolouredBy.find((part) => part.reason === 'frozen')
      expect(screen.getByText(`Frozen feed — ${frozen?.time.label}`)).toBeInTheDocument()
      expect(
        screen.getByText(`Drawn, not coloured — ${overlay.coverage.drawnNotColoured.label}`)
      ).toBeInTheDocument()
      if (overlay.coverage.fillerAnchored !== null) {
        expect(
          screen.getByText(`Filler-anchored — ${overlay.coverage.fillerAnchored.label}`)
        ).toBeInTheDocument()
      }
    }
  })

  it('times the frozen feed as the coverage readout does', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)
    const sog = trackOf(answer).overlays.find((overlay) => overlay.overlay === 'sog')
    const frozen = sog?.coverage.uncolouredBy.find((part) => part.reason === 'frozen')

    expect(race.coverage.frozen_seconds).toBeGreaterThan(0)
    expect(frozen?.time.seconds).toBe(race.coverage.frozen_seconds)
    expect(answer.window.seconds).toBe(race.coverage.window_seconds)
  })

  it('accounts for the whole window on every overlay, in bands and uncoloured time', async () => {
    const { answer } = await toolRead(FIXTURE_RACE_ID)
    const { overlays } = trackOf(answer)

    expect(overlays.map((overlay) => overlay.overlay)).toEqual(TRACK_OVERLAYS)
    for (const overlay of overlays) {
      const inBands = overlay.bands.reduce((total, band) => total + band.time.seconds, 0)
      expect(inBands + overlay.coverage.uncoloured.seconds).toBe(answer.window.seconds)
    }
  })

  it('lays the runs end to end across the window, merged, a Dropout a run of its own', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)

    for (const { runs } of trackOf(answer).overlays) {
      expect(runs[0].from).toBe(race.window_start)
      expect(runs[runs.length - 1].to).toBe(race.window_finish)
      runs.slice(1).forEach((run, index) => {
        const before = runs[index]
        expect(run.from).toBe(before.to)
        expect([run.band, run.reason]).not.toEqual([before.band, before.reason])
      })
      expect(runs.some((run) => run.reason === 'frozen' && run.band === null)).toBe(true)
    }
  })

  it('states each Dropout as the map bridges it', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)

    expect(trackOf(answer).dropouts).toEqual(
      (race.track.heatmap?.bridges ?? []).map((bridge) => ({
        from: bridge.from,
        to: bridge.to,
        time: expect.objectContaining({ seconds: bridge.seconds }),
      }))
    )
    expect(trackOf(answer).dropouts).toHaveLength(1)
  })

  it('states every piece of Testimony, placed by the map or not', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)
    const { placed, unplaced } = trackOf(answer).testimony

    expect(placed.length + unplaced.length).toBe(
      race.annotations.sails.length + race.annotations.sea_state.length
    )
    expect(placed.map((entry) => entry.label)).toEqual(
      race.track.heatmap?.annotations.map((annotation) => annotation.label)
    )
  })
})

describe('raceTrack, against the Polar Plot', () => {
  it('bins the moments the plot draws into its patches, each with the time behind it', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)
    if (!answer.polarPlot.drawn || race.track.plot === null) throw new Error('the fixture was not scored')

    const { patches } = answer.polarPlot
    expect(patches.length).toBeGreaterThan(0)
    // The page's own payload's patches, bin for bin and second for second.
    expect(patches.map((patch) => [patch.twaDeg, patch.sogKnots, patch.time.seconds])).toEqual(
      race.track.plot.patches.map((patch) => [patch.twa, patch.sog, patch.efficiency.elapsed_seconds])
    )
    // Every second the plot's dots stand for is in exactly one patch.
    const patched = patches.reduce((total, patch) => total + patch.time.seconds, 0)
    const dotted = race.track.plot.moments.reduce((total, moment) => total + moment.seconds, 0)
    expect(patched).toBe(dotted)
    // And the whole of them is the page's own Polar Efficiency tile's scored time.
    expect(patched).toBe(race.track.plot.performance.elapsed_seconds)
  })

  it('states what the plot draws nowhere, by the legend’s reasons', async () => {
    const { race, answer } = await toolRead(FIXTURE_RACE_ID)
    if (!answer.polarPlot.drawn || race.track.plot === null) throw new Error('the fixture was not scored')

    expect(answer.polarPlot.undrawn.seconds).toBe(race.track.plot.undrawn.seconds)
    expect(answer.polarPlot.undrawn.parts.map((part) => part.reason)).toEqual(
      race.track.plot.undrawn.parts.map((part) => part.reason)
    )
  })

  it('says why there is no plot, in the page’s words', async () => {
    const { race, answer } = await toolRead(OLDER_RACE_ID)
    render(<RaceTrackSection season={null} track={trackView(race.track)} />)

    if (answer.polarPlot.drawn) throw new Error('the older Race names no Polar')
    expect(within(screen.getByTestId('polar-plot-card')).getByText(answer.polarPlot.note)).toBeTruthy()
  })
})

describe('raceTrack, against the sail tile', () => {
  it('states the tile’s agreement, its composition and each side’s percent of target', async () => {
    const { race, sailChart } = await pageRead(FIXTURE_RACE_ID)
    const { sailChart: answer } = raceTrack(race, sailChart)
    render(<RaceBreakdown track={trackView(race.track)} sailChart={sailChart} instruments={race.instruments} />)

    if (!answer.ok) throw new Error('the fixture Race names a readable chart')
    const tile = screen.getByTestId('race-sail-chart')

    expect(tile).toHaveTextContent(`Against Crossover Chart v${answer.chartVersion}`)
    if (answer.agreement.percent !== null) {
      expect(screen.getByTestId('race-chart-agreement')).toHaveTextContent(answer.agreement.percent)
    }
    expect(answer.composition.length).toBeGreaterThan(0)
    for (const part of answer.composition) expect(tile).toHaveTextContent(`${part.percent} ${part.words}`)
    for (const side of [answer.following, answer.differing]) {
      if (side.percent !== null) expect(tile).toHaveTextContent(side.percent)
    }
    expect(answer.following.percent).toBe(efficiencyPercent(answer.following.ratio))
  })

  it('keeps Not recorded and Off-chart apart from Differs', async () => {
    const { race, sailChart } = await pageRead(FIXTURE_RACE_ID)
    const { sailChart: answer } = raceTrack(race, sailChart)
    if (!answer.ok || !sailChart.ok) throw new Error('the fixture Race names a readable chart')

    const verdicts = answer.composition.map((part) => part.verdict)
    expect(new Set(verdicts).size).toBe(verdicts.length)
    // The fixture's code zero is a sail the chart has no word for: Off-chart, never Differs.
    expect(verdicts).toContain('off-chart')
    // The tile's own shares, verdict for verdict.
    expect(answer.composition.map(({ verdict, share }) => ({ verdict, share }))).toEqual(
      raceComposition(sailChart.agreement).map(({ verdict, share }) => ({ verdict, share }))
    )
  })

  it('says why there is no tile figure, in the tile’s words', async () => {
    const { race, sailChart } = await pageRead(OLDER_RACE_ID)
    const { sailChart: answer } = raceTrack(race, sailChart)
    render(<RaceBreakdown track={trackView(race.track)} sailChart={sailChart} instruments={race.instruments} />)

    if (answer.ok) throw new Error('the older Race names no chart')
    expect(answer.reason).toBe('no-chart-version')
    expect(screen.getByTestId('race-sail-chart')).toHaveTextContent(answer.note)
  })
})

describe('raceTrack, as an answer', () => {
  it('narrows to one overlay when asked', async () => {
    const { race, sailChart } = await pageRead(FIXTURE_RACE_ID)
    const answer = raceTrack(race, sailChart, 'twa')

    expect(trackOf(answer).overlays.map((overlay) => overlay.overlay)).toEqual(['twa'])
  })

  it('hands over aggregates and runs, never a Recording Row or a per-row readout', async () => {
    const text = JSON.stringify((await toolRead(FIXTURE_RACE_ID)).answer)

    expect(text).not.toContain('row_index')
    expect(text).not.toContain('latitude')
    expect(text).not.toMatch(/"x1"|"cx"|segments|moments/)
    expect(text).not.toMatch(/rowCount|row_count|"rows"/)
  })
})

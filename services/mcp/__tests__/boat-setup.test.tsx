import { render, screen, within } from '@testing-library/react'
import BoatSetupList from '@/components/boat/BoatSetupList'
import BoatSetupVersionList from '@/components/boat/BoatSetupVersionList'
import CalibrationLog from '@/components/boat/CalibrationLog'
import CalibrationValues from '@/components/boat/CalibrationValues'
import CrossoverChartGrid from '@/components/boat/CrossoverChartGrid'
import RigTuneBandTable from '@/components/boat/rig/RigTuneBandTable'
import { CALIBRATION_CHANNELS } from '@/lib/boat/calibration'
import { SHROUD_ORDER } from '@/lib/boat/rigTune'
import {
  boatSetupOverview,
  crossoverChartVersions,
  instrumentCalibrationVersions,
  polarVersions,
  rigTuneVersions,
} from '../boat-setup'
import type {
  McpBoatSetupResult,
  BoatSetup,
  BoatSetupVersionRef,
  CrossoverChartPayload,
  FileBackedVersionDetailList,
  FileBackedVersionSummary,
  PolarVersionList,
  InstrumentCalibrationPayload,
  InstrumentCalibrationRecord,
  InstrumentCalibrationVersion,
  RigTuneBand,
  RigTunePage,
  RigTuneShrouds,
} from '@/types'

/**
 * `boat_setup` against the Boat Management screens.
 *
 * Every parity case renders the screen's own component over the same fixture the tool is handed,
 * and asserts the tool states what the screen prints, rather than pinning literals (ADR 0042).
 */

/** The answer of a result that should have one. */
function answerOf<Answer>(result: McpBoatSetupResult<Answer>): Answer {
  if (!result.ok) throw new Error(`expected an answer, got the refusal: ${result.refusal}`)
  return result.answer
}

const SETUP: BoatSetup = {
  boat: {
    id: 'boat-1',
    name: 'Handsome Pete',
    model: 'J/105',
    icon_path: null,
    icon_updated_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  artifacts: [
    { kind: 'polar', current: { version_number: 2, effective_from: '2026-06-01' } },
    { kind: 'crossover_chart', current: { version_number: 1, effective_from: '2026-04-21' } },
    { kind: 'rig_tune', current: { version_number: 3, effective_from: '2026-08-02' } },
    { kind: 'instrument_calibration', current: null },
  ],
}

describe('boatSetupOverview', () => {
  it('states the boat and its four artifacts as the Boat Management list shows them', () => {
    const answer = answerOf(boatSetupOverview(SETUP))
    render(<BoatSetupList artifacts={SETUP.artifacts} />)
    const rows = within(screen.getByTestId('boat-setup-list')).getAllByRole('link')

    expect(answer.boat).toEqual({ name: SETUP.boat.name, model: SETUP.boat.model })
    expect(answer.artifacts.map((artifact) => artifact.artifact)).toEqual(
      SETUP.artifacts.map((artifact) => artifact.kind)
    )
    answer.artifacts.forEach((artifact, index) => {
      const row = rows[index]
      expect(within(row).getByTestId('artifact-name')).toHaveTextContent(artifact.name)

      if (artifact.current === null) {
        // The row's own absence badge, and no Version line.
        expect(row).toHaveTextContent(/not recorded/i)
        expect(row).not.toHaveTextContent(/v\d/)
      } else {
        expect(row).toHaveTextContent(`v${artifact.current.versionNumber} · effective`)
        expect(artifact.current.effectiveFrom).toBe(SETUP.artifacts[index].current?.effective_from)
      }
    })
  })

  it('refuses a Boat Setup that could not be read, rather than answering with part of one', () => {
    expect(boatSetupOverview(null)).toEqual({ ok: false, refusal: expect.stringMatching(/could not be read/) })
  })
})

/** Every position distinct by side, so a test can tell the six figures apart. */
function shrouds(gapMm: number, turns: number): RigTuneShrouds {
  const side = { gap_mm: gapMm, turns_from_base: turns }
  return {
    V1: { port: side, starboard: side },
    D1: { port: { ...side, gap_mm: gapMm + 4 }, starboard: { ...side, gap_mm: gapMm + 5 } },
    D2: { port: { ...side, turns_from_base: -turns }, starboard: side },
  }
}

function band(versionId: string, over: Partial<RigTuneBand>): RigTuneBand {
  return {
    id: `${versionId}-band-${over.low_kt ?? 0}`,
    version_id: versionId,
    kind: 'rig_tune',
    low_kt: 0,
    high_kt: 9,
    is_base: false,
    label: null,
    note: null,
    shrouds: shrouds(72, 0),
    gaps_stale: false,
    ...over,
  }
}

/** Two Versions, newest first as `readRigTune` orders them: v2 in force, v1 a past tune. */
const RIG_TUNE: RigTunePage = {
  boat: SETUP.boat,
  artifact_id: 'artifact-rig',
  current_version_id: 'rig-v2',
  versions: [
    {
      id: 'rig-v2',
      version_number: 2,
      effective_from: '2026-08-02',
      recorded_at: '2026-08-02T15:00:00Z',
      note: 'Base re-measured after the new forestay',
      created_by: 'owner-1',
      bands: [
        band('rig-v2', { low_kt: 0, high_kt: 9, is_base: true, label: 'Light', shrouds: shrouds(70, 0) }),
        band('rig-v2', { low_kt: 9, high_kt: 15, label: 'Medium', shrouds: shrouds(66, 1.5), gaps_stale: true }),
        band('rig-v2', { low_kt: 15, high_kt: null, note: 'Ease the lowers first', shrouds: shrouds(61, 2.5) }),
      ],
    },
    {
      id: 'rig-v1',
      version_number: 1,
      effective_from: '2026-04-21',
      recorded_at: '2026-04-21T15:00:00Z',
      note: 'First measured tune',
      created_by: 'owner-1',
      bands: [
        band('rig-v1', { low_kt: 0, high_kt: 12, is_base: true }),
        band('rig-v1', { low_kt: 12, high_kt: null, shrouds: shrouds(64, 2) }),
      ],
    },
  ],
  races_by_version: { 'rig-v1': 3 },
}

describe('rigTuneVersions', () => {
  it("states every band of a Version as the Rig Tune screen's band table prints it", () => {
    const [version] = answerOf(rigTuneVersions(RIG_TUNE)).versions
    render(<RigTuneBandTable bands={RIG_TUNE.versions[0].bands} />)
    const cards = screen.getAllByTestId('rig-tune-band')

    expect(version.windBands).toHaveLength(cards.length)
    version.windBands.forEach((windBand, index) => {
      const card = cards[index]
      expect(card).toHaveTextContent(windBand.range)
      if (windBand.label !== null) expect(card).toHaveTextContent(windBand.label)
      if (windBand.note !== null) expect(card).toHaveTextContent(windBand.note)
      expect(within(card).queryByTestId('base-tune-mark') !== null).toBe(windBand.baseTune)
      expect(within(card).queryByTestId('gaps-stale-mark') !== null).toBe(windBand.gapsStale)

      // Six sides a band, in the card's own order, each figure as the card prints it.
      const sides = within(card).getAllByTestId('shroud-side')
      const stated = windBand.shrouds.flatMap((position) => [position.port, position.starboard])
      expect(windBand.shrouds.map((position) => position.position)).toEqual([...SHROUD_ORDER])
      stated.forEach((setting, side) => {
        expect(sides[side]).toHaveTextContent(`${setting.gapMm}mm${setting.turns}turns`)
      })
    })
  })

  it('states the figures as stored, with the Version identified and its change reason', () => {
    const [version] = answerOf(rigTuneVersions(RIG_TUNE)).versions
    const stored = RIG_TUNE.versions[0]

    expect(version).toMatchObject({
      versionNumber: stored.version_number,
      effectiveFrom: stored.effective_from,
      note: stored.note,
      inForce: true,
    })
    expect(version.windBands.map((windBand) => [windBand.lowKnots, windBand.highKnots])).toEqual(
      stored.bands.map((storedBand) => [storedBand.low_kt, storedBand.high_kt])
    )
    expect(version.windBands[1].shrouds[0].port).toMatchObject({
      gapMm: stored.bands[1].shrouds.V1.port.gap_mm,
      turnsFromBase: stored.bands[1].shrouds.V1.port.turns_from_base,
    })
  })

  it('states every Version newest first, with the one in force marked', () => {
    const answer = answerOf(rigTuneVersions(RIG_TUNE))

    expect(answer).toMatchObject({ artifact: 'rig_tune', name: 'Rig Tune', currentVersionNumber: 2 })
    expect(answer.versions.map((version) => [version.versionNumber, version.inForce])).toEqual([
      [2, true],
      [1, false],
    ])
  })

  it('opens a past Version by its number, and not the one in force', () => {
    const answer = answerOf(rigTuneVersions(RIG_TUNE, 1))

    expect(answer.versions).toHaveLength(1)
    expect(answer.versions[0]).toMatchObject({ versionNumber: 1, inForce: false, note: 'First measured tune' })
    expect(answer.currentVersionNumber).toBe(2)
  })

  it("resolves a Race's frozen pointer, by the number race_summary names, to the Version it holds", () => {
    // As `readRace` reads a Race's Rig Tune back: the id it froze, and the number it names it by.
    const held: BoatSetupVersionRef = { version_id: 'rig-v1', version_number: 1, effective_from: '2026-04-21' }
    const stored = RIG_TUNE.versions.find((version) => version.id === held.version_id)!

    const [version] = answerOf(rigTuneVersions(RIG_TUNE, held.version_number)).versions

    expect(version).toMatchObject({ effectiveFrom: stored.effective_from, note: stored.note })
    expect(version.windBands).toHaveLength(stored.bands.length)
  })

  it('refuses a Version that does not exist, naming the ones that do', () => {
    const result = rigTuneVersions(RIG_TUNE, 7)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.refusal).toMatch(/no Version 7.*2.*1/)
  })

  it('refuses a Rig Tune that could not be read', () => {
    expect(rigTuneVersions(null).ok).toBe(false)
  })
})

function calibrationVersion(
  versionNumber: number,
  effectiveFrom: string,
  payload: InstrumentCalibrationPayload,
  note: string | null = null
): InstrumentCalibrationVersion {
  return {
    id: `cal-v${versionNumber}`,
    artifact_id: 'artifact-cal',
    kind: 'instrument_calibration',
    version_number: versionNumber,
    effective_from: effectiveFrom,
    recorded_at: `${effectiveFrom}T12:00:00Z`,
    note,
    created_by: 'owner-1',
    filename: null,
    content_sha256: null,
    payload,
  }
}

const FIRST_PROGRAMMED: InstrumentCalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

/** Ascending, as `readInstrumentCalibration` reads it: v2 recalibrated the paddlewheel, v3 nothing. */
const CALIBRATION: InstrumentCalibrationRecord = {
  artifactId: 'artifact-cal',
  currentVersionId: 'cal-v3',
  versions: [
    calibrationVersion(1, '2026-04-21', FIRST_PROGRAMMED),
    calibrationVersion(2, '2026-06-14', { ...FIRST_PROGRAMMED, STW: { multiplier: 1.06, offset: -0.2 } }, 'Paddlewheel recalibrated against the GPS'),
    calibrationVersion(3, '2026-08-30', { ...FIRST_PROGRAMMED, STW: { multiplier: 1.06, offset: -0.2 } }),
  ],
  events: [
    {
      id: 'event-1',
      artifact_id: 'artifact-cal',
      kind: 'instrument_calibration',
      occurred_on: '2026-07-04',
      type: 'autocompensation',
      channels: ['HDG'],
      note: 'Swung the compass off Navy Pier',
      created_by: 'owner-1',
      created_at: '2026-07-04T18:00:00Z',
      updated_at: '2026-07-04T18:00:00Z',
    },
  ],
}

describe('instrumentCalibrationVersions', () => {
  it("states each channel as the screen's As programmed table prints it, figures as stored", () => {
    const answer = answerOf(instrumentCalibrationVersions(CALIBRATION, 2))
    const [version] = answer.versions
    render(<CalibrationValues payload={CALIBRATION.versions[1].payload} />)
    const rows = within(screen.getByTestId('calibration-values')).getAllByRole('row').slice(1)

    expect(version.channels.map((channel) => channel.channel)).toEqual([...CALIBRATION_CHANNELS])
    version.channels.forEach((channel, index) => {
      const stored = CALIBRATION.versions[1].payload[channel.channel]
      expect(rows[index]).toHaveTextContent(`${channel.channel}${channel.multiplierText}${channel.offsetText}`)
      expect(channel.offset).toBe(stored.offset)
      expect(channel.multiplier).toBe(stored.multiplier ?? null)
    })
  })

  it('states the Calibration Log in its own order and words, events included', () => {
    const answer = answerOf(instrumentCalibrationVersions(CALIBRATION))
    render(<CalibrationLog versions={CALIBRATION.versions} events={CALIBRATION.events} />)
    const entries = Array.from(screen.getByTestId('calibration-log').children)

    expect(answer.calibrationLog).toHaveLength(entries.length)
    answer.calibrationLog!.forEach((entry, index) => {
      expect(entries[index]).toHaveTextContent(entry.headline)
      const lines = entry.entry === 'version' ? entry.changes : [entry.consequence]
      lines.forEach((line) => expect(entries[index]).toHaveTextContent(line))
      if (entry.note !== null) expect(entries[index]).toHaveTextContent(entry.note)
    })
    expect(answer.calibrationLog!.map((entry) => entry.entry)).toContain('event')
  })

  it('states what each Version changed as its Log entry does', () => {
    const answer = answerOf(instrumentCalibrationVersions(CALIBRATION))

    answer.versions.forEach((version) => {
      const logged = answer.calibrationLog!.find(
        (entry) => entry.entry === 'version' && entry.versionNumber === version.versionNumber
      )
      expect(logged).toMatchObject({ changes: version.changes })
    })
    expect(answer.versions.map((version) => [version.versionNumber, version.inForce])).toEqual([
      [3, true],
      [2, false],
      [1, false],
    ])
  })

  it('states one Version alone when asked for it, without the whole Log', () => {
    const answer = answerOf(instrumentCalibrationVersions(CALIBRATION, 2))

    expect(answer.versions.map((version) => version.versionNumber)).toEqual([2])
    expect(answer.versions[0].note).toBe('Paddlewheel recalibrated against the GPS')
    expect(answer.calibrationLog).toBeUndefined()
  })

  it('refuses a calibration Version that does not exist, and a calibration that could not be read', () => {
    expect(instrumentCalibrationVersions(CALIBRATION, 9)).toEqual({
      ok: false,
      refusal: expect.stringMatching(/no Version 9.*3, 2, 1/),
    })
    expect(instrumentCalibrationVersions(null).ok).toBe(false)
  })
})

function fileBacked(versionNumber: number, effectiveFrom: string, current: boolean): FileBackedVersionSummary {
  return {
    id: `v${versionNumber}`,
    version_number: versionNumber,
    effective_from: effectiveFrom,
    recorded_at: `${effectiveFrom}T12:00:00Z`,
    note: versionNumber === 1 ? 'From the class association' : null,
    filename: `HandsomePete_v${versionNumber}.file`,
    content_sha256: 'a'.repeat(64),
    is_current: current,
  }
}

/** Sail 7 is defined and called for by no cell: the legend's "never recommended". */
const CHART: CrossoverChartPayload = {
  twa_axis: [40, 80, 120],
  tws_axis: [8, 12],
  cells: [
    [1, 1],
    [6, 2],
    [6, 6],
  ],
  sail_definitions: [
    { number: 1, label: 'Main + Jib 1' },
    { number: 2, label: 'Main + Jib 2' },
    { number: 6, label: 'Main + A3' },
    { number: 7, label: 'Storm jib' },
  ],
}

const CHARTS: FileBackedVersionDetailList<CrossoverChartPayload> = {
  current_version_id: 'v2',
  versions: [
    { ...fileBacked(2, '2026-06-14', true), payload: CHART },
    { ...fileBacked(1, '2026-04-21', false), payload: null },
  ],
}

describe('crossoverChartVersions', () => {
  it("states each Version's Sail Definitions as the chart's legend prints them", () => {
    const [version] = answerOf(crossoverChartVersions(CHARTS)).versions
    render(<CrossoverChartGrid payload={CHART} />)
    const legend = screen.getAllByTestId('crossover-chart-legend-row')

    expect(version.sailDefinitions).toHaveLength(legend.length)
    version.sailDefinitions!.forEach((definition, index) => {
      expect(legend[index]).toHaveAttribute('data-sail', String(definition.number))
      expect(legend[index]).toHaveTextContent(definition.label)
      expect(within(legend[index]).getByTestId('crossover-chart-legend-cells')).toHaveTextContent(definition.usage)
    })
  })

  it('lists a Version whose chart is unreadable, stating it has no definitions to give', () => {
    const answer = answerOf(crossoverChartVersions(CHARTS))

    expect(answer).toMatchObject({ artifact: 'crossover_chart', currentVersionNumber: 2 })
    expect(answer.versions.map((version) => [version.versionNumber, version.inForce])).toEqual([
      [2, true],
      [1, false],
    ])
    expect(answer.versions[1]).toMatchObject({ note: 'From the class association', sailDefinitions: null })
  })

  it('opens one Version by number, refuses one that does not exist, and a failed read', () => {
    expect(answerOf(crossoverChartVersions(CHARTS, 1)).versions.map((v) => v.versionNumber)).toEqual([1])
    expect(crossoverChartVersions(CHARTS, 3)).toEqual({ ok: false, refusal: expect.stringMatching(/no Version 3.*2, 1/) })
    expect(crossoverChartVersions(null).ok).toBe(false)
  })
})

const POLARS: PolarVersionList = {
  current_version_id: 'v2',
  versions: [fileBacked(2, '2026-06-01', true), fileBacked(1, '2026-04-21', false)],
}

describe('polarVersions', () => {
  it("states each Version as the Polar's Version list row does, and never the grid", () => {
    const answer = answerOf(polarVersions(POLARS))
    render(<BoatSetupVersionList kind="polar" versions={POLARS.versions} />)
    const rows = screen.getAllByTestId('polar-version-row')

    expect(answer).toMatchObject({ artifact: 'polar', name: 'Polar', currentVersionNumber: 2 })
    expect(answer.versions).toHaveLength(rows.length)
    answer.versions.forEach((version, index) => {
      expect(rows[index]).toHaveAttribute('data-version-number', String(version.versionNumber))
      expect(rows[index]).toHaveTextContent(version.filename)
      if (version.note !== null) expect(rows[index]).toHaveTextContent(version.note)
      expect(within(rows[index]).queryByTestId('polar-version-current') !== null).toBe(version.inForce)
      expect(version.effectiveFrom).toBe(POLARS.versions[index].effective_from)
      // A target is stated by the screen that states it, never handed over as a grid (ADR 0042).
      expect(Object.keys(version).sort()).toEqual(['effectiveFrom', 'filename', 'inForce', 'note', 'versionNumber'])
    })
  })

  it('opens one Version by number and refuses one that does not exist', () => {
    expect(answerOf(polarVersions(POLARS, 1)).versions[0]).toMatchObject({ versionNumber: 1, inForce: false })
    expect(polarVersions(POLARS, 4).ok).toBe(false)
    expect(polarVersions(null).ok).toBe(false)
  })
})

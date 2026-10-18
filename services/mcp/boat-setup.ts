import { BOAT_SETUP_LABEL } from '@/lib/boat/artifacts'
import {
  CALIBRATION_CHANNELS,
  CHANNEL_LABEL,
  NO_MULTIPLIER,
  formatMultiplier,
  formatOffset,
} from '@/lib/boat/calibration'
import {
  buildCalibrationLog,
  eventConsequence,
  logEntryHeadline,
  versionChangeLines,
} from '@/lib/boat/calibrationLog'
import { SHROUD_ORDER, formatBandRange, formatTurns } from '@/lib/boat/rigTune'
import {
  crossoverDefinitionUsage,
  describeDefinitionUsage,
} from '@/services/boat/crossoverDefinitionUsage'
import type {
  BoatSetup,
  BoatSetupKind,
  CalibrationLogEntry,
  CrossoverChartPayload,
  FileBackedVersionDetailList,
  FileBackedVersionSummary,
  McpCrossoverChartVersion,
  McpPolarVersion,
  PolarVersionList,
  InstrumentCalibrationPayload,
  InstrumentCalibrationRecord,
  McpBoatSetupArtifactAnswer,
  McpBoatSetupOverview,
  McpCalibrationChannel,
  McpCalibrationLogEntry,
  McpInstrumentCalibrationVersion,
  McpRigTuneVersion,
  McpShroudSetting,
  McpWindBand,
  RigTuneBand,
  RigTunePage,
  ShroudSideSetting,
} from '@/types'

/**
 * `boat_setup`'s answers, shaped from the Boat Management screens' own reads.
 *
 * Pure, and only shaping: every figure is the read's, every phrase is the one the screen prints
 * through the same `lib/` function, and nothing here classifies, sums or recomputes (ADR 0042).
 */

/** An answer, or the refusal Claude reads as a failed call. Never part of an answer. */
export type BoatSetupResult<Answer> = { ok: true; answer: Answer } | { ok: false; refusal: string }

function unreadable(what: string): { ok: false; refusal: string } {
  return {
    ok: false,
    refusal: `The ${what} could not be read, so nothing about it is given rather than part of it. Try again shortly.`,
  }
}

/**
 * Every Version, or the one a caller asked for by number, which is how a Race names one. A number
 * the artifact has no Version of is refused with the numbers it has: never the Version in force in
 * its place, as the screen falls back to, because a Race's frozen pointer must resolve to the
 * Version it holds or to nothing (ADR 0012).
 */
function chosen<Version extends { version_number: number }>(
  kind: BoatSetupKind,
  versions: Version[],
  requested: number | undefined
): { ok: true; versions: Version[] } | { ok: false; refusal: string } {
  if (requested === undefined) return { ok: true, versions }

  const found = versions.find((version) => version.version_number === requested)
  if (found !== undefined) return { ok: true, versions: [found] }

  const name = BOAT_SETUP_LABEL[kind]
  return {
    ok: false,
    refusal:
      versions.length === 0
        ? `Nothing is recorded for the ${name} yet, so it has no Version ${requested}.`
        : `The ${name} has no Version ${requested}. Its Versions are ${versions
            .map((version) => version.version_number)
            .join(', ')}.`,
  }
}

/** Which Version an artifact's pointer is at, by number, or null when nothing is recorded. */
function currentNumber(
  versions: { id: string; version_number: number }[],
  currentVersionId: string | null
): number | null {
  return versions.find((version) => version.id === currentVersionId)?.version_number ?? null
}

/** What identifies a file-backed Version, as its list row states it. */
function fileBackedVersion(version: FileBackedVersionSummary): McpPolarVersion {
  return {
    versionNumber: version.version_number,
    effectiveFrom: version.effective_from,
    note: version.note,
    inForce: version.is_current,
    filename: version.filename,
  }
}

/**
 * The Polar screen's Version list: number, date, note and file, and never the grid. Targets handed
 * over would let a model score the boat itself against figures the screens disagree with; a target
 * comes from the tool for the screen that states it (ADR 0042).
 */
export function polarVersions(
  list: PolarVersionList | null,
  versionNumber?: number
): BoatSetupResult<McpBoatSetupArtifactAnswer & { artifact: 'polar' }> {
  if (list === null) return unreadable(BOAT_SETUP_LABEL.polar)

  const picked = chosen('polar', list.versions, versionNumber)
  if (!picked.ok) return picked

  return {
    ok: true,
    answer: {
      artifact: 'polar',
      name: BOAT_SETUP_LABEL.polar,
      currentVersionNumber: currentNumber(list.versions, list.current_version_id),
      versions: picked.versions.map(fileBackedVersion),
    },
  }
}

/** The Crossover Chart: each Version and its Sail Definitions, as the chart's legend states them. */
export function crossoverChartVersions(
  list: FileBackedVersionDetailList<CrossoverChartPayload> | null,
  versionNumber?: number
): BoatSetupResult<McpBoatSetupArtifactAnswer & { artifact: 'crossover_chart' }> {
  if (list === null) return unreadable(BOAT_SETUP_LABEL.crossover_chart)

  const picked = chosen('crossover_chart', list.versions, versionNumber)
  if (!picked.ok) return picked

  return {
    ok: true,
    answer: {
      artifact: 'crossover_chart',
      name: BOAT_SETUP_LABEL.crossover_chart,
      currentVersionNumber: currentNumber(list.versions, list.current_version_id),
      versions: picked.versions.map(
        (version): McpCrossoverChartVersion => ({
          ...fileBackedVersion(version),
          sailDefinitions:
            version.payload === null
              ? null
              : crossoverDefinitionUsage(version.payload).map(({ definition, cells }) => ({
                  number: definition.number,
                  label: definition.label,
                  cells,
                  usage: describeDefinitionUsage(cells),
                })),
        })
      ),
    },
  }
}

/** The Boat Management list: the boat, and each artifact's Version in force or *not recorded*. */
export function boatSetupOverview(setup: BoatSetup | null): BoatSetupResult<McpBoatSetupOverview> {
  if (setup === null) return unreadable('Boat Setup')

  return {
    ok: true,
    answer: {
      boat: { name: setup.boat.name, model: setup.boat.model },
      artifacts: setup.artifacts.map(({ kind, current }) => ({
        artifact: kind,
        name: BOAT_SETUP_LABEL[kind],
        current:
          current === null
            ? null
            : { versionNumber: current.version_number, effectiveFrom: current.effective_from },
      })),
    },
  }
}

function shroudSetting(setting: ShroudSideSetting): McpShroudSetting {
  return {
    gapMm: setting.gap_mm,
    turnsFromBase: setting.turns_from_base,
    turns: formatTurns(setting.turns_from_base),
  }
}

/** A Wind Band as the band table's card prints it, its figures as stored. */
function windBand(band: RigTuneBand): McpWindBand {
  return {
    range: formatBandRange(band.low_kt, band.high_kt),
    lowKnots: band.low_kt,
    highKnots: band.high_kt,
    label: band.label,
    baseTune: band.is_base,
    note: band.note,
    gapsStale: band.gaps_stale,
    shrouds: SHROUD_ORDER.map((position) => ({
      position,
      port: shroudSetting(band.shrouds[position].port),
      starboard: shroudSetting(band.shrouds[position].starboard),
    })),
  }
}

/** The Rig Tune screen: each Version's change reason and its Wind Bands, up the wind axis. */
export function rigTuneVersions(
  page: RigTunePage | null,
  versionNumber?: number
): BoatSetupResult<McpBoatSetupArtifactAnswer & { artifact: 'rig_tune' }> {
  if (page === null) return unreadable(BOAT_SETUP_LABEL.rig_tune)

  const picked = chosen('rig_tune', page.versions, versionNumber)
  if (!picked.ok) return picked

  return {
    ok: true,
    answer: {
      artifact: 'rig_tune',
      name: BOAT_SETUP_LABEL.rig_tune,
      currentVersionNumber: currentNumber(page.versions, page.current_version_id),
      versions: picked.versions.map(
        (version): McpRigTuneVersion => ({
          versionNumber: version.version_number,
          effectiveFrom: version.effective_from,
          note: version.note,
          inForce: version.id === page.current_version_id,
          windBands: version.bands.map(windBand),
        })
      ),
    },
  }
}

/** One channel as the As programmed table prints it, in the display's own encoding (ADR 0005). */
function channelFigures(payload: InstrumentCalibrationPayload): McpCalibrationChannel[] {
  return CALIBRATION_CHANNELS.map((channel) => {
    const { multiplier, offset } = payload[channel]

    return {
      channel,
      name: CHANNEL_LABEL[channel],
      multiplier: multiplier ?? null,
      multiplierText: multiplier === undefined ? NO_MULTIPLIER : formatMultiplier(multiplier),
      offset,
      offsetText: formatOffset(channel, offset),
    }
  })
}

/** A Calibration Log entry in the Log's own words. */
function logEntry(entry: CalibrationLogEntry): McpCalibrationLogEntry {
  if (entry.entry === 'version') {
    return {
      entry: 'version',
      date: entry.date,
      headline: logEntryHeadline(entry),
      versionNumber: entry.version.version_number,
      changes: versionChangeLines(entry.changes),
      note: entry.version.note,
    }
  }

  return {
    entry: 'event',
    date: entry.date,
    headline: logEntryHeadline(entry),
    type: entry.event.type,
    channels: entry.event.channels,
    note: entry.event.note,
    consequence: eventConsequence(entry.event.type),
  }
}

/**
 * The Instrument Calibration screen: each Version's figures and what it changed, and — when every
 * Version is asked for — the Calibration Log, events included, which is the history of them all.
 */
export function instrumentCalibrationVersions(
  record: InstrumentCalibrationRecord | null,
  versionNumber?: number
): BoatSetupResult<McpBoatSetupArtifactAnswer & { artifact: 'instrument_calibration' }> {
  if (record === null) return unreadable(BOAT_SETUP_LABEL.instrument_calibration)

  const log = buildCalibrationLog(record.versions, record.events)
  const changesOf = new Map(
    log.flatMap((entry) =>
      entry.entry === 'version' ? [[entry.version.id, versionChangeLines(entry.changes)] as const] : []
    )
  )

  // The read is in mint order; the answer is newest first, as every other artifact's is.
  const picked = chosen('instrument_calibration', [...record.versions].reverse(), versionNumber)
  if (!picked.ok) return picked

  return {
    ok: true,
    answer: {
      artifact: 'instrument_calibration',
      name: BOAT_SETUP_LABEL.instrument_calibration,
      currentVersionNumber: currentNumber(record.versions, record.currentVersionId),
      versions: picked.versions.map(
        (version): McpInstrumentCalibrationVersion => ({
          versionNumber: version.version_number,
          effectiveFrom: version.effective_from,
          note: version.note,
          inForce: version.id === record.currentVersionId,
          channels: channelFigures(version.payload),
          changes: changesOf.get(version.id) ?? [],
        })
      ),
      ...(versionNumber === undefined ? { calibrationLog: log.map(logEntry) } : {}),
    },
  }
}

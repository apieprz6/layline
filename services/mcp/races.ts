import { weekdayOf } from '@/lib/utils/calendarDate'
import { raceCoverageLedgers } from '@/services/analysis/coverage-ledger'
import { efficiencyPercent } from '@/services/analysis/figures'
import { MANEUVER_DETECTOR_VERSION, maneuverCounts } from '@/services/analysis/maneuvers'
import {
  fillerAnchoredShare,
  noFigureNote,
  vmgFillerAnchoredShare,
} from '@/services/analysis/polar-performance'
import { TARGET_VMG_CAVEAT } from '@/services/analysis/polar-targets'
import type { AnalysisArchive } from '@/services/analysis/readArchive'
import { describeDuration } from '@/services/recordings/coverage'
import { wallClockDate } from '@/services/recordings/wall-clock'
import type {
  BoatSetupVersionRef,
  McpDuration,
  McpRaceIdentity,
  McpRaceListAnswer,
  McpRacePerformance,
  McpRaceSummary,
  McpVersionRef,
  RaceDetail,
  RaceListEntry,
  RaceTrack,
} from '@/types'

/**
 * What identifies a Race, from its own window: the day the archive files it under, and the
 * calendar's weekday for that day. No `Date` is built, since the stamp carries no zone (ADR 0008).
 */
function identity(
  race: Pick<RaceListEntry, 'id' | 'title' | 'window_start' | 'window_finish'>
): McpRaceIdentity {
  const day = wallClockDate(race.window_start)

  return {
    id: race.id,
    title: race.title,
    day,
    weekday: weekdayOf(day),
    windowStart: race.window_start,
    windowFinish: race.window_finish,
  }
}

function duration(seconds: number): McpDuration {
  return { seconds, label: describeDuration(seconds) }
}

/**
 * The archive's Races for `list_races`: `readRaces`' list, with each Race's time from the analysis
 * archive's own rows, or a refusal.
 *
 * Two reads, joined here, because neither holds both halves: `readRaces` has the windows and the
 * analysis archive has the Countable verdicts. `readRaces` answers a failure with an empty list,
 * so the archive is the witness: if the two disagree about which Races exist, one of them read
 * less than the whole, and a list missing a Race is never an answer (ADR 0026).
 *
 * The time is each Race's own **Coverage Ledger**, so it is the figure the analysis screens state
 * for the same rows. Nothing here sums or classifies a row (ADR 0042).
 */
export function raceList(
  races: readonly RaceListEntry[],
  archive: Pick<AnalysisArchive, 'rows' | 'races'> | null
): McpRaceListAnswer {
  if (archive === null) return { ok: false }

  const archived = new Set(archive.races.map((race) => race.id))
  if (races.length !== archived.size || races.some((race) => !archived.has(race.id))) {
    console.error(
      `MCP list_races: the race list (${races.length}) and the archive (${archived.size}) disagree`
    )
    return { ok: false }
  }

  const ledgers = raceCoverageLedgers(archive.rows)

  return {
    ok: true,
    races: races.map((race) => {
      // No ledger is a Race with no in-window row: nothing logged, which is what it states.
      const ledger = ledgers.get(race.id)

      return {
        ...identity(race),
        window: duration(race.window_seconds),
        logged: duration(ledger?.total_seconds ?? 0),
        countable: duration(ledger?.countable_seconds ?? 0),
      }
    }),
  }
}

function versionRef(ref: BoatSetupVersionRef | null): McpVersionRef | null {
  return ref === null ? null : { versionNumber: ref.version_number, effectiveFrom: ref.effective_from }
}

/**
 * The race page's Polar & VMG efficiency tile, as figures: the same `performance` it renders,
 * through the same percent and the same two Filler-Anchored shares. A Race with no figure says
 * why in the tile's own words.
 */
function performance(track: RaceTrack): McpRacePerformance {
  if (track.plot === null) {
    return {
      scoring: track.scoring === 'polar-unreadable' ? 'polar-unreadable' : 'no-polar-version',
      note: noFigureNote(track.scoring),
    }
  }

  const aggregate = track.plot.performance

  return {
    scoring: 'polar',
    polarEfficiency: {
      ratio: aggregate.polar_efficiency,
      percent: efficiencyPercent(aggregate.polar_efficiency),
      fillerAnchoredShare: fillerAnchoredShare(aggregate),
    },
    vmgEfficiency: {
      ratio: aggregate.vmg_efficiency,
      percent: efficiencyPercent(aggregate.vmg_efficiency),
      // Its own share over its own rows, as on the page.
      fillerAnchoredShare: vmgFillerAnchoredShare(aggregate),
      caveat: TARGET_VMG_CAVEAT,
    },
    scored: duration(aggregate.elapsed_seconds),
  }
}

/**
 * One Race's page as aggregates, for `race_summary`.
 *
 * Pure, and over `readRace`'s own answer, so every figure is one the page derives from the same
 * read: nothing is re-scored, counted or classified here, and no Recording Row is passed on (ADR
 * 0042). The row count the
 * coverage carries for its own seams is left behind (ADR 0037).
 */
export function raceSummary(race: RaceDetail): McpRaceSummary {
  const { coverage, boat_setup: setup } = race

  return {
    race: { ...identity(race), recordingFilename: race.recording.filename },
    boatSetup: {
      polar: versionRef(setup.polar),
      crossoverChart: versionRef(setup.crossover_chart),
      rigTune: versionRef(setup.rig_tune),
      instrumentCalibration: versionRef(setup.instrument_calibration),
      windBand:
        setup.band === null
          ? null
          : { lowKnots: setup.band.low_kt, highKnots: setup.band.high_kt, label: setup.band.label },
      loggedTwsMeanKnots: setup.logged_tws_mean,
    },
    coverage: {
      window: duration(coverage.window_seconds),
      recorded: duration(coverage.live_seconds),
      frozen: duration(coverage.frozen_seconds),
      beforeFirstRow: duration(coverage.lead_gap_seconds),
      afterLastRow: duration(coverage.tail_gap_seconds),
    },
    findings: race.findings.map((finding) => finding.message),
    maneuvers: {
      detectorVersion: MANEUVER_DETECTOR_VERSION,
      counts: maneuverCounts(race.maneuvers),
      flips: race.maneuvers.map((flip) => ({
        at: flip.row_time,
        maneuver: flip.maneuver,
        twaBefore: flip.twa_before,
        twaAfter: flip.twa_after,
      })),
    },
    performance: performance(race.track),
  }
}

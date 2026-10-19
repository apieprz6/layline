import { efficiencyPercent, sharePercent } from '@/services/analysis/figures'
import {
  PATCH_SOG_KNOTS,
  PATCH_TWA_DEG,
  UNDRAWN_REASONS,
  aggregateKnots,
  noPlotNote,
} from '@/services/analysis/polar-plot'
import { fillerAnchoredShare, vmgFillerAnchoredShare } from '@/services/analysis/polar-performance'
import type { RaceSailChartRead } from '@/services/analysis/sail-selection'
import { NO_TRACK_NOTE } from '@/services/analysis/track-heatmap'
import {
  TRACK_OVERLAYS,
  TRACK_SCALES,
  bandLabel,
  isRatioOverlay,
  overlayGate,
} from '@/services/analysis/track-overlays'
import { UNCOLOURED_WORDS } from '@/services/analysis/track-time'
import {
  NO_CELL_NOTE,
  noChartNote,
  unjudgedNote,
  verdictShares,
} from '@/services/races/race-sail-chart'
import type {
  EfficiencyAggregate,
  McpEfficiencyFigure,
  McpPolarPlot,
  McpRaceTrack,
  McpSailChart,
  McpTrackOverlay,
  McpTrackRun,
  RaceDetail,
  RacePolarPlot,
  RaceTrackHeatmap,
  TrackOverlay,
  TrackRun,
} from '@/types'

import { duration, identity } from './races'

function polarFigure(aggregate: EfficiencyAggregate): McpEfficiencyFigure {
  return {
    ratio: aggregate.polar_efficiency,
    percent: efficiencyPercent(aggregate.polar_efficiency),
    fillerAnchoredShare: fillerAnchoredShare(aggregate),
  }
}

function vmgFigure(aggregate: EfficiencyAggregate): McpEfficiencyFigure {
  return {
    ratio: aggregate.vmg_efficiency,
    percent: efficiencyPercent(aggregate.vmg_efficiency),
    fillerAnchoredShare: vmgFillerAnchoredShare(aggregate),
  }
}

function run(overlay: TrackOverlay, each: TrackRun): McpTrackRun {
  return {
    from: each.from,
    to: each.to,
    time: duration(each.seconds),
    band: each.band,
    reason: each.reason,
    label: each.band !== null ? bandLabel(overlay, each.band) : UNCOLOURED_WORDS[each.reason ?? 'no_position'],
    fillerAnchored: isRatioOverlay(overlay) ? duration(each.filler_anchored_seconds) : null,
  }
}

/** One overlay of the map as the legend states it, in time, with its runs. */
function overlayAnswer(overlay: TrackOverlay, heatmap: RaceTrackHeatmap): McpTrackOverlay {
  const scale = TRACK_SCALES[overlay]
  const time = heatmap.time.overlays[overlay]
  const ratio = isRatioOverlay(overlay)

  return {
    overlay,
    title: scale.title,
    unit: scale.unit,
    gate: overlayGate(overlay),
    caveat: scale.caveat ?? null,
    bands: time.bands.map((band) => ({
      band: band.band,
      label: bandLabel(overlay, band.band),
      time: duration(band.seconds),
      fillerAnchored: ratio ? duration(band.filler_anchored_seconds) : null,
    })),
    coverage: {
      coloured: duration(time.coloured_seconds),
      fillerAnchored: ratio ? duration(time.filler_anchored_seconds) : null,
      uncoloured: duration(time.uncoloured_seconds),
      uncolouredBy: time.uncoloured.map((part) => ({
        reason: part.reason,
        label: UNCOLOURED_WORDS[part.reason],
        time: duration(part.seconds),
      })),
    },
    runs: heatmap.runs[overlay].map((each) => run(overlay, each)),
  }
}

/** The Polar Plot's patches and what it draws nowhere, or why there is no plot. */
function polarPlotAnswer(plot: RacePolarPlot | null, scoring: RaceDetail['track']['scoring']): McpPolarPlot {
  if (plot === null) {
    return {
      drawn: false,
      scoring: scoring === 'polar-unreadable' ? 'polar-unreadable' : 'no-polar-version',
      note: noPlotNote(scoring),
    }
  }

  return {
    drawn: true,
    binWidth: { twaDeg: PATCH_TWA_DEG, sogKnots: PATCH_SOG_KNOTS },
    patches: plot.patches.map((patch) => ({
      twaDeg: patch.twa,
      sogKnots: patch.sog,
      meanSogKnots: aggregateKnots(patch.efficiency),
      polarEfficiency: polarFigure(patch.efficiency),
      vmgEfficiency: vmgFigure(patch.efficiency),
      time: duration(patch.efficiency.elapsed_seconds),
    })),
    undrawn: {
      ...duration(plot.undrawn.seconds),
      parts: plot.undrawn.parts.map((part) => ({
        reason: part.reason,
        label: UNDRAWN_REASONS[part.reason],
        time: duration(part.seconds),
      })),
    },
  }
}

/** The sail tile's slice, through the tile's own functions and in its own words. */
function sailChartAnswer(read: RaceSailChartRead): McpSailChart {
  if (!read.ok) return { ok: false, reason: read.reason, note: noChartNote(read.reason) }

  const { agreement } = read
  const note =
    agreement.placed_rows === 0
      ? NO_CELL_NOTE
      : agreement.agreement === null
        ? unjudgedNote(agreement)
        : null

  return {
    ok: true,
    chartVersion: read.chart_version_number,
    agreement: { share: agreement.agreement, percent: efficiencyPercent(agreement.agreement) },
    following: { ...polarFigure(agreement.following), time: duration(agreement.following.elapsed_seconds) },
    differing: { ...polarFigure(agreement.differing), time: duration(agreement.differing.elapsed_seconds) },
    composition: verdictShares(agreement).map((part) => ({ ...part, percent: sharePercent(part.share) })),
    cells: agreement.cells,
    note,
  }
}

/**
 * One Race's track, Polar Plot and sail tile as the race page states them, for `race_track`.
 *
 * Pure, and over `readRace`'s own answer and the tile's own read, so every figure is one the page
 * derives from the same reads: the time in each band, the runs and the coverage are
 * `raceTrackHeatmap`'s, the patches `racePolarPlot`'s, the shares `race-sail-chart.ts`'s. Nothing
 * here sums, bands, gates or divides a figure (ADR 0042); it names and formats them. No Recording
 * Row and no per-row readout leaves it.
 */
export function raceTrack(
  race: RaceDetail,
  sailChart: RaceSailChartRead,
  overlay?: TrackOverlay
): McpRaceTrack {
  const { heatmap, plot, scoring } = race.track

  return {
    race: identity(race),
    window: duration(race.coverage.window_seconds),
    scoring,
    track:
      heatmap === null
        ? null
        : {
            overlays: (overlay === undefined ? TRACK_OVERLAYS : [overlay]).map((each) =>
              overlayAnswer(each, heatmap)
            ),
            dropouts: heatmap.bridges.map((bridge) => ({
              from: bridge.from,
              to: bridge.to,
              time: duration(bridge.seconds),
            })),
            testimony: {
              placed: heatmap.annotations.map((annotation) => ({
                lane: annotation.lane,
                label: annotation.label,
                at: annotation.at,
                secondsFromFix: annotation.gap_seconds,
              })),
              unplaced: heatmap.unplaced_annotations,
            },
          },
    trackNote: heatmap === null ? NO_TRACK_NOTE : null,
    polarPlot: polarPlotAnswer(plot, scoring),
    sailChart: sailChartAnswer(sailChart),
  }
}

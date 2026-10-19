/**
 * Window rows as the **Race Track Heatmap** reads them, shared by the suites that draw a track and
 * that time one, so both read the same fixture the same way.
 */

import { polarTargets } from '@/services/analysis/polar-targets'
import type { TrackHeatmapRow } from '@/services/analysis/track-heatmap'
import type { Maneuver, PolarPayload } from '@/types'

/**
 * A grid whose lightest two angles are the certificate's own manufactured ramp.
 *
 * Rows 30 and 40 are each their own multiple of the base row in both columns, which is the
 * signature `classifyPolarCells` reads as filler; rows 50 and 60 are not, so they are measured. A
 * query bracketing 40 and 50 therefore touches one filler corner — which flags the whole value,
 * because a bracket with three real corners is not a safer unflagged one (ADR 0036).
 */
export const POLAR: PolarPayload = {
  twa_axis: [30, 40, 50, 60],
  tws_axis: [8, 12],
  boat_speed: [
    [1, 1.5],
    [2, 3],
    [6, 7],
    [6.5, 7.5],
  ],
}

export const TARGETS = polarTargets(POLAR)

/** 30-second cadence from 19:00, in the recording's own naive frame. Nothing builds a `Date`. */
export function stamp(index: number): string {
  const total = 19 * 3600 + index * 30
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `2026-06-03T${pad(Math.floor(total / 3600))}:${pad(
    Math.floor((total % 3600) / 60)
  )}:${pad(total % 60)}`
}

export interface RowOptions {
  /** Degrees north of the venue, so a fixture can place a fix or withhold one. */
  north?: number
  frozen?: boolean
  low_speed?: boolean
  maneuver?: Maneuver | null
  /** Knots over the ground. 6.75 is exactly on target at TWA 55 in 10 knots. */
  sog?: string | null
  tws?: string | null
  twa?: string | null
  cog?: string | null
  positioned?: boolean
}

/**
 * One row as the map reads it. **Countable** is composed here the way `analysisRows` composes it,
 * so a fixture cannot claim a frozen row is countable.
 */
export function row(index: number, options: RowOptions = {}): TrackHeatmapRow {
  const {
    north = index * 0.001,
    frozen = false,
    low_speed = false,
    maneuver = null,
    sog = '6.75',
    tws = '10',
    twa = '55',
    cog = '40',
    positioned = true,
  } = options

  return {
    row_index: index,
    row_time: stamp(index),
    quality: {
      row_index: index,
      row_time: stamp(index),
      frozen,
      not_water_referenced: false,
      low_speed,
      gap_seconds: 30,
    },
    maneuver_window: maneuver,
    countable: !frozen && !low_speed && maneuver === null,
    latitude: positioned ? (41.85 + north).toFixed(6) : null,
    longitude: positioned ? (-87.55 + north).toFixed(6) : null,
    sog,
    cog,
    tws,
    twa,
  }
}


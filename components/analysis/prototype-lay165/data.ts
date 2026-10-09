/**
 * PROTOTYPE (LAY-165) — THROWAWAY. The archive, bucketed the three ways the variants draw it.
 *
 * Every figure here comes out of the shipped `sumEfficiency`: a **ratio of sums weighted by each
 * row's own measured elapsed time** (ADR 0036), never a mean of per-row percentages. That is not
 * tidiness — it is the thing that lets a picture sit under a number without arguing with it.
 *
 * ## The radius of the rose is the same arithmetic as the percentage
 *
 * A bin's time-weighted mean speed is `actual_distance_nm / elapsed_seconds`, and its percent of
 * target is `actual_distance_nm / target_distance_nm`. Both fall out of one `EfficiencyAggregate`,
 * so a rose plotted at the first and a figure printed at the second are two readings of one sum.
 * Had the rose averaged `SOG` per row instead, the two would disagree by a little, always, and
 * nobody looking at them could tell which was wrong.
 */

import { sumEfficiency } from '@/services/analysis/efficiency'
import { WIND_THRESHOLDS } from '@/lib/utils/wind'
import type { NotCountableReason } from '@/services/analysis/countable'
import type { AnalysisVocabulary } from '@/services/analysis/filter'
import type {
  AnalysisArchiveRace,
  EfficiencyAggregate,
  MatchableRow,
  PolarCellOrigin,
  RaceTrackHeatmap,
} from '@/types'

export type PrototypeRow = MatchableRow & { excluded: NotCountableReason | null }

export interface PrototypeArchive {
  polar: {
    twa_axis: number[]
    tws_axis: number[]
    boat_speed: number[][]
    origins: PolarCellOrigin[][]
  }
  races: AnalysisArchiveRace[]
  vocabulary: AnalysisVocabulary
  /** The real `raceTrackHeatmap` output for the three Races the per-Race view offers. */
  tracks: Record<string, RaceTrackHeatmap | null>
  rows: PrototypeRow[]
}

/**
 * The four wind bands `AGENTS.md` fixes, read off `WIND_THRESHOLDS` rather than restated — the
 * same source the rail's `wind` chips and the track's `TWS` overlay read.
 *
 * All four are always offered, including Storm, which this archive has not one row of: a band that
 * vanished would not say whether the boat has never sailed in it or the narrowing emptied it
 * (ADR 0014).
 */
export const WIND_BANDS = [
  { id: 'light', label: 'Light', range: `0–${WIND_THRESHOLDS.LIGHT_MAX} kt`, below: WIND_THRESHOLDS.LIGHT_MAX + 1 },
  { id: 'medium', label: 'Medium', range: `${WIND_THRESHOLDS.LIGHT_MAX + 1}–${WIND_THRESHOLDS.MEDIUM_MAX} kt`, below: WIND_THRESHOLDS.MEDIUM_MAX + 1 },
  { id: 'heavy', label: 'Heavy', range: `${WIND_THRESHOLDS.MEDIUM_MAX + 1}–${WIND_THRESHOLDS.HEAVY_MAX} kt`, below: WIND_THRESHOLDS.HEAVY_MAX + 1 },
  { id: 'storm', label: 'Storm', range: `${WIND_THRESHOLDS.HEAVY_MAX + 1} kt and up`, below: Infinity },
] as const

export type WindBandId = (typeof WIND_BANDS)[number]['id']

export function bandOf(tws: number): WindBandId {
  return (WIND_BANDS.find((band) => tws < band.below) ?? WIND_BANDS[WIND_BANDS.length - 1]).id
}

/** Ten degrees. Finer than the certificate's own axis up high, coarser than it is at the floor. */
export const TWA_BIN_DEG = 10

/** The lower edge of a row's `|TWA|` bin: 0, 10, … 170. */
export function twaBinOf(twa: number): number {
  return Math.min(170, Math.floor(Math.abs(twa) / TWA_BIN_DEG) * TWA_BIN_DEG)
}

/** One bucket of rows, summed. `null` where nothing in it could be scored. */
export interface Summed {
  aggregate: EfficiencyAggregate
  /** Time-weighted percent of **Target Speed**, as a ratio. Null where no row carried a target. */
  pct: number | null
  /** Time-weighted mean **SOG**, knots — the same sums the percentage comes from. */
  observed_knots: number | null
  /** Time-weighted mean **Target Speed**, knots. What the certificate said over the same rows. */
  target_knots: number | null
  /** Share of the summed rows whose target touched a manufactured cell (ADR 0036). 0 where none. */
  filler_share: number
  rows: number
  seconds: number
}

export function summed(rows: readonly PrototypeRow[]): Summed {
  const aggregate = sumEfficiency(rows)
  const { actual_distance_nm, target_distance_nm, elapsed_seconds } = aggregate

  return {
    aggregate,
    pct: aggregate.polar_efficiency,
    observed_knots: elapsed_seconds > 0 ? (actual_distance_nm * 3600) / elapsed_seconds : null,
    target_knots:
      elapsed_seconds > 0 && target_distance_nm > 0
        ? (target_distance_nm * 3600) / elapsed_seconds
        : null,
    filler_share: aggregate.rows > 0 ? aggregate.filler_anchored_rows / aggregate.rows : 0,
    rows: aggregate.rows,
    seconds: Math.round(elapsed_seconds),
  }
}

function group<Key>(
  rows: readonly PrototypeRow[],
  keyOf: (row: PrototypeRow) => Key | null
): Map<Key, PrototypeRow[]> {
  const into = new Map<Key, PrototypeRow[]>()

  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const found = into.get(key)
    if (found === undefined) into.set(key, [row])
    else found.push(row)
  }

  return into
}

/** One `|TWA|` bin of one wind band: a point on the rose, and a point on the ratio curve. */
export interface AngleBin extends Summed {
  twa: number
  band: WindBandId
}

/**
 * The rose's and the curve's shared spine: every (wind band × 10° bin) the match reaches.
 *
 * Rows with no `TWA` or no `TWS` are in neither — they are in no bucket of either axis, and the
 * Coverage Ledger above states how many rows the match held, so a row that fell out here is
 * accounted for there rather than silently.
 */
export function angleBins(rows: readonly PrototypeRow[]): AngleBin[] {
  const grouped = group(rows, (row) =>
    row.twa === null || row.tws === null ? null : `${bandOf(row.tws)}|${twaBinOf(row.twa)}`
  )

  return [...grouped.entries()]
    .map(([key, bucket]) => {
      const [band, twa] = key.split('|')
      return { ...summed(bucket), band: band as WindBandId, twa: Number(twa) }
    })
    .sort((left, right) => left.twa - right.twa)
}

/** Every 10° bin across all four bands at once — the curve's "all wind" series. */
export function anglesAcrossBands(rows: readonly PrototypeRow[]): AngleBin[] {
  const grouped = group(rows, (row) => (row.twa === null ? null : twaBinOf(row.twa)))

  return [...grouped.entries()]
    .map(([twa, bucket]) => ({ ...summed(bucket), band: 'light' as WindBandId, twa }))
    .sort((left, right) => left.twa - right.twa)
}

/** One cell of the certificate's own grid, as the rows reached it. */
export interface GridCell extends Summed {
  twa_index: number
  tws_index: number
  /** What the certificate says this cell is: measured, interpolated, ramp filler, or empty. */
  origin: PolarCellOrigin
  /** The certificate's own boat speed in this cell, knots. */
  certificate_knots: number
}

/**
 * The archive laid on the certificate's own 16 × 9 grid, floor-bracketed.
 *
 * Floor and not nearest, and deliberately **not** the bilinear bracket a row's Target Speed is
 * actually read from: a row at 47° between the 45 and 52 rows contributes to one cell here while
 * its own figure came from two. That is the honest cost of a grid-shaped picture and the reason it
 * is only one of the three variants — the cell a row is *drawn* in is not the cell it was *scored*
 * against, and no amount of styling makes a 16 × 9 grid say otherwise.
 */
export function gridCells(
  rows: readonly PrototypeRow[],
  polar: PrototypeArchive['polar']
): GridCell[] {
  const floorOn = (axis: readonly number[], at: number): number | null => {
    let found: number | null = null
    for (const [index, entry] of axis.entries()) if (at >= entry) found = index
    return found
  }

  const grouped = group(rows, (row) => {
    if (row.twa === null || row.tws === null) return null
    const twaAt = floorOn(polar.twa_axis, Math.abs(row.twa))
    const twsAt = floorOn(polar.tws_axis, row.tws)
    return twaAt === null || twsAt === null ? null : `${twaAt}|${twsAt}`
  })

  return [...grouped.entries()].map(([key, bucket]) => {
    const [twa_index, tws_index] = key.split('|').map(Number)
    return {
      ...summed(bucket),
      twa_index,
      tws_index,
      origin: polar.origins[twa_index][tws_index],
      certificate_knots: polar.boat_speed[twa_index][tws_index],
    }
  })
}

/**
 * The certificate's own curve at one wind speed, with each point's trust attached.
 *
 * The trust is per cell, so the curve is drawn in two kinds of ink along its own length — which is
 * the whole of LAY-150's finding made visible: on this certificate the first anchorable angle is
 * 52° at 4 knots, 45° at 6 and 8, and 40° from 10 up. A single inner radius would be wrong in
 * eight of nine columns.
 */
export interface CertificatePoint {
  twa: number
  knots: number
  origin: PolarCellOrigin
}

export function certificateCurve(
  polar: PrototypeArchive['polar'],
  twsIndex: number
): CertificatePoint[] {
  return polar.twa_axis.map((twa, row) => ({
    twa,
    knots: polar.boat_speed[row][twsIndex],
    origin: polar.origins[row][twsIndex],
  }))
}

/** Whether a cell may anchor a figure without flagging it (`isAnchorable`, restated for the client). */
export function anchorable(origin: PolarCellOrigin): boolean {
  return origin === 'measured' || origin === 'interpolated'
}

/** The lowest `|TWA|` the certificate can answer unflagged at each wind speed. The ragged floor. */
export function trustFloors(polar: PrototypeArchive['polar']): (number | null)[] {
  return polar.tws_axis.map((_, column) => {
    const row = polar.origins.findIndex((cells) => anchorable(cells[column]))
    return row === -1 ? null : polar.twa_axis[row]
  })
}

/** Rows that are drawn but carry no figure, by the reason they carry none. */
export function unscored(rows: readonly PrototypeRow[]): Record<string, number> {
  const into: Record<string, number> = {}

  for (const row of rows) {
    const reason =
      row.excluded ??
      (row.efficiency.target_speed === null
        ? row.tws === null || row.twa === null
          ? 'no_reading'
          : 'off_the_grid'
        : null)

    if (reason !== null) into[reason] = (into[reason] ?? 0) + 1
  }

  return into
}

/** `6 of 13 races`, `1 h 12 m` — small shared phrasings, so three variants cannot word them three ways. */
export function raceCount(rows: readonly PrototypeRow[]): number {
  return new Set(rows.map((row) => row.race_id)).size
}

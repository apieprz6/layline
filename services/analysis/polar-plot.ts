/**
 * The **Polar Plot**'s arithmetic: what is drawn, where, and against which certificate (ADR 0040).
 *
 * Isomorphic and pure, like everything in this directory (ADR 0029). The season screen runs it in
 * the browser on every move of the focus window; the per-Race page runs it on the server and ships
 * the result; the Overall tab's teaser runs it during a server render.
 *
 * ## One set of rows, one set of sums
 *
 * A moment is drawn exactly when `sumEfficiency` would sum it — **Countable**, a measured interval,
 * a speed and a **Target Speed** — so the picture and the figure printed above it are of the same
 * sailing. A patch's figure *is* `sumEfficiency` over the rows in it, never a second accumulation
 * written here: a patch, a focus window and the headline then add up from one set of sums (ADR
 * 0036), and a colour on the plot can never disagree with the number above it by a rounding a
 * sailor would have to explain.
 *
 * ## Why the certificate is a family
 *
 * No two moments share a comparison point: each was scored at its own angle and its own wind, and
 * `targetSpeed` interpolates between the two certificate columns either side of that wind (ADR
 * 0028). So behind the sailing go **every column the drawn sailing was actually scored against**,
 * read off the same bracket the figure read — never one curve at a mean wind, which is a reference
 * almost nothing on the picture was measured against.
 */

import { sumEfficiency } from '@/services/analysis/efficiency'
import type { ScorableRow, SummableRow } from '@/services/analysis/efficiency'
import { measureAndScore } from '@/services/analysis/matchable-rows'
import type { PolarTargets } from '@/services/analysis/polar-targets'
import { bracketingValues, polarTargets } from '@/services/analysis/polar-targets'
import { channelValue } from '@/services/analysis/readable-rows'
import type {
  CertificateCurve,
  CertificateFamily,
  CertificateRun,
  EfficiencyAggregate,
  PolarPayload,
  PolarPlotPatch,
  PolarPlotMoment,
  PolarPlotTraceBin,
  PolarPlotUndrawn,
  PolarPlotUndrawnReason,
  RacePolarPlot,
} from '@/types'

/**
 * What the Polar Plot reads of a row. A `MatchableRow` satisfies it structurally, and so does the
 * per-Race page's own scoring of its Transcription.
 */
export interface PlottableRow extends SummableRow {
  race_id: string
  row_index: number
  tws: number | null
  /** Signed, −180..180, positive = starboard (ADR 0008). */
  twa: number | null
  polar_version_id: string | null
}

/** A plottable row that carries everything a dot needs. */
type ScoredRow = PlottableRow & {
  tws: number
  twa: number
  sog: number
  interval_seconds: number
  efficiency: PlottableRow['efficiency'] & {
    target_speed: NonNullable<PlottableRow['efficiency']['target_speed']>
    polar_efficiency: number
  }
}

/**
 * Whether a row is drawn: `sumEfficiency`'s own test, plus the percent a dot is coloured by.
 *
 * The one place the two part: a target of zero knots, a certificate's ramp meeting 0°, which no
 * boat sails. `sumEfficiency` still sums such a row (its distance, against no target distance);
 * no colour could mean anything at it, so it is drawn nowhere and `timeNotDrawn` says why.
 */
function isScored(row: PlottableRow): row is ScoredRow {
  return (
    row.countable &&
    row.interval_seconds !== null &&
    row.sog !== null &&
    row.twa !== null &&
    row.tws !== null &&
    row.efficiency.target_speed !== null &&
    row.efficiency.polar_efficiency !== null
  )
}

/** Every scored row as its own dot: the per-Race form (ADR 0040). */
export function plotMoments(rows: readonly PlottableRow[]): PolarPlotMoment[] {
  return rows.filter(isScored).map((row) => ({
    race_id: row.race_id,
    row_index: row.row_index,
    twa: row.twa,
    tws: row.tws,
    sog: row.sog,
    target_knots: row.efficiency.target_speed.knots,
    polar_efficiency: row.efficiency.polar_efficiency,
    filler_anchored: row.efficiency.target_speed.filler_anchored,
    seconds: row.interval_seconds,
  }))
}

// ---------------------------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------------------------

/** A patch is 5° of `|TWA|` by half a knot of `SOG`. */
export const PATCH_TWA_DEG = 5
export const PATCH_SOG_KNOTS = 0.5

/** The lower edge of a `|TWA|` bin. 180° belongs to the last bin rather than opening one past it. */
function angleBin(twa: number, width: number): number {
  return Math.min(180 - width, Math.floor(Math.abs(twa) / width) * width)
}

/** The patch a row lands in. */
function patchOf(row: ScoredRow): { twa: number; sog: number } {
  return {
    twa: angleBin(row.twa, PATCH_TWA_DEG),
    sog: Math.floor(row.sog / PATCH_SOG_KNOTS) * PATCH_SOG_KNOTS,
  }
}

/**
 * The plane binned into patches, in reading order — angle first, then out from the centre — which
 * is the order `←`/`→` walk them in.
 *
 * Binned on both axes rather than on angle alone, so the spread survives as the shape of the
 * patches: a mean per angle is the line ADR 0040 rejected.
 */
export function plotPatches(rows: readonly PlottableRow[]): PolarPlotPatch[] {
  const into = new Map<string, { twa: number; sog: number; rows: ScoredRow[] }>()

  for (const row of rows) {
    if (!isScored(row)) continue
    const at = patchOf(row)
    const key = `${at.twa}|${at.sog}`
    const found = into.get(key)
    if (found === undefined) into.set(key, { ...at, rows: [row] })
    else found.rows.push(row)
  }

  return [...into.entries()]
    .map(([key, patch]) => ({
      key,
      twa: patch.twa,
      sog: patch.sog,
      efficiency: sumEfficiency(patch.rows),
      races: new Set(patch.rows.map((row) => row.race_id)).size,
    }))
    .sort((left, right) => left.twa - right.twa || left.sog - right.sog)
}

/**
 * Time-weighted knots out of a sum: distance over time, the same arithmetic the percentage is.
 *
 * Had a patch or a slice averaged `SOG` per row instead, its radius would disagree with the
 * percent beside it by a little, always.
 */
export function aggregateKnots(efficiency: EfficiencyAggregate): number | null {
  return efficiency.elapsed_seconds > 0
    ? (efficiency.actual_distance_nm * 3600) / efficiency.elapsed_seconds
    : null
}

/** The target the sailing in a sum was scored against, time-weighted, in knots. */
export function aggregateTargetKnots(efficiency: EfficiencyAggregate): number | null {
  return efficiency.elapsed_seconds > 0 && efficiency.target_distance_nm > 0
    ? (efficiency.target_distance_nm * 3600) / efficiency.elapsed_seconds
    : null
}

/**
 * Knots at the rim: past the fastest thing a screen will draw — every moment, the top of every
 * patch it lands in, every certificate cell — on an even knot so the rings land on round numbers.
 *
 * Over everything the screen holds rather than what is drawn this instant, so the rim does not
 * move as the focus window does. Never clamped *down* to a fixed figure: a dot beyond a fixed rim
 * would have to be pinned to it, and a speed drawn slower than it was is the one thing this
 * picture must not do.
 */
export function rimKnots(
  moments: readonly { sog: number }[],
  polars: readonly PolarPayload[],
  also: readonly number[] = []
): number {
  const fastest = Math.max(
    4,
    ...moments.map((moment) => moment.sog + PATCH_SOG_KNOTS),
    ...polars.flatMap((polar) => polar.boat_speed.flat()),
    ...also
  )
  return Math.ceil(fastest / 2) * 2
}

/**
 * Every speed the certificate columns in `families` reach: `rimKnots`'s `also`, for a picture that
 * draws only those columns and so need not leave room for the rest of the certificate.
 *
 * The teaser's case. It draws the columns the sailing was scored against and has no focus window to
 * move, so a rim set by the whole Polar — its 20 kt column, on an afternoon of eight — is a ring
 * nothing on the card reaches, and the drawing sits in the middle of an empty frame. Nothing is
 * clamped by fitting it: the moments still go to `rimKnots` alongside, and still clear it.
 */
export function familyKnots(families: readonly CertificateFamily[]): number[] {
  return families.flatMap((family) =>
    family.curves.flatMap((curve) =>
      curve.runs.flatMap((run) => run.points.map((point) => point.knots))
    )
  )
}

// ---------------------------------------------------------------------------------------------
// The focus window
// ---------------------------------------------------------------------------------------------

/**
 * The widths a sailor may pick, in knots.
 *
 * Uniform at every centre, which is the whole of ADR 0040's reason for not stepping the
 * certificate's own columns: those are unevenly spaced, so a window built from them changed size
 * under the thumb (2, 4, 4, 4, 4, 4, 6, 8, then everything above 20).
 */
export const FOCUS_WIDTHS = [2, 4, 6] as const
export type FocusWidth = (typeof FOCUS_WIDTHS)[number]

/** Where the window opens: 10 knots, ± 2. */
export const DEFAULT_FOCUS = { centre: 10, width: 4 } satisfies { centre: number; width: FocusWidth }

export interface FocusWindow {
  /** Inclusive. */
  low: number
  /** Exclusive, so two windows side by side never both claim a row. */
  high: number
}

export function focusWindow(centre: number, width: number): FocusWindow {
  return { low: centre - width / 2, high: centre + width / 2 }
}

/** The rows inside a window. A row with no wind reading is in no window. */
export function inFocus<Row extends { tws: number | null }>(
  rows: readonly Row[],
  window: FocusWindow
): Row[] {
  return rows.filter((row) => row.tws !== null && row.tws >= window.low && row.tws < window.high)
}

/**
 * The slider's travel: the certificates' wind range, in whole knots.
 *
 * The certificate's range and not the archive's, so a window past the last row is somewhere the
 * sailor can land and be told nothing was sailed there, rather than somewhere they cannot reach.
 * Null where no Polar has a wind axis at all.
 */
export function focusRange(polars: readonly PolarPayload[]): { from: number; to: number } | null {
  const axes = polars.map((polar) => polar.tws_axis).filter((axis) => axis.length > 0)
  if (axes.length === 0) return null

  return {
    from: Math.ceil(Math.min(...axes.map((axis) => axis[0]))),
    to: Math.floor(Math.max(...axes.map((axis) => axis[axis.length - 1]))),
  }
}

/** A centre the slider can hold: inside the range, on a whole knot. */
export function clampCentre(centre: number, range: { from: number; to: number }): number {
  return Math.min(range.to, Math.max(range.from, Math.round(centre)))
}

// ---------------------------------------------------------------------------------------------
// The certificate family
// ---------------------------------------------------------------------------------------------

/**
 * The columns a set of moments was scored against: for each wind, the one column an exact hit
 * reads or the two either side of it.
 */
export function familyColumns(polar: PolarPayload, winds: readonly number[]): number[] {
  const columns = new Set<number>()
  for (const tws of winds) for (const column of bracketingValues(polar.tws_axis, tws)) columns.add(column)

  return [...columns].sort((left, right) => left - right)
}

/**
 * The certificate behind the sailing, column by column, in two inks.
 *
 * Each column is read through the shipped `targetSpeed` at every tabulated angle, so it stops
 * where the grid stops (ADR 0028) and every point knows whether its lookup touched the file's
 * manufactured ramp (ADR 0036). A **leg between two angles** is manufactured where either end is:
 * a target interpolated between a ramp cell and a measured one reads the ramp, which is exactly
 * the bracket `targetSpeed` would flag. That is what makes the family's inner edge the staircase
 * it is on this boat — 52° at 4 kt, 45° at 6 and 8, 40° from 10 up — rather than a radius.
 *
 * A point the Polar cannot answer breaks the curve rather than being bridged.
 */
export function certificateFamily(
  polar: PolarPayload,
  winds: readonly number[]
): CertificateCurve[] {
  const targets = polarTargets(polar)

  return familyColumns(polar, winds).map((tws) => {
    const runs: CertificateRun[] = []
    let previous: { twa: number; knots: number; filler: boolean } | null = null

    for (const twa of polar.twa_axis) {
      const target = targets.targetSpeed(twa, tws)

      if (target === null) {
        previous = null
        continue
      }

      const point = { twa, knots: target.knots, filler: target.filler_anchored }

      if (previous !== null) {
        const filler_anchored = previous.filler || point.filler
        const last = runs[runs.length - 1]
        const continues =
          last !== undefined &&
          last.filler_anchored === filler_anchored &&
          last.points[last.points.length - 1].twa === previous.twa

        if (continues) last.points.push({ twa, knots: point.knots })
        else
          runs.push({
            filler_anchored,
            points: [
              { twa: previous.twa, knots: previous.knots },
              { twa, knots: point.knots },
            ],
          })
      }

      previous = point
    }

    return { tws, runs }
  })
}

/**
 * The family behind a season's rows, one per **Polar Version** in play.
 *
 * Grouped by Version because a season can span a Polar update, and each Race is compared to the
 * grid in force when it was sailed (ADR 0012): a column read off today's certificate would be a
 * reference the older rows were never measured against.
 */
export function familiesFor(
  rows: readonly PlottableRow[],
  polars: Readonly<Record<string, PolarPayload>>
): CertificateFamily[] {
  const winds = new Map<string, number[]>()

  for (const row of rows) {
    if (!isScored(row) || row.polar_version_id === null) continue
    const found = winds.get(row.polar_version_id)
    if (found === undefined) winds.set(row.polar_version_id, [row.tws])
    else found.push(row.tws)
  }

  return [...winds.entries()].flatMap(([version_id, tws]) => {
    const polar = polars[version_id]
    return polar === undefined ? [] : [{ version_id, curves: certificateFamily(polar, tws) }]
  })
}

// ---------------------------------------------------------------------------------------------
// The season trace, and what is not drawn
// ---------------------------------------------------------------------------------------------

/** The season trace's slice: ten degrees. */
export const TRACE_TWA_DEG = 10

/**
 * The season as ten-degree sums: the dotted accent line behind one Race (ADR 0040).
 *
 * A mean line, and the one place the Polar Plot draws one — as a reference *for us* behind a race,
 * not as the picture of anything. Ratio of sums like every figure here.
 */
export function seasonTrace(rows: readonly PlottableRow[]): PolarPlotTraceBin[] {
  const into = new Map<number, ScoredRow[]>()

  for (const row of rows) {
    if (!isScored(row)) continue
    const twa = angleBin(row.twa, TRACE_TWA_DEG)
    const found = into.get(twa)
    if (found === undefined) into.set(twa, [row])
    else found.push(row)
  }

  return [...into.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([twa, bucket]) => {
      const efficiency = sumEfficiency(bucket)
      const knots = aggregateKnots(efficiency)

      return knots === null
        ? []
        : [
            {
              twa,
              knots,
              polar_efficiency: efficiency.polar_efficiency,
              seconds: efficiency.elapsed_seconds,
            },
          ]
    })
}

/**
 * Why a row is drawn nowhere, or null where it is drawn.
 *
 * In the order a sailor would ask: whether it could be read at all, whether there was anything to
 * compare it against, whether the recording gave the figures to compare, and only then whether
 * the certificate could answer.
 */
function undrawnReason(row: PlottableRow): PolarPlotUndrawnReason | null {
  if (isScored(row)) return null
  if (!row.countable) return 'not_countable'
  if (row.polar_version_id === null) return 'no_polar'
  if (row.sog === null || row.tws === null || row.twa === null) return 'no_reading'
  if (row.efficiency.target_speed !== null) return 'zero_target'
  return 'off_the_certificate'
}

/**
 * How much of these rows is on no Polar Plot, and why — in time, never in rows (ADR 0037).
 *
 * A row with no measured interval adds nothing: it lasted no span anybody measured, so there is
 * no amount of sailing for it to be.
 */
export function timeNotDrawn(rows: readonly PlottableRow[]): PolarPlotUndrawn {
  const by = new Map<PolarPlotUndrawnReason, number>()

  for (const row of rows) {
    const reason = undrawnReason(row)
    if (reason === null || row.interval_seconds === null || row.interval_seconds <= 0) continue
    by.set(reason, (by.get(reason) ?? 0) + row.interval_seconds)
  }

  const parts = [...by.entries()]
    .map(([reason, seconds]) => ({ reason, seconds }))
    .sort((left, right) => right.seconds - left.seconds)

  return { seconds: parts.reduce((total, part) => total + part.seconds, 0), parts }
}

// ---------------------------------------------------------------------------------------------
// One Race
// ---------------------------------------------------------------------------------------------

/**
 * One Race's Polar Plot, from the in-window rows its track draws.
 *
 * Measured and scored by `measureAndScore`, the function the season's rows are built with, so a
 * dot here is the same moment, at the same interval and the same percent, as it is on the Polar
 * performance screen. On the server: the client is handed the moments and never re-scores one.
 *
 * `rows` must be the window's rows in file order and nothing else, for the reason
 * `measureAndScore` states.
 */
export function racePolarPlot(
  rows: readonly ScorableRow[],
  race: { id: string; polar_version_id: string },
  polar: PolarPayload,
  targets: PolarTargets
): RacePolarPlot {
  const plottable = racePlottableRows(rows, race, targets)
  return {
    moments: plotMoments(plottable),
    polar,
    polar_version_id: race.polar_version_id,
    undrawn: timeNotDrawn(plottable),
    // The rows the dots are, summed: the Race's two figures, from the same payload as the picture.
    performance: sumEfficiency(plottable),
  }
}

/** The same rows, measured and scored, before they are reduced to dots. */
export function racePlottableRows(
  rows: readonly ScorableRow[],
  race: { id: string; polar_version_id: string },
  targets: PolarTargets
): PlottableRow[] {
  const measured = measureAndScore(rows, targets)

  return rows.map((row, index) => ({
    race_id: race.id,
    row_index: row.row_index,
    tws: channelValue(row.tws),
    twa: channelValue(row.twa),
    sog: channelValue(row.sog),
    countable: row.countable,
    interval_seconds: measured[index].interval_seconds,
    efficiency: measured[index].efficiency,
    polar_version_id: race.polar_version_id,
  }))
}

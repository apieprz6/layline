/**
 * PROTOTYPE — LAY-149. **Throwaway.** Types over `charts.json`, which `compute-charts.py` writes
 * from the owner's real archive (13 Races). Unlike LAY-147's fixture, nothing here is invented.
 *
 * The `STW` fit's slope and intercept never leave the Python: `charts.json` carries only `R²`, the
 * bias in knots, and the line's two end points for drawing its shape (ADR 0027).
 */
import raw from './charts.json'

export type Channel = 'hdg' | 'awa' | 'stw'

export interface Bin {
  c: number
  /** Rows in this heading bin for this Race, including bins under the gate. */
  n: number
  /** Mean error, or `null` when the bin held fewer than 3 rows. Never interpolated. */
  m: number | null
}

export type HdgResult =
  | {
      ok: true
      points: number
      mean: number
      std: number
      maxAbs: number
      coverage: number
      bins: Bin[]
    }
  | { ok: false; reason: string; points: number }

export interface Pair {
  t: string
  pos: 'upwind' | 'downwind'
  stbd: number
  port: number
  off: number
  rows: number
}

export type AwaResult =
  | {
      ok: true
      points: number
      segments: number
      pairs: Pair[]
      up: number | null
      upN: number
      down: number | null
      downN: number
      overall: number
    }
  | { ok: false; reason: string; points: number; segments?: number }

export interface StwResult {
  points: number
  blank: number
  xy: [number, number][]
  spread?: number
  fit: { r2: number; bias: number } | null
  gate: string | null
  line?: [[number, number], [number, number]] | null
}

export interface Race {
  id: string
  date: string
  label: string
  hours: number
  inWindow: number
  countable: number
  hdgEra: 1 | 2
  hdg: HdgResult
  awa: AwaResult
  stw: StwResult
}

export interface HdgEra {
  era: 1 | 2
  from: string
  races: number
  excluded: string[]
  binMean: number
  raceMean: number
  raceStd: number
  coverage: number
  worst: { c: number; m: number; races: number } | null
  bins: { c: number; m: number | null; races: number }[]
}

interface Charts {
  races: Race[]
  hdgEras: HdgEra[]
  awaEra: {
    races: number
    up: number
    upRaces: number
    upPairs: number
    down: number
    downRaces: number
    downPairs: number
    beforeAutocomp: number
    afterAutocomp: number
  }
  stwEra: {
    races: number
    fit: { r2: number; bias: number }
    line: [[number, number], [number, number]]
    points: number
    blank: number
    blankPct: number
  }
}

/** Variant keys and names live here, not in the 'use client' variant files, so the Server
 *  Component page reads them as values rather than as client references. */
export const VARIANT_NAMES = {
  A: 'Rose & overlay',
  B: 'Strip & evidence',
  C: 'Races as small multiples',
  D: 'Recommended mix',
} as const
export type VariantKey = keyof typeof VARIANT_NAMES

export const CHARTS = raw as unknown as Charts
export const RACES = CHARTS.races
export const AUTOCOMP = '2026-07-04'

export const REASON_WORDS: Record<string, string> = {
  'too-few-points': 'too few valid rows',
  'too-few-segments': 'too few steady segments',
  'no-pairs': 'no tack pairs within 5 min',
  'narrow-spread': 'SOG spread under 3 kt',
}

export function signed(value: number, unit: string, places = 1): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(places)}${unit}`
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]}`
}

export function raceName(race: Race): string {
  return `${shortDate(race.date)} · ${race.label}`
}

/** Pairs across every Race, tagged with the Race they came from. */
export function allPairs(): (Pair & { race: Race })[] {
  return RACES.flatMap((race) => (race.awa.ok ? race.awa.pairs.map((p) => ({ ...p, race })) : []))
}

export const CHANNEL_TITLES: Record<Channel, { label: string; term: string }> = {
  hdg: { label: 'Compass', term: 'Measured Offset for HDG, via COG' },
  awa: { label: 'Wind angle, tack to tack', term: 'Apparent Wind Asymmetry — not a Measured Offset' },
  stw: { label: 'Boat speed', term: 'Measured Offset for STW, via SOG' },
}

export const CAVEATS: Record<Channel, string> = {
  hdg: 'Measured against CTW, which is HDG plus leeway. This boat has no heel sensor, so leeway is taken as zero — part of any figure here may be leeway rather than compass.',
  awa: 'The recording’s AWA is qtVlm’s recomputation from TWS, TWA and STW, never the masthead’s own reading. An asymmetry here may be the vane, the compass, or qtVlm’s true-wind model — it cannot be pinned on one.',
  stw: 'Assumes current is negligible on this venue. The 1:1 line is the paddlewheel as currently configured; no uncorrected reading is reconstructed.',
}

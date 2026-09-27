/**
 * PROTOTYPE — LAY-144. Throwaway; delete with the prototype route.
 *
 * The bits all three variants agree on, so the variants can disagree about
 * everything else: what a dimension is, what a bucket is, how a row is matched,
 * and how a filter is written into (or kept out of) the URL.
 *
 * Deliberately NOT the real thing. `services/analysis/` will own row matching for
 * real (ADR 0026), against resolved Annotations rather than a flat fixture.
 */

import {
  MONTH_IDS,
  POS_IDS,
  RACES,
  ROWS,
  SAIL_DEFS,
  SEA_IDS,
  TIME_IDS,
  WIND_IDS,
  type PrototypeRow,
} from './fixture'

// --- tuple field indices, so the variants never index by magic number ---------

const RACE = 0
const TWA = 1
const TWS = 2
const PCT = 3
const WIND = 4
const POS = 5
const SAIL = 6
const SEA = 7
const TIME = 8
const MONTH = 9

/**
 * Which variant the `?variant=` param names. Lives here rather than beside the
 * switcher because the Server Component sanitises the param before render, and a
 * `'use client'` module's functions cannot be called from the server.
 */
export type VariantKey = 'A' | 'B' | 'C'

export const VARIANT_KEYS: VariantKey[] = ['A', 'B', 'C']

export const isVariantKey = (v: unknown): v is VariantKey =>
  typeof v === 'string' && (VARIANT_KEYS as string[]).includes(v)

/** `-1` in the fixture: the Race carries no Annotation for this dimension at all. */
export const NOT_RECORDED = 'not-recorded'
/** A Sail Configuration exists but names no Sail Definition — a note alone. */
export const NOTE_ONLY = 'note-only'

export type DimensionId = 'wind' | 'pos' | 'sail' | 'sea' | 'time' | 'date'

export type Bucket = {
  id: string
  label: string
  /** True for the two buckets that describe the record rather than the water. */
  aboutTheRecord?: boolean
}

export type Dimension = {
  id: DimensionId
  label: string
  buckets: Bucket[]
  /** Which screens this dimension earns its place on. See the LAY-144 writeup. */
  screens: Array<'polar' | 'sail-selection' | 'tuning'>
  /**
   * Where the bucket list comes from. A fixed vocabulary can be laid out once and
   * trusted; a derived one changes shape as the archive grows, which is the whole
   * reason `date` cannot be a plain chip row.
   */
  source: 'fixed-vocabulary' | 'derived-from-archive'
}

const seaLabels: Record<string, string> = {
  calm: 'Calm (0–1 ft)',
  slight: 'Slight (1–2 ft)',
  moderate: 'Moderate (2–3 ft)',
  rough: 'Rough (3+ ft)',
}

const windLabels: Record<string, string> = {
  light: 'Light (0–8 kt)',
  medium: 'Medium (9–15 kt)',
  heavy: 'Heavy (16–22 kt)',
  storm: 'Storm (23+ kt)',
}

const posLabels: Record<string, string> = {
  upwind: 'Upwind',
  reach: 'Reach',
  downwind: 'Downwind',
}

const monthLabel = (id: string): string => {
  const [y, m] = id.split('-')
  const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(m) - 1
  ]
  return `${name} ${y}`
}

export const DIMENSIONS: Dimension[] = [
  {
    id: 'wind',
    label: 'Wind speed',
    source: 'fixed-vocabulary',
    screens: ['polar', 'sail-selection', 'tuning'],
    buckets: WIND_IDS.map((id) => ({ id, label: windLabels[id] })),
  },
  {
    id: 'pos',
    label: 'Point of sail',
    source: 'fixed-vocabulary',
    screens: ['polar', 'sail-selection', 'tuning'],
    buckets: POS_IDS.map((id) => ({ id, label: posLabels[id] })),
  },
  {
    id: 'sail',
    label: 'Sail used',
    source: 'derived-from-archive',
    // Note it is missing from 'sail-selection': the chart's own answer IS the sail,
    // so filtering by it narrows away the axis being read. One of the three
    // questions this prototype puts in front of a human.
    screens: ['polar'],
    buckets: [
      ...Object.keys(SAIL_DEFS).map((n) => ({ id: n, label: SAIL_DEFS[Number(n)] })),
      { id: NOTE_ONLY, label: 'Note only', aboutTheRecord: true },
      { id: NOT_RECORDED, label: 'Not recorded', aboutTheRecord: true },
    ],
  },
  {
    id: 'sea',
    label: 'Sea state',
    source: 'fixed-vocabulary',
    screens: ['polar', 'sail-selection', 'tuning'],
    buckets: [
      ...SEA_IDS.map((id) => ({ id, label: seaLabels[id] })),
      { id: NOT_RECORDED, label: 'Not recorded', aboutTheRecord: true },
    ],
  },
  {
    id: 'time',
    label: 'Time of day',
    source: 'fixed-vocabulary',
    screens: ['polar', 'sail-selection', 'tuning'],
    buckets: TIME_IDS.map((id) => ({ id, label: id === 'day' ? 'Day' : 'Night' })),
  },
  {
    id: 'date',
    label: 'When',
    source: 'derived-from-archive',
    screens: ['polar', 'sail-selection', 'tuning'],
    buckets: MONTH_IDS.map((id) => ({ id, label: monthLabel(id) })),
  },
]

export const dimension = (id: DimensionId): Dimension =>
  DIMENSIONS.find((d) => d.id === id) as Dimension

// --- the filter --------------------------------------------------------------

/**
 * An empty array means "not narrowed" — every bucket, Not recorded included.
 * That is how ADR 0026's "Unknown is on by default" falls out for free, without
 * an untouched filter having to pre-select anything.
 */
export type PrototypeFilter = {
  wind: string[]
  pos: string[]
  sail: string[]
  sea: string[]
  time: string[]
  /** Month buckets. Mutually exclusive with `range` in every variant. */
  date: string[]
  /** An explicit custom window, `YYYY-MM-DD`. The escape hatch chips can't express. */
  range: { from: string; to: string } | null
}

export const EMPTY_FILTER: PrototypeFilter = {
  wind: [],
  pos: [],
  sail: [],
  sea: [],
  time: [],
  date: [],
  range: null,
}

export const isUntouched = (f: PrototypeFilter): boolean => activeDimensions(f).length === 0

export const activeDimensions = (f: PrototypeFilter): DimensionId[] => {
  const out: DimensionId[] = []
  if (f.wind.length) out.push('wind')
  if (f.pos.length) out.push('pos')
  if (f.sail.length) out.push('sail')
  if (f.sea.length) out.push('sea')
  if (f.time.length) out.push('time')
  if (f.date.length || f.range) out.push('date')
  return out
}

export const selected = (f: PrototypeFilter, dim: DimensionId): string[] =>
  dim === 'date' ? f.date : f[dim]

export const toggleBucket = (
  f: PrototypeFilter,
  dim: DimensionId,
  bucketId: string,
): PrototypeFilter => {
  const key = dim === 'date' ? 'date' : dim
  const current = selected(f, dim)
  const next = current.includes(bucketId)
    ? current.filter((b) => b !== bucketId)
    : [...current, bucketId]
  const out = { ...f, [key]: next } as PrototypeFilter
  // Picking a month abandons a custom range; they are two ways to say one thing.
  if (dim === 'date') out.range = null
  return out
}

export const clearDimension = (f: PrototypeFilter, dim: DimensionId): PrototypeFilter => {
  const out = { ...f, [dim === 'date' ? 'date' : dim]: [] } as PrototypeFilter
  if (dim === 'date') out.range = null
  return out
}

// --- matching ----------------------------------------------------------------

const rowBucket = (row: PrototypeRow, dim: DimensionId): string => {
  switch (dim) {
    case 'wind':
      return WIND_IDS[row[WIND]]
    case 'pos':
      return POS_IDS[row[POS]]
    case 'time':
      return TIME_IDS[row[TIME]]
    case 'sea':
      return row[SEA] === -1 ? NOT_RECORDED : SEA_IDS[row[SEA]]
    case 'sail':
      return row[SAIL] === -1 ? NOT_RECORDED : row[SAIL] === 0 ? NOTE_ONLY : String(row[SAIL])
    case 'date':
      return MONTH_IDS[row[MONTH]]
  }
}

export const rowDate = (row: PrototypeRow): string => {
  const race = RACES.find((r) => r.id === row[RACE])
  return race ? race.start.slice(0, 10) : ''
}

/** True if `row` satisfies every dimension of `f` except those in `ignoring`. */
export const matches = (
  row: PrototypeRow,
  f: PrototypeFilter,
  ignoring: DimensionId[] = [],
): boolean => {
  for (const dim of ['wind', 'pos', 'sail', 'sea', 'time', 'date'] as DimensionId[]) {
    if (ignoring.includes(dim)) continue
    const picked = selected(f, dim)
    if (picked.length && !picked.includes(rowBucket(row, dim))) return false
  }
  if (f.range && !ignoring.includes('date')) {
    const d = rowDate(row)
    if (d < f.range.from || d > f.range.to) return false
  }
  return true
}

export const matchedRows = (f: PrototypeFilter): PrototypeRow[] => ROWS.filter((r) => matches(r, f))

export type MatchStats = {
  rows: number
  totalRows: number
  races: number
  totalRaces: number
  avgPct: number | null
  /** Rows that matched but carry no Annotation for a dimension the sailor can filter. */
  notRecordedRows: Record<'sea' | 'sail', number>
}

export const matchStats = (f: PrototypeFilter): MatchStats => {
  const rows = matchedRows(f)
  const pcts = rows.map((r) => r[PCT]).filter((p): p is number => p !== null)
  return {
    rows: rows.length,
    totalRows: ROWS.length,
    races: new Set(rows.map((r) => r[RACE])).size,
    totalRaces: RACES.length,
    avgPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
    notRecordedRows: {
      sea: rows.filter((r) => r[SEA] === -1).length,
      sail: rows.filter((r) => r[SAIL] === -1).length,
    },
  }
}

export type BucketCount = { rows: number; races: number }

/**
 * How many rows each bucket of `dim` would add, with every *other* dimension's
 * narrowing already applied. This is what lets a chip carry an honest number
 * instead of an archive-wide one that goes stale the moment anything is picked.
 */
export const bucketCounts = (
  f: PrototypeFilter,
  dim: DimensionId,
): Record<string, BucketCount> => {
  const pool = ROWS.filter((r) => matches(r, f, [dim]))
  const out: Record<string, BucketCount> = {}
  const races: Record<string, Set<number>> = {}
  for (const row of pool) {
    const b = rowBucket(row, dim)
    out[b] ??= { rows: 0, races: 0 }
    races[b] ??= new Set()
    out[b].rows += 1
    races[b].add(row[RACE])
  }
  for (const b of Object.keys(out)) out[b].races = races[b].size
  return out
}

/** A one-line "Medium, Heavy" / "Any" summary of a dimension, for collapsed UI. */
export const summarise = (f: PrototypeFilter, dim: DimensionId): string => {
  if (dim === 'date' && f.range) return `${f.range.from} → ${f.range.to}`
  const picked = selected(f, dim)
  if (!picked.length) return 'Any'
  const d = dimension(dim)
  const labels = picked.map((id) => d.buckets.find((b) => b.id === id)?.label ?? id)
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.length} of ${d.buckets.length}`
}

// --- URL encoding ------------------------------------------------------------
//
// ADR 0026 says an Analysis Filter travels as searchParams. Variant A takes that
// literally on every tap; B batches it; C never writes it. Comparing how those
// three feel on a phone is the point.

const DIM_KEYS: DimensionId[] = ['wind', 'pos', 'sail', 'sea', 'time', 'date']

export const toSearchParams = (f: PrototypeFilter, extra: Record<string, string> = {}): string => {
  const p = new URLSearchParams()
  for (const dim of DIM_KEYS) {
    const v = selected(f, dim)
    if (v.length) p.set(dim, v.join(','))
  }
  if (f.range) {
    p.set('from', f.range.from)
    p.set('to', f.range.to)
  }
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  return p.toString()
}

const readList = (
  raw: string | string[] | undefined,
  allowed: readonly string[],
): string[] => {
  const s = Array.isArray(raw) ? raw[0] : raw
  if (!s) return []
  // Unknown bucket ids are dropped, not honoured — a hand-typed or stale URL
  // should narrow to something real or to nothing, never to an empty screen
  // with no explanation. Same instinct as `amendSection()`.
  return s.split(',').filter((id) => allowed.includes(id))
}

export const fromSearchParams = (
  params: Record<string, string | string[] | undefined>,
): PrototypeFilter => {
  const ids = (dim: DimensionId) => dimension(dim).buckets.map((b) => b.id)
  const from = Array.isArray(params.from) ? params.from[0] : params.from
  const to = Array.isArray(params.to) ? params.to[0] : params.to
  return {
    wind: readList(params.wind, ids('wind')),
    pos: readList(params.pos, ids('pos')),
    sail: readList(params.sail, ids('sail')),
    sea: readList(params.sea, ids('sea')),
    time: readList(params.time, ids('time')),
    date: readList(params.date, ids('date')),
    range: from && to ? { from, to } : null,
  }
}

/** The archive's real span, for the custom-range inputs' bounds. */
export const ARCHIVE_SPAN = {
  from: RACES[0].start.slice(0, 10),
  to: RACES[RACES.length - 1].start.slice(0, 10),
}

export { RACES, ROWS, SAIL_DEFS }
export { PCT, RACE, TWA, TWS }

/**
 * THROWAWAY — shared data and math for the LAY-94 race-upload prototype.
 *
 * Everything here is deliberately shared across variants because it is *not*
 * what is being compared: the fixtures, the Row Quality maths, the refusals and
 * the cost meter must be identical so the only difference between variants is
 * the shape of the flow.
 *
 * Vocabulary follows CONTEXT.md and docs/design-docs/race-archive-schema.md.
 */

import fixtures from './fixtures.json'

// ---------------------------------------------------------------- fixtures

/**
 * Column-major so a chart can take one channel without walking a tuple.
 * A missing value is `null` and stays `null` — never a plausible stand-in.
 * flags: 1 Frozen, 2 not water-referenced, 4 Low-Speed.
 */
export interface Series {
  sec: number[]
  lat: (number | null)[]
  lon: (number | null)[]
  sog: (number | null)[]
  tws: (number | null)[]
  twa: (number | null)[]
  awa: (number | null)[]
  flags: number[]
}

/** The channels the secondary chart can show. */
export type ChannelKey = 'sog' | 'tws' | 'twa' | 'awa'

export interface Channel {
  key: ChannelKey
  label: string
  unit: string
  /** The qtVlm column this came from, verbatim. */
  sourceColumn: string
  /** What the number actually is, for the one provenance line under the chart. */
  provenance: string
  /** Angles wrap; speeds do not. Decides the y-scale and whether 0 is meaningful. */
  kind: 'speed' | 'angle'
}

export const CHANNELS: Record<ChannelKey, Channel> = {
  sog: {
    key: 'sog',
    label: 'SOG',
    unit: 'kt',
    sourceColumn: 'SOG',
    provenance: 'Speed over ground, from GPS. Unaffected by current — this is progress across the seabed, not through the water.',
    kind: 'speed',
  },
  tws: {
    key: 'tws',
    label: 'TWS',
    unit: 'kt',
    sourceColumn: 'TWS',
    provenance: 'True wind speed as the instruments reported it at the masthead. Where STW and CTW are blank the figure was computed from GPS instead — those stretches are washed blue.',
    kind: 'speed',
  },
  twa: {
    key: 'twa',
    label: 'TWA',
    unit: '°',
    sourceColumn: 'TWA',
    provenance: 'True wind angle as reported. The file also carries a TWA (calc) column, which Layline does not read here.',
    kind: 'angle',
  },
  awa: {
    key: 'awa',
    label: 'AWA',
    unit: '°',
    sourceColumn: 'AWA (calc)',
    provenance: 'Apparent wind angle. The boat never measured it — qtVlm calculated it, and the column name says so. Stored exactly as the file gives it, and labelled as a calculation wherever it is shown.',
    kind: 'angle',
  },
}

export const CHANNEL_ORDER: ChannelKey[] = ['sog', 'tws', 'twa', 'awa']

export interface FixtureStats {
  inWindowRows: number
  frozenInWindow: number
  frozenInFile: number
  notWaterReferencedInWindow: number
  longestDropoutRows: number
  longestDropoutSeconds: number
  medianGapSeconds: number | null
}

export interface Fixture {
  filename: string
  why: string
  sha256: string
  bytes: number
  trailingNewline: boolean
  sourceColumns: string[]
  dateOrder: string
  rowCount: number
  firstRowTime: string
  lastRowTime: string
  t0: string
  series: Series
  stats: FixtureStats
  truth: {
    windowStart: string
    windowFinish: string
    sails: { at: string; sails: string[]; reef: string }[]
    seaState: { at: string; state: string }[]
  }
}

// JSON widens the fixed-length series tuples to number[], so the cast goes
// through unknown. Throwaway code; the generator is the schema.
export const RECORDINGS = (fixtures as unknown as { recordings: Fixture[] }).recordings

/**
 * One recording is already logged, so the duplicate-content-hash path is
 * reachable. ADR 0009 makes it a confirmation and never a refusal, because a
 * second Race from one file is normal (ADR 0010).
 */
export const ALREADY_LOGGED: Record<string, string> = {
  '08-22-26-glr.csv': 'GLR — first race',
}

// ---------------------------------------------------------- boat reference

export const SAIL_INVENTORY = [
  { key: 'main', label: 'Main' },
  { key: 'jib-1', label: 'Jib 1' },
  { key: 'jib-2', label: 'Jib 2' },
  { key: 'jib-3', label: 'Jib 3' },
  { key: 'A2', label: 'A2' },
  { key: 'A3', label: 'A3' },
] as const

export const SEA_STATES = [
  { key: 'calm', label: 'Calm', detail: '0–1 ft' },
  { key: 'slight', label: 'Slight', detail: '1–2 ft' },
  { key: 'moderate', label: 'Moderate', detail: '2–3 ft' },
  { key: 'rough', label: 'Rough', detail: '3+ ft' },
] as const

export const REEF_STATES = [
  { key: 'full', label: 'Full' },
  { key: 'reef-1', label: 'Reef 1' },
] as const

/** Stand-ins for boat_setup_versions rows. Four kinds, per ADR 0012. */
export const BOAT_SETUP = {
  polar: [
    { id: 'polar-v1', label: 'v1 · ORC measured', effective: '2026-05-02' },
  ],
  crossover_chart: [
    { id: 'xo-v1', label: 'v1 · seed chart', effective: '2026-05-02' },
  ],
  rig_tune: [
    { id: 'rig-v1', label: 'v1 · measured base', effective: '2026-05-14' },
  ],
  instrument_calibration: [
    { id: 'cal-v1', label: 'v1 · TL-25 as programmed', effective: '2026-05-20' },
  ],
} as const

/** Wind Bands are data on a Rig Tune Version (ADR 0007), not a global scheme. */
export const WIND_BANDS: Record<string, { id: string; label: string; isBase: boolean }[]> = {
  'rig-v1': [
    { id: 'band-1', label: '0–8 kt', isBase: false },
    { id: 'band-2', label: '9–14 kt', isBase: false },
    { id: 'band-3', label: '15–20 kt', isBase: true },
    { id: 'band-4', label: '21 kt +', isBase: false },
  ],
}

// ---------------------------------------------------------------- the draft

export interface SailEntry {
  id: string
  at: string // naive 'YYYY-MM-DDTHH:MM'
  reef: string | null // no default: full and reef-1 are both real answers
  sails: string[]
}

export interface SeaStateEntry {
  id: string
  at: string
  state: string
}

export interface Draft {
  fixture: Fixture | null
  recordingId: string | null // minted in the browser at step 1 (ADR 0013)
  title: string
  windowStart: string
  windowFinish: string
  sails: SailEntry[]
  seaState: SeaStateEntry[]
  polarVersionId: string | null
  crossoverVersionId: string | null
  rigTuneVersionId: string | null
  calibrationVersionId: string | null
  windBandId: string | null
}

export function emptyDraft(): Draft {
  return {
    fixture: null,
    recordingId: null,
    title: '',
    windowStart: '',
    windowFinish: '',
    sails: [],
    seaState: [],
    // Nullable and NOT defaulted to the current Version — "not recorded" is a
    // legitimate answer and must not be a backdated guess (ADR 0005/0012).
    polarVersionId: null,
    crossoverVersionId: null,
    rigTuneVersionId: null,
    calibrationVersionId: null,
    windBandId: null,
  }
}

export function draftFromFixture(f: Fixture): Draft {
  return {
    ...emptyDraft(),
    fixture: f,
    recordingId: mintId(),
    // Prefilled from the file's own span — the sailor still supplies the real
    // window, which may sit inside it or run past its end.
    windowStart: toInput(f.firstRowTime),
    windowFinish: toInput(f.lastRowTime),
  }
}

let idCounter = 0
export function mintId(): string {
  idCounter += 1
  return `proto-${idCounter.toString().padStart(4, '0')}`
}

// ------------------------------------------------------------ naive clocks

/**
 * A Recording carries no timezone. Windows are stored and compared in the
 * recording's own naive wall-clock frame (ADR 0010), so every time in this
 * prototype is a naive string and arithmetic goes through these helpers only.
 */
export function toInput(naive: string): string {
  return naive.replace(' ', 'T').slice(0, 16)
}

export function naiveMs(s: string): number {
  if (!s) return NaN
  const m = s.trim().replace(' ', 'T')
  const [date, time = '00:00'] = m.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [hh, mm, ss = 0] = time.split(':').map(Number)
  return Date.UTC(y, (mo ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, ss)
}

export function msToInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export function fmtClock(s: string): string {
  return s ? s.slice(11, 16) : '—'
}

export function fmtDay(s: string): string {
  if (!s) return '—'
  const d = new Date(naiveMs(s))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Renders a window honestly across midnight — no same-day assumption. */
export function fmtWindow(start: string, finish: string): string {
  if (!start || !finish) return '—'
  const sameDay = start.slice(0, 10) === finish.slice(0, 10)
  return sameDay
    ? `${fmtDay(start)} · ${fmtClock(start)} – ${fmtClock(finish)}`
    : `${fmtDay(start)} ${fmtClock(start)} – ${fmtDay(finish)} ${fmtClock(finish)}`
}

export function fmtDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`
}

// --------------------------------------------------------- row quality view

export const FLAG_FROZEN = 1
export const FLAG_NOT_WATER = 2
export const FLAG_LOW_SPEED = 4

export interface WindowView {
  rows: number
  frozen: number
  notWater: number
  lowSpeed: number
  /** Seconds between the last row in the window and the finish, if positive. */
  tailGapSeconds: number
  spanSeconds: number
  longestDropoutSeconds: number
}

/**
 * Row Quality is computed at read over the whole Transcription and only then
 * filtered to the window (ADR 0009) — never stored. Clipping first is what has
 * been hiding 09-02-2026-beer-can's frozen rows.
 */
export function windowView(f: Fixture, startInput: string, finishInput: string): WindowView {
  const t0 = naiveMs(f.t0)
  const start = naiveMs(startInput)
  const finish = naiveMs(finishInput)
  const { sec, flags } = f.series
  let rows = 0
  let frozen = 0
  let notWater = 0
  let lowSpeed = 0
  let lastRowMs = -Infinity
  let longestDropout = 0
  let runStart: number | null = null

  for (let i = 0; i < sec.length; i += 1) {
    const ms = t0 + sec[i] * 1000
    const fl = flags[i]
    // Dropout runs are measured over the whole file, window or not.
    if (fl & FLAG_FROZEN) {
      if (runStart === null) runStart = ms
      longestDropout = Math.max(longestDropout, ms - runStart)
    } else {
      runStart = null
    }
    if (ms < start || ms > finish) continue
    rows += 1
    lastRowMs = ms
    if (fl & FLAG_FROZEN) frozen += 1
    if (fl & FLAG_NOT_WATER) notWater += 1
    if (fl & FLAG_LOW_SPEED) lowSpeed += 1
  }

  return {
    rows,
    frozen,
    notWater,
    lowSpeed,
    tailGapSeconds: rows > 0 && finish > lastRowMs ? (finish - lastRowMs) / 1000 : 0,
    spanSeconds: (finish - start) / 1000,
    longestDropoutSeconds: longestDropout / 1000,
  }
}

// ------------------------------------------------------------- chart markers

/**
 * One annotation, as every chart draws it. `locked` is the whole point of the
 * revised wizard: a marker placed on an earlier step stays on the chart for the
 * rest of the flow so you can see what you already said, but cannot be moved
 * from a step that isn't about it.
 */
export interface ChartMarker {
  id: string
  at: string
  lane: 'sail' | 'sea'
  label: string
  selected?: boolean
  incomplete?: boolean
  locked?: boolean
}

// ------------------------------------------------------- shared chart geometry
//
// Both charts and the map read the same time axis and the same flag spans, which
// is what makes their scrubbers agree rather than merely look alike.

export interface TimeAxis {
  t0: number
  tEnd: number
  /** Padded bounds. The axis is NOT clamped to the file: a race can finish after the log dies. */
  min: number
  max: number
}

export function timeAxis(f: Fixture): TimeAxis {
  const t0 = naiveMs(f.t0)
  const tEnd = naiveMs(f.lastRowTime)
  const slack = Math.max((tEnd - t0) * 0.1, 10 * 60 * 1000)
  return { t0, tEnd, min: t0 - slack, max: tEnd + slack }
}

export interface Span {
  from: number
  to: number
  fromIndex: number
  toIndex: number
}

/** Contiguous runs of rows carrying a flag, in wall-clock ms. */
export function flagSpans(f: Fixture, flag: number): Span[] {
  const { sec, flags } = f.series
  const t0 = naiveMs(f.t0)
  const out: Span[] = []
  let from: number | null = null
  let fromIndex = 0
  for (let i = 0; i < sec.length; i += 1) {
    const on = (flags[i] & flag) !== 0
    if (on && from === null) {
      from = t0 + sec[i] * 1000
      fromIndex = i
    } else if (!on && from !== null) {
      out.push({ from, to: t0 + sec[i] * 1000, fromIndex, toIndex: i })
      from = null
    }
  }
  if (from !== null) {
    out.push({ from, to: t0 + sec[sec.length - 1] * 1000, fromIndex, toIndex: sec.length - 1 })
  }
  return out
}

/** Row index nearest a wall-clock time, or -1 when the series is empty. */
export function nearestIndex(f: Fixture, ms: number): number {
  const { sec } = f.series
  if (sec.length === 0) return -1
  const t0 = naiveMs(f.t0)
  const target = (ms - t0) / 1000
  let lo = 0
  let hi = sec.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sec[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(sec[lo - 1] - target) <= Math.abs(sec[lo] - target)) return lo - 1
  return lo
}

export function rowMs(f: Fixture, i: number): number {
  return naiveMs(f.t0) + f.series.sec[i] * 1000
}

// ------------------------------------------------------------- the refusals

export type Refusal = { field: 'window'; message: string }

/**
 * ADR 0009's two blocking conditions, and ADR 0010 binds them on amendment
 * exactly as on upload — so they live here, once, and every variant and any
 * future edit path calls this same function.
 */
export function windowRefusals(f: Fixture | null, start: string, finish: string): Refusal[] {
  if (!f) return []
  const out: Refusal[] = []
  const s = naiveMs(start)
  const e = naiveMs(finish)
  if (!isFinite(s) || !isFinite(e)) {
    out.push({ field: 'window', message: 'Start and finish are both required.' })
    return out
  }
  if (e <= s) {
    out.push({ field: 'window', message: 'The finish must be after the start.' })
    return out
  }
  if (windowView(f, start, finish).rows === 0) {
    out.push({
      field: 'window',
      message: 'This window contains no rows from the recording. Move it over the data.',
    })
  }
  return out
}

/** An entry naming no sails is bare poles, and is refused (schema sketch). */
export function sailEntryRefusals(entries: SailEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  const seen = new Map<string, string>()
  for (const e of entries) {
    if (e.sails.length === 0) out[e.id] = 'Name at least one sail.'
    else if (e.reef === null) out[e.id] = 'Say whether the main was full or reefed.'
    const clash = seen.get(e.at)
    if (clash) out[e.id] = 'Another entry already uses this time.'
    seen.set(e.at, e.id)
  }
  return out
}

export function seaStateRefusals(entries: SeaStateEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  const seen = new Set<string>()
  for (const e of entries) {
    if (seen.has(e.at)) out[e.id] = 'Another entry already uses this time.'
    seen.add(e.at)
  }
  return out
}

export function isSubmittable(d: Draft): boolean {
  if (!d.fixture) return false
  if (windowRefusals(d.fixture, d.windowStart, d.windowFinish).length > 0) return false
  if (Object.keys(sailEntryRefusals(d.sails)).length > 0) return false
  if (Object.keys(seaStateRefusals(d.seaState)).length > 0) return false
  return true
}

// ------------------------------------------------------- generated sentences

/**
 * ADR 0008 ruling 6: provenance is ONE generated sentence, never a badge per
 * number. This is the same sentence the race page will show forever, which is
 * why it is written as a statement and not as a warning.
 */
export function provenanceSentence(f: Fixture, v: WindowView): string {
  const parts: string[] = []
  parts.push(
    `${v.rows.toLocaleString()} rows over ${fmtDuration(v.spanSeconds)}, sampled about every ${
      f.stats.medianGapSeconds ?? 30
    } s`,
  )
  if (v.frozen > 0) {
    parts.push(
      `${v.frozen.toLocaleString()} of them (${pct(v.frozen, v.rows)}) repeat the previous fix because the instrument feed had dropped, the longest run lasting ${fmtDuration(
        v.longestDropoutSeconds,
      )}`,
    )
  }
  if (v.notWater > 0) {
    parts.push(
      `${v.notWater.toLocaleString()} (${pct(v.notWater, v.rows)}) have wind computed from GPS rather than through the water`,
    )
  }
  if (v.tailGapSeconds > 0) {
    parts.push(`and the recording ends ${fmtDuration(v.tailGapSeconds)} before the finish you gave`)
  }
  return parts.join('; ') + '.'
}

export function pct(n: number, total: number): string {
  if (!total) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

/** The Dropout note has to be unmissable without reading as an error. */
export function dropoutSeverity(v: WindowView): 'none' | 'note' | 'loud' {
  if (v.rows === 0 || v.frozen === 0) return 'none'
  return v.frozen / v.rows >= 0.2 ? 'loud' : 'note'
}

export function versionLabel(kind: keyof typeof BOAT_SETUP, id: string | null): string {
  if (!id) return 'Not recorded'
  const found = BOAT_SETUP[kind].find((v) => v.id === id)
  return found ? found.label : 'Not recorded'
}

// ------------------------------------------------------------- cost meter
//
// The argument this prototype exists to settle is *how much typing a race
// costs*, so the prototype counts. One action = one state-changing gesture a
// sailor makes. Shared across variants, reset per attempt.

type Listener = () => void

class CostMeter {
  actions = 0
  startedAt: number | null = null
  private listeners = new Set<Listener>()

  bump(n = 1): void {
    if (this.startedAt === null) this.startedAt = Date.now()
    this.actions += n
    this.listeners.forEach((l) => l())
  }

  reset(): void {
    this.actions = 0
    this.startedAt = null
    this.listeners.forEach((l) => l())
  }

  elapsedSeconds(): number {
    return this.startedAt === null ? 0 : Math.round((Date.now() - this.startedAt) / 1000)
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

export const costMeter = new CostMeter()

/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * Everything on this screen that is not stored. Row Quality, Dropout spans,
 * coverage and the calibration diffs are all computed here at read time from
 * the rows the page already loaded, because the schema stores none of them.
 * Kept pure and free of React so the parts worth keeping can be lifted out.
 */

import {
  CALIBRATION_EVENTS,
  CALIBRATION_PAYLOADS,
  CHANNELS,
  CHANNEL_UNIT,
  CROSSOVER_PAYLOADS,
  POLAR_PAYLOADS,
  RACES,
  SAILS,
  addSeconds,
  durationLabel,
  lastRowTimeOf,
  minutesBetween,
  recordingById,
  rowsFor,
  sailByKey,
  sailConfigLabel,
  spanLabel,
  toMs,
  versionsOf,
  type CalibrationChannel,
  type CalibrationEvent,
  type CrossoverPayload,
  type PolarPayload,
  type Race,
  type Row,
  type Sail,
  type SailEntry,
  type SeaStateEntry,
  type Version,
} from './fixture'

/** Rendered as a constant from the code that just ran, never stored on a row. */
export const DETECTOR_VERSION = 'row-quality 1.2'

const LOW_SPEED_KT = 1.0
const FROZEN_RUN_MIN = 3

export interface Quality {
  frozen: boolean
  notWaterReferenced: boolean
  lowSpeed: boolean
  gapSeconds: number | null
}

export type QualityLabel = 'ok' | 'frozen' | 'not-water-referenced' | 'low-speed'

export function worstLabel(q: Quality): QualityLabel {
  if (q.frozen) return 'frozen'
  if (q.notWaterReferenced) return 'not-water-referenced'
  if (q.lowSpeed) return 'low-speed'
  return 'ok'
}

export const QUALITY_LABEL: Record<QualityLabel, string> = {
  ok: 'Good',
  frozen: 'Frozen',
  'not-water-referenced': 'Not water-referenced',
  'low-speed': 'Low-speed',
}

export const QUALITY_COLOR: Record<QualityLabel, string> = {
  ok: 'var(--wind-light)',
  frozen: 'var(--wind-storm)',
  'not-water-referenced': 'var(--wind-heavy)',
  'low-speed': 'var(--text-muted)',
}

/**
 * Computed over the whole Transcription, never over the window, so a Dropout
 * that begins before the start is still seen (ADR 0009).
 */
export function qualityOf(rows: Row[]): Quality[] {
  const frozen = new Array<boolean>(rows.length).fill(false)

  let runStart = 0
  const key = (r: Row): string => `${r.lat}|${r.lon}|${r.cog}|${r.sog}`
  for (let i = 1; i <= rows.length; i += 1) {
    const same = i < rows.length && key(rows[i]) === key(rows[runStart])
    if (!same) {
      const length = i - runStart
      if (length >= FROZEN_RUN_MIN) {
        for (let j = runStart; j < i; j += 1) frozen[j] = true
      }
      runStart = i
    }
  }

  let lastLiveMs: number | null = null
  return rows.map((row, i) => {
    const isFrozen = frozen[i]
    const ms = toMs(row.time)
    const gapSeconds = !isFrozen && lastLiveMs !== null ? (ms - lastLiveMs) / 1000 : null
    if (!isFrozen) lastLiveMs = ms
    return {
      frozen: isFrozen,
      notWaterReferenced: !isFrozen && (row.stw === null || row.ctw === null),
      lowSpeed: !isFrozen && row.sog !== null && row.sog < LOW_SPEED_KT,
      gapSeconds,
    }
  })
}

export interface Span {
  fromIndex: number
  toIndex: number
  fromTime: string
  toTime: string
}

function spansOf(rows: Row[], flags: boolean[]): Span[] {
  const spans: Span[] = []
  let start: number | null = null
  for (let i = 0; i <= rows.length; i += 1) {
    const on = i < rows.length && flags[i]
    if (on && start === null) start = i
    if (!on && start !== null) {
      spans.push({
        fromIndex: start,
        toIndex: i - 1,
        fromTime: rows[start].time,
        toTime: rows[i - 1].time,
      })
      start = null
    }
  }
  return spans
}

export interface RaceAnalysis {
  race: Race
  /** The whole Transcription, so a Dropout starting before the gun is visible. */
  allRows: Row[]
  allQuality: Quality[]
  /** Rows inside the Race Window, with their quality. */
  windowRows: Row[]
  windowQuality: Quality[]
  counts: Record<QualityLabel, number>
  /**
   * The same quality picture as `counts`, in seconds. Preferred everywhere a
   * person reads it: how long the feed was dead is a fact about the race, how
   * many rows that took is a fact about the file.
   */
  seconds: Record<QualityLabel, number>
  cadenceSec: number
  frozenSpans: Span[]
  notWaterReferencedSpans: Span[]
  /** Minutes the window runs past the last row; 0 when the recording covers it. */
  uncoveredMinutes: number
  windowMinutes: number
  lastRowTime: string
  coverageSentence: string
  provenanceSentence: string
}

export function analyseRace(race: Race): RaceAnalysis {
  const rec = recordingById(race.recordingId)
  const allRows = rowsFor(race.recordingId)
  const allQuality = qualityOf(allRows)

  const startMs = toMs(race.windowStart)
  const finishMs = toMs(race.windowFinish)
  const inWindow: number[] = []
  allRows.forEach((row, i) => {
    const ms = toMs(row.time)
    if (ms >= startMs && ms <= finishMs) inWindow.push(i)
  })

  const windowRows = inWindow.map((i) => allRows[i])
  const windowQuality = inWindow.map((i) => allQuality[i])

  const counts: Record<QualityLabel, number> = {
    ok: 0, frozen: 0, 'not-water-referenced': 0, 'low-speed': 0,
  }
  windowQuality.forEach((q) => { counts[worstLabel(q)] += 1 })

  const frozenSpans = spansOf(windowRows, windowQuality.map((q) => q.frozen))
  const notWaterReferencedSpans = spansOf(
    windowRows,
    windowQuality.map((q) => q.notWaterReferenced)
  )

  const lastRowTime = lastRowTimeOf(rec)
  const uncoveredMinutes = Math.max(0, minutesBetween(lastRowTime, race.windowFinish))
  const windowMinutes = minutesBetween(race.windowStart, race.windowFinish)

  const seconds: Record<QualityLabel, number> = {
    ok: counts.ok * rec.cadenceSec,
    frozen: counts.frozen * rec.cadenceSec,
    'not-water-referenced': counts['not-water-referenced'] * rec.cadenceSec,
    'low-speed': counts['low-speed'] * rec.cadenceSec,
  }

  // Spoken in time, not in rows. Nobody cares how many lines the file has.
  const parts: string[] = []
  if (counts.frozen > 0) {
    parts.push(
      `${spanLabel(seconds.frozen)} frozen — the feed had died and those values are a repeated copy`
    )
  }
  if (counts['not-water-referenced'] > 0) {
    parts.push(
      `${spanLabel(seconds['not-water-referenced'])} with no paddlewheel, so the wind figures there mean something different`
    )
  }
  if (counts['low-speed'] > 0) {
    parts.push(
      `${spanLabel(seconds['low-speed'])} below ${LOW_SPEED_KT.toFixed(1)} kt over the ground`
    )
  }
  if (uncoveredMinutes > 0) {
    parts.push(`recording ended ${durationLabel(uncoveredMinutes)} before the finish`)
  }
  const coverageSentence =
    parts.length === 0
      ? 'The recording covers the window end to end.'
      : `${parts.join('; ')}.`

  const provenanceSentence =
    'Position, course and speed over the ground are GPS. Speed through the water is the only ' +
    'measured channel; every wind figure was computed upstream by qtVlm from settings this file ' +
    'does not record. The window, the sails and the sea state were typed in from memory.'

  return {
    race, allRows, allQuality, windowRows, windowQuality, counts, seconds,
    cadenceSec: rec.cadenceSec, frozenSpans, notWaterReferencedSpans,
    uncoveredMinutes, windowMinutes, lastRowTime, coverageSentence,
    provenanceSentence,
  }
}

/**
 * The entry in force is the latest at or before the row's time, falling back to
 * the earliest. An empty list resolves to nothing and means the race is not
 * remembered — never a default.
 */
export function resolveSailAt(race: Race, time: string): SailEntry | null {
  if (race.sailEntries.length === 0) return null
  const ordered = [...race.sailEntries].sort((a, b) => toMs(a.at) - toMs(b.at))
  const ms = toMs(time)
  const atOrBefore = ordered.filter((e) => toMs(e.at) <= ms)
  return atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : ordered[0]
}

export function resolveSeaStateAt(race: Race, time: string): SeaStateEntry | null {
  if (race.seaStateEntries.length === 0) return null
  const ordered = [...race.seaStateEntries].sort((a, b) => toMs(a.at) - toMs(b.at))
  const ms = toMs(time)
  const atOrBefore = ordered.filter((e) => toMs(e.at) <= ms)
  return atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1] : ordered[0]
}

export function isAnnotated(race: Race): boolean {
  return race.sailEntries.length > 0 || race.seaStateEntries.length > 0
}

// ---------------------------------------------------------------------------
// What a race was actually like — the three figures that identify one. None of
// this is stored either: it is read off the rows against the Versions the race
// points at, and every figure carries the reason it might be missing.
//
// This is emphatically NOT the analysis engine. It compares the boat to a
// certificate polar it never sailed against and to its own crossover chart. It
// says nothing about whether the day was sailed well.
// ---------------------------------------------------------------------------

/**
 * Angles strictly below this are manufactured filler in the Polar (the 30° and
 * 35° rows, where 35 is exactly twice 30). No target speed is ever read there.
 */
export const POLAR_FILLER_BELOW = 40

/** Wind bands as the rest of Layline classifies them. */
export type WindBand = 'light' | 'medium' | 'heavy' | 'storm'

export const WIND_BAND_LABEL: Record<WindBand, string> = {
  light: 'Light air',
  medium: 'Medium air',
  heavy: 'Heavy air',
  storm: 'Storm',
}

export const WIND_BAND_COLOR: Record<WindBand, string> = {
  light: 'var(--wind-light)',
  medium: 'var(--wind-medium)',
  heavy: 'var(--wind-heavy)',
  storm: 'var(--wind-storm)',
}

export function windBandOf(kt: number): WindBand {
  if (kt < 8.5) return 'light'
  if (kt < 15.5) return 'medium'
  if (kt < 22.5) return 'heavy'
  return 'storm'
}

function bracket(
  axis: number[],
  value: number,
  fromIndex: number
): { lo: number; hi: number; t: number } | null {
  // Never extrapolate: off the end of the grid is a refusal, not a guess.
  if (value < axis[fromIndex] || value > axis[axis.length - 1]) return null
  for (let i = fromIndex; i < axis.length - 1; i += 1) {
    if (value >= axis[i] && value <= axis[i + 1]) {
      const span = axis[i + 1] - axis[i]
      return { lo: i, hi: i + 1, t: span === 0 ? 0 : (value - axis[i]) / span }
    }
  }
  return { lo: axis.length - 1, hi: axis.length - 1, t: 0 }
}

/** Target boat speed, bilinear inside the grid and null anywhere outside it. */
export function polarTarget(
  payload: PolarPayload,
  twaAbs: number,
  tws: number
): number | null {
  const firstReal = payload.twaAxis.findIndex((a) => a >= POLAR_FILLER_BELOW)
  if (firstReal < 0 || twaAbs < payload.twaAxis[firstReal]) return null
  const a = bracket(payload.twaAxis, twaAbs, firstReal)
  const w = bracket(payload.twsAxis, tws, 0)
  if (a === null || w === null) return null
  const lo = payload.boatSpeed[a.lo][w.lo] + (payload.boatSpeed[a.lo][w.hi] - payload.boatSpeed[a.lo][w.lo]) * w.t
  const hi = payload.boatSpeed[a.hi][w.lo] + (payload.boatSpeed[a.hi][w.hi] - payload.boatSpeed[a.hi][w.lo]) * w.t
  return lo + (hi - lo) * a.t
}

export type PolarSkipReason =
  | 'frozen'
  | 'no-paddlewheel'
  | 'drifting'
  | 'off-the-grid'
  | 'no-polar'

export const POLAR_SKIP_LABEL: Record<PolarSkipReason, string> = {
  frozen: 'the feed was frozen',
  'no-paddlewheel': 'no paddlewheel, so no speed through the water',
  drifting: 'drifting, where the comparison means nothing',
  'off-the-grid': 'the angle or the wind was off the polar',
  'no-polar': 'this race points at no polar',
}

export interface PolarComparison {
  /** Mean of speed through the water over polar target, as a percentage. */
  averagePercent: number | null
  upwindPercent: number | null
  downwindPercent: number | null
  scoredSeconds: number
  /** Why the rest could not be scored, longest first. Never silently dropped. */
  skipped: { reason: PolarSkipReason; seconds: number }[]
}

/**
 * Speed through the water against the polar the race points at. STW, not SOG:
 * a polar is water-referenced, and scoring it against a figure that includes
 * current would be a different claim wearing the same percent sign.
 */
export function polarComparison(analysis: RaceAnalysis): PolarComparison {
  const { race, windowRows, windowQuality, cadenceSec } = analysis
  const version = race.polarVersionId
  const payload = version === null ? undefined : POLAR_PAYLOADS[version]
  const skipCounts = new Map<PolarSkipReason, number>()
  const bump = (reason: PolarSkipReason): void => {
    skipCounts.set(reason, (skipCounts.get(reason) ?? 0) + 1)
  }

  if (payload === undefined) {
    return {
      averagePercent: null, upwindPercent: null, downwindPercent: null,
      scoredSeconds: 0,
      skipped: [{ reason: 'no-polar', seconds: windowRows.length * cadenceSec }],
    }
  }

  const up: number[] = []
  const down: number[] = []

  windowRows.forEach((row, i) => {
    const q = windowQuality[i]
    if (q.frozen) return bump('frozen')
    if (q.lowSpeed) return bump('drifting')
    if (row.stw === null) return bump('no-paddlewheel')
    if (row.twa === null || row.tws === null) return bump('no-paddlewheel')
    const target = polarTarget(payload, Math.abs(row.twa), row.tws)
    if (target === null || target <= 0) return bump('off-the-grid')
    const percent = (row.stw / target) * 100
    if (Math.abs(row.twa) <= 90) up.push(percent)
    else down.push(percent)
  })

  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length

  return {
    averagePercent: mean([...up, ...down]),
    upwindPercent: mean(up),
    downwindPercent: mean(down),
    scoredSeconds: (up.length + down.length) * cadenceSec,
    skipped: [...skipCounts.entries()]
      .map(([reason, rows]) => ({ reason, seconds: rows * cadenceSec }))
      .sort((a, b) => b.seconds - a.seconds),
  }
}

export interface WindSummary {
  averageTws: number | null
  minTws: number | null
  maxTws: number | null
  /** Vector mean, so 350° and 10° average to 0° rather than to 180°. */
  averageTwd: number | null
  /** Spread of direction about that mean, in degrees. */
  shiftDegrees: number | null
  band: WindBand | null
  /** Seconds with no usable wind figure at all. */
  missingSeconds: number
}

export function windSummary(analysis: RaceAnalysis): WindSummary {
  const { windowRows, windowQuality, cadenceSec } = analysis
  const speeds: number[] = []
  let x = 0
  let y = 0
  let directions = 0
  let missing = 0

  windowRows.forEach((row, i) => {
    if (windowQuality[i].frozen || row.tws === null) {
      missing += 1
      return
    }
    speeds.push(row.tws)
    if (row.twd !== null) {
      const rad = (row.twd * Math.PI) / 180
      x += Math.cos(rad)
      y += Math.sin(rad)
      directions += 1
    }
  })

  if (speeds.length === 0) {
    return {
      averageTws: null, minTws: null, maxTws: null, averageTwd: null,
      shiftDegrees: null, band: null, missingSeconds: missing * cadenceSec,
    }
  }

  const averageTws = speeds.reduce((s, v) => s + v, 0) / speeds.length
  const averageTwd =
    directions === 0 ? null : ((Math.atan2(y / directions, x / directions) * 180) / Math.PI + 360) % 360

  let shiftDegrees: number | null = null
  if (averageTwd !== null) {
    let lowest = 0
    let highest = 0
    windowRows.forEach((row, i) => {
      if (windowQuality[i].frozen || row.twd === null) return
      const delta = ((row.twd - averageTwd + 540) % 360) - 180
      lowest = Math.min(lowest, delta)
      highest = Math.max(highest, delta)
    })
    shiftDegrees = highest - lowest
  }

  return {
    averageTws,
    minTws: Math.min(...speeds),
    maxTws: Math.max(...speeds),
    averageTwd,
    shiftDegrees,
    band: windBandOf(averageTws),
    missingSeconds: missing * cadenceSec,
  }
}

/**
 * A Sail Configuration and a Sail Definition compared structurally rather than
 * by their labels, so "Main + Jib 2" and the reefed "Reef + Jib 2" cannot be
 * mistaken for one another.
 */
function definitionKey(label: string): string {
  const parts = label.split(' + ')
  return `${parts[0] === 'Reef' ? 'R' : 'M'}|${parts.slice(1).join('+')}`
}

function entryKey(entry: SailEntry): string {
  const headsails = entry.sailKeys
    .map((key) => sailByKey(key))
    .filter((s): s is Sail => s !== undefined && s.key !== 'main')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label)
  return `${entry.reef === 'reef-1' ? 'R' : 'M'}|${headsails.join('+')}`
}

export function crossoverCall(
  payload: CrossoverPayload,
  twaAbs: number,
  tws: number
): string | null {
  // Nearest cell, not interpolated: a chart names a sail, and half a sail is
  // not a sail.
  const nearest = (axis: number[], value: number): number => {
    let best = 0
    axis.forEach((a, i) => {
      if (Math.abs(a - value) < Math.abs(axis[best] - value)) best = i
    })
    return best
  }
  const r = nearest(payload.twaAxis, twaAbs)
  const c = nearest(payload.twsAxis, tws)
  const number = payload.cells[r][c]
  return payload.sailDefinitions.find((d) => d.number === number)?.label ?? null
}

/**
 * Was a sail the chart asked for already off the boat by this race? A chart can
 * outlive the inventory it was drawn around, and when it does the disagreement
 * has a known cause: the boat did not have that sail to set.
 */
function calledSailRetiredBy(label: string, windowStart: string): boolean {
  const day = windowStart.slice(0, 10)
  return label
    .split(' + ')
    .slice(1)
    .some((name) => {
      const sail = SAILS.find((s) => s.label === name)
      return sail !== undefined && sail.retiredOn !== null && sail.retiredOn <= day
    })
}

/** Runs shorter than this are crossover-boundary flutter, not a decision. */
const ANOMALY_MIN_SECONDS = 90

/** Above this share of the checked race, the log simply does not track it. */
const DOMINANT_DISAGREEMENT = 0.6

export interface CrossoverCheck {
  status: 'agrees' | 'disagrees' | 'no-sail-recorded' | 'no-chart'
  checkedSeconds: number
  /**
   * Time inside the window that could not be checked at all: no sail on record
   * yet, or wind angles that were not water-referenced, or the boat drifting.
   */
  uncheckedSeconds: number
  disagreementSeconds: number
  /**
   * The disagreement covers most of the race. Read this as "the sails on record
   * do not track this race" and say so instead of listing every span: fifteen
   * lines of the same fact is not fifteen facts.
   */
  dominant: boolean
  spans: {
    fromTime: string
    toTime: string
    seconds: number
    carried: string
    called: string
    /**
     * The chart called for a sail that was already off the boat by this race.
     * Settles which side is wrong without Layline having to guess.
     */
    calledRetired: boolean
  }[]
}

/**
 * What the boat was carrying against what its own Crossover Chart called for.
 * A disagreement is not a verdict: either a sail change went unrecorded, or the
 * chart is wrong for this boat. The UI has to say both.
 */
export function crossoverCheck(analysis: RaceAnalysis): CrossoverCheck {
  const { race, windowRows, windowQuality, cadenceSec } = analysis
  const payload =
    race.crossoverVersionId === null ? undefined : CROSSOVER_PAYLOADS[race.crossoverVersionId]
  const windowSeconds = windowRows.length * cadenceSec
  if (payload === undefined) {
    return {
      status: 'no-chart', checkedSeconds: 0, uncheckedSeconds: windowSeconds,
      disagreementSeconds: 0, dominant: false, spans: [],
    }
  }
  if (race.sailEntries.length === 0) {
    return {
      status: 'no-sail-recorded', checkedSeconds: 0, uncheckedSeconds: windowSeconds,
      disagreementSeconds: 0, dominant: false, spans: [],
    }
  }

  let checked = 0
  const flags: { bad: boolean; carried: string; called: string }[] = windowRows.map((row, i) => {
    const q = windowQuality[i]
    // A chart is indexed by true wind, and true wind is only a real figure when
    // the water reference held. Rows without it are not checked rather than
    // checked against a number that was never measured.
    if (
      q.frozen ||
      q.lowSpeed ||
      q.notWaterReferenced ||
      row.twa === null ||
      row.tws === null
    ) {
      return { bad: false, carried: '', called: '' }
    }
    const entry = resolveSailAt(race, row.time)
    if (entry === null) return { bad: false, carried: '', called: '' }
    const called = crossoverCall(payload, Math.abs(row.twa), row.tws)
    if (called === null) return { bad: false, carried: '', called: '' }
    checked += 1
    return {
      bad: definitionKey(called) !== entryKey(entry),
      carried: sailConfigLabel(entry),
      called,
    }
  })

  const spans: CrossoverCheck['spans'] = []
  let start: number | null = null
  for (let i = 0; i <= flags.length; i += 1) {
    const on =
      i < flags.length &&
      flags[i].bad &&
      (start === null ||
        (flags[i].carried === flags[start].carried && flags[i].called === flags[start].called))
    if (on && start === null) start = i
    if (!on && start !== null) {
      const rows = i - start
      const seconds = rows * cadenceSec
      if (seconds >= ANOMALY_MIN_SECONDS) {
        spans.push({
          fromTime: windowRows[start].time,
          toTime: windowRows[i - 1].time,
          seconds,
          carried: flags[start].carried,
          called: flags[start].called,
          calledRetired: calledSailRetiredBy(flags[start].called, race.windowStart),
        })
      }
      start = i < flags.length && flags[i].bad ? i : null
    }
  }

  const disagreementSeconds = spans.reduce((s, span) => s + span.seconds, 0)
  const checkedSeconds = checked * cadenceSec
  return {
    status: spans.length > 0 ? 'disagrees' : 'agrees',
    checkedSeconds,
    uncheckedSeconds: windowSeconds - checkedSeconds,
    disagreementSeconds,
    dominant:
      checkedSeconds > 0 && disagreementSeconds / checkedSeconds > DOMINANT_DISAGREEMENT,
    spans: spans.sort((a, b) => b.seconds - a.seconds),
  }
}

/** The three figures a race row carries, derived together. */
export interface RaceQuickStats {
  polar: PolarComparison
  wind: WindSummary
  crossover: CrossoverCheck
}

export function quickStats(analysis: RaceAnalysis): RaceQuickStats {
  return {
    polar: polarComparison(analysis),
    wind: windSummary(analysis),
    crossover: crossoverCheck(analysis),
  }
}

// ---------------------------------------------------------------------------
// The two window refusals. Shared, so the amendment path cannot walk around
// them (ADR 0009 / ADR 0010). The prototype calls this from its amend form.
// ---------------------------------------------------------------------------

export type WindowRefusal =
  | { ok: true }
  | { ok: false; reason: string }

export function checkWindow(
  recordingId: string,
  windowStart: string,
  windowFinish: string
): WindowRefusal {
  if (toMs(windowFinish) <= toMs(windowStart)) {
    return { ok: false, reason: 'A finish at or before the start is not a window.' }
  }
  const rows = rowsFor(recordingId)
  const startMs = toMs(windowStart)
  const finishMs = toMs(windowFinish)
  const any = rows.some((r) => {
    const ms = toMs(r.time)
    return ms >= startMs && ms <= finishMs
  })
  if (!any) {
    return { ok: false, reason: 'The Race Window contains no Recording Rows.' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// The Calibration Log: two tables read, one list rendered
// ---------------------------------------------------------------------------

export interface ChannelChange {
  channel: CalibrationChannel
  field: 'multiplier' | 'offset'
  from: number | null
  to: number
}

export function calibrationDiff(previous: Version | undefined, next: Version): ChannelChange[] {
  const to = CALIBRATION_PAYLOADS[next.id]
  const from = previous ? CALIBRATION_PAYLOADS[previous.id] : undefined
  const changes: ChannelChange[] = []

  CHANNELS.forEach((channel) => {
    const target = to[channel]
    const source = from?.[channel]
    const fields: ('multiplier' | 'offset')[] = ['multiplier', 'offset']
    fields.forEach((field) => {
      const toValue = target[field]
      if (toValue === undefined) return
      const fromValue = source ? source[field] ?? null : null
      if (source === undefined || fromValue !== toValue) {
        changes.push({ channel, field, from: source === undefined ? null : fromValue, to: toValue })
      }
    })
  })

  return changes
}

export function changeLabel(change: ChannelChange): string {
  const unit = change.field === 'offset' ? CHANNEL_UNIT[change.channel] : ''
  const to = `${change.to.toFixed(2)}${unit}`
  if (change.from === null) return `${change.channel} ${change.field} set to ${to}`
  return `${change.channel} ${change.field} ${change.from.toFixed(2)}${unit} → ${to}`
}

export type LogEntry =
  | { kind: 'version'; on: string; version: Version; changes: ChannelChange[] }
  | { kind: 'event'; on: string; event: CalibrationEvent }

/** The Version history and the Log are one list, so only one is rendered. */
export function calibrationLog(): LogEntry[] {
  const versions = [...versionsOf('instrument_calibration')].sort(
    (a, b) => a.versionNumber - b.versionNumber
  )
  const entries: LogEntry[] = versions.map((version, i) => ({
    kind: 'version',
    on: version.effectiveFrom,
    version,
    changes: calibrationDiff(i === 0 ? undefined : versions[i - 1], version),
  }))
  CALIBRATION_EVENTS.forEach((event) => {
    entries.push({ kind: 'event', on: event.occurredOn, event })
  })
  return entries.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
}

// ---------------------------------------------------------------------------
// Honest archive-wide figures. No analysis engine: every one of these is a
// count or a sum over Testimony and Row Quality, and none of them is a
// performance claim.
// ---------------------------------------------------------------------------

export interface ArchiveSummary {
  raceCount: number
  recordingCount: number
  firstRaceDate: string
  lastRaceDate: string
  totalRacedMinutes: number
  rowsInWindows: number
  frozenRows: number
  notWaterReferencedRows: number
  /** The same two figures in time, for anywhere a person reads them. */
  frozenSeconds: number
  notWaterReferencedSeconds: number
  unrememberedRaces: number
  racesMissingRigTune: number
  sailUsage: { label: string; races: number }[]
}

export function archiveSummary(races: Race[] = RACES): ArchiveSummary {
  const analyses = races.map(analyseRace)
  const sailCounts = new Map<string, number>()
  races.forEach((race) => {
    const seen = new Set<string>()
    race.sailEntries.forEach((entry) => seen.add(sailConfigLabel(entry)))
    seen.forEach((label) => sailCounts.set(label, (sailCounts.get(label) ?? 0) + 1))
  })
  const sorted = [...races].sort((a, b) => toMs(a.windowStart) - toMs(b.windowStart))

  return {
    raceCount: races.length,
    recordingCount: new Set(races.map((r) => r.recordingId)).size,
    firstRaceDate: sorted[0].windowStart,
    lastRaceDate: sorted[sorted.length - 1].windowStart,
    totalRacedMinutes: analyses.reduce((sum, a) => sum + a.windowMinutes, 0),
    rowsInWindows: analyses.reduce((sum, a) => sum + a.windowRows.length, 0),
    frozenRows: analyses.reduce((sum, a) => sum + a.counts.frozen, 0),
    notWaterReferencedRows: analyses.reduce(
      (sum, a) => sum + a.counts['not-water-referenced'],
      0
    ),
    frozenSeconds: analyses.reduce((sum, a) => sum + a.seconds.frozen, 0),
    notWaterReferencedSeconds: analyses.reduce(
      (sum, a) => sum + a.seconds['not-water-referenced'],
      0
    ),
    unrememberedRaces: races.filter((r) => !isAnnotated(r)).length,
    racesMissingRigTune: races.filter((r) => r.rigTuneVersionId === null).length,
    sailUsage: [...sailCounts.entries()]
      .map(([label, count]) => ({ label, races: count }))
      .sort((a, b) => b.races - a.races),
  }
}

/** Series helper for the traces: nulls stay holes, frozen stays marked. */
export interface SeriesPoint {
  index: number
  time: string
  value: number | null
  frozen: boolean
}

export function seriesOf(
  rows: Row[],
  quality: Quality[],
  channel: 'sog' | 'tws' | 'stw'
): SeriesPoint[] {
  return rows.map((row, i) => ({
    index: i,
    time: row.time,
    value: row[channel],
    frozen: quality[i].frozen,
  }))
}

/** The window's own start/finish as a row-index pair, for plotting. */
export function windowBounds(analysis: RaceAnalysis): { from: string; to: string } {
  return { from: analysis.race.windowStart, to: analysis.race.windowFinish }
}

export function nextSecondAfter(time: string): string {
  return addSeconds(time, 1)
}

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
  RACES,
  addSeconds,
  durationLabel,
  lastRowTimeOf,
  minutesBetween,
  recordingById,
  rowsFor,
  sailConfigLabel,
  toMs,
  versionsOf,
  type CalibrationChannel,
  type CalibrationEvent,
  type Race,
  type Row,
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

  const parts: string[] = [`${windowRows.length} rows inside the window`]
  if (counts.frozen > 0) {
    parts.push(
      `${counts.frozen} of them frozen — the feed had died and those values are a repeated copy`
    )
  }
  if (counts['not-water-referenced'] > 0) {
    parts.push(
      `${counts['not-water-referenced']} with no paddlewheel, so their wind means something different`
    )
  }
  if (counts['low-speed'] > 0) {
    parts.push(`${counts['low-speed']} below ${LOW_SPEED_KT.toFixed(1)} kt over the ground`)
  }
  if (uncoveredMinutes > 0) {
    parts.push(
      `recording ended ${durationLabel(uncoveredMinutes)} before the finish`
    )
  }
  const coverageSentence = `${parts.join('; ')}.`

  const provenanceSentence =
    'Position, course and speed over the ground are GPS. Speed through the water is the only ' +
    'measured channel; every wind figure was computed upstream by qtVlm from settings this file ' +
    'does not record. The window, the sails and the sea state were typed in from memory.'

  return {
    race, allRows, allQuality, windowRows, windowQuality, counts,
    frozenSpans, notWaterReferencedSpans, uncoveredMinutes, windowMinutes,
    lastRowTime, coverageSentence, provenanceSentence,
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

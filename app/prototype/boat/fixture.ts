/**
 * PROTOTYPE — throwaway. See ./README.md.
 *
 * A synthetic stand-in for the seeded archive, shaped exactly like
 * docs/design-docs/race-archive-schema.md but with invented numbers. Every
 * structural fact the ticket names is reproduced: four artifacts, 14 Recordings
 * of 13 distinct files backing 14 Races, one file uploaded twice for the two
 * races it carries, seven races with no annotation at all, a null Rig Tune
 * pointer on every Race, one
 * Calibration Event, a Race Window that outruns its recording, and a Dropout
 * whose freeze begins 20 seconds before an annotated finish.
 *
 * The Recording Rows are generated, not recorded — they exist so the prototype
 * can *derive* Row Quality and coverage the way the real read path will, rather
 * than seed a pre-computed number that the schema says is never stored.
 */

// ---------------------------------------------------------------------------
// Naive wall-clock time. A Recording carries no timezone (ADR 0010), so times
// are held as 'YYYY-MM-DDTHH:MM:SS' and only ever compared to each other.
// ---------------------------------------------------------------------------

export function toMs(naive: string): number {
  return Date.parse(`${naive}Z`)
}

export function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

export function addSeconds(naive: string, seconds: number): string {
  return fromMs(toMs(naive) + seconds * 1000)
}

export function clockOf(naive: string): string {
  return naive.slice(11, 16)
}

export function clockWithSecondsOf(naive: string): string {
  return naive.slice(11, 19)
}

export function dateOf(naive: string): string {
  return naive.slice(0, 10)
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function longDateOf(naive: string): string {
  const [y, m, d] = dateOf(naive).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

export function shortDateOf(naive: string): string {
  const [, m, d] = dateOf(naive).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}

export function minutesBetween(from: string, to: string): number {
  return (toMs(to) - toMs(from)) / 60000
}

export function durationLabel(minutes: number): string {
  const whole = Math.round(minutes)
  const h = Math.floor(whole / 60)
  const m = whole % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`
}

/**
 * A stretch of a recording, spoken as a sailor would: seconds while it is still
 * seconds. Used instead of row counts, which are an implementation detail of
 * the file and mean nothing to the person reading.
 */
export function spanLabel(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`
  return durationLabel(seconds / 60)
}

// ---------------------------------------------------------------------------
// Boat identity and Sail Inventory
// ---------------------------------------------------------------------------

export interface Boat {
  name: string
  model: string
}

export const BOAT: Boat = { name: 'Handsome Pete', model: 'Beneteau 10R' }

export interface Sail {
  id: string
  key: string
  label: string
  sortOrder: number
  retiredOn: string | null
}

export const SAILS: Sail[] = [
  { id: 'sail-main', key: 'main', label: 'Main', sortOrder: 1, retiredOn: null },
  { id: 'sail-jib-1', key: 'jib-1', label: 'Jib 1', sortOrder: 2, retiredOn: null },
  { id: 'sail-jib-2', key: 'jib-2', label: 'Jib 2', sortOrder: 3, retiredOn: null },
  { id: 'sail-jib-3', key: 'jib-3', label: 'Jib 3', sortOrder: 4, retiredOn: '2026-08-01' },
  { id: 'sail-a2', key: 'A2', label: 'A2', sortOrder: 5, retiredOn: null },
  { id: 'sail-a3', key: 'A3', label: 'A3', sortOrder: 6, retiredOn: null },
]

export function sailByKey(key: string): Sail | undefined {
  return SAILS.find((s) => s.key === key)
}

// ---------------------------------------------------------------------------
// Boat Setup — four artifacts, versioned
// ---------------------------------------------------------------------------

export type ArtifactKind = 'polar' | 'crossover_chart' | 'rig_tune' | 'instrument_calibration'

export const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
  polar: 'Polar',
  crossover_chart: 'Crossover Chart',
  rig_tune: 'Rig Tune',
  instrument_calibration: 'Instrument Calibration',
}

export type CalibrationChannel = 'AWA' | 'AWS' | 'STW' | 'HDG'

export const CHANNELS: CalibrationChannel[] = ['AWA', 'AWS', 'STW', 'HDG']

export const CHANNEL_UNIT: Record<CalibrationChannel, string> = {
  AWA: '°',
  AWS: 'kt',
  STW: 'kt',
  HDG: '°',
}

export interface PolarPayload {
  twaAxis: number[]
  twsAxis: number[]
  boatSpeed: number[][]
}

export interface SailDefinition {
  number: number
  label: string
}

export interface CrossoverPayload {
  twaAxis: number[]
  twsAxis: number[]
  cells: number[][]
  sailDefinitions: SailDefinition[]
}

export type CalibrationPayload = Record<
  CalibrationChannel,
  { multiplier?: number; offset: number }
>

export interface Shroud {
  gapMm: number
  turnsFromBase: number
}

export type ShroudPosition = 'V1' | 'D1' | 'D2'

export const SHROUD_POSITIONS: ShroudPosition[] = ['V1', 'D1', 'D2']

export const SHROUD_LABEL: Record<ShroudPosition, string> = {
  V1: 'V1 · cap',
  D1: 'D1 · lower',
  D2: 'D2 · intermediate',
}

export interface RigTuneBand {
  id: string
  lowKt: number
  highKt: number | null
  isBase: boolean
  label: string
  note: string | null
  shrouds: Record<ShroudPosition, { port: Shroud; starboard: Shroud }>
}

export interface Version {
  id: string
  kind: ArtifactKind
  versionNumber: number
  effectiveFrom: string
  recordedAt: string
  note: string | null
  filename: string | null
  contentSha256: string | null
  createdBy: string
}

// --- Polar payload -----------------------------------------------------------

const POLAR_TWA = [30, 35, 40, 45, 52, 60, 75, 90, 100, 110, 120, 135, 150, 160, 170, 180]
const POLAR_TWS = [4, 6, 8, 10, 12, 14, 16, 20, 24]

const ANGLE_EFFICIENCY: Record<number, number> = {
  40: 0.66, 45: 0.72, 52: 0.8, 60: 0.86, 75: 0.94, 90: 1, 100: 1.02,
  110: 1.03, 120: 1, 135: 0.94, 150: 0.85, 160: 0.79, 170: 0.73, 180: 0.7,
}

function buildPolar(scale: number): number[][] {
  const grid = POLAR_TWA.map((twa) =>
    POLAR_TWS.map((tws) => {
      const potential = 2.42 * Math.sqrt(tws) * scale
      const efficiency = ANGLE_EFFICIENCY[twa] ?? 0.7
      const lightPenalty = tws <= 6 && twa >= 135 ? 0.88 : 1
      return Math.round(potential * efficiency * lightPenalty * 10) / 10
    })
  )
  // Rows 30° and 35° are manufactured filler: row 35 is exactly twice row 30
  // in every column. Stored as given; every consumer must suppress them.
  grid[0] = grid[2].map((v) => Math.round(v * 0.45 * 10) / 10)
  grid[1] = grid[0].map((v) => Math.round(v * 2 * 10) / 10)
  return grid
}

/**
 * The polar's own shape, read continuously rather than off the grid: the same
 * formula `buildPolar` uses, with the angle efficiency interpolated between its
 * two nearest real rows. Used only to generate plausible boat speed for the
 * fixture rows. Angles below 40° fall back to the 40° row, since everything
 * below it in the stored Polar is filler.
 */
function polarShapeSpeed(twaAbs: number, tws: number, scale: number): number {
  const real = POLAR_TWA.filter((a) => a >= 40)
  const clamped = Math.min(Math.max(twaAbs, real[0]), real[real.length - 1])
  const upperIndex = real.findIndex((a) => a >= clamped)
  const upper = real[upperIndex]
  const lower = real[Math.max(0, upperIndex - 1)]
  const span = upper - lower
  const t = span === 0 ? 0 : (clamped - lower) / span
  const efficiency =
    (ANGLE_EFFICIENCY[lower] ?? 0.7) * (1 - t) + (ANGLE_EFFICIENCY[upper] ?? 0.7) * t
  const lightPenalty = tws <= 6 && clamped >= 135 ? 0.88 : 1
  return 2.42 * Math.sqrt(Math.max(tws, 0)) * scale * efficiency * lightPenalty
}

const POLAR_V1: PolarPayload = {
  twaAxis: POLAR_TWA,
  twsAxis: POLAR_TWS,
  boatSpeed: buildPolar(1),
}

const POLAR_V2: PolarPayload = {
  twaAxis: POLAR_TWA,
  twsAxis: POLAR_TWS,
  boatSpeed: buildPolar(0.97),
}

// --- Crossover Chart payload -------------------------------------------------

const CROSSOVER_TWA = [
  35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110,
  120, 125, 130, 135, 140, 150, 155, 160, 170, 180,
]
const CROSSOVER_TWS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 30]

const SAIL_DEFINITIONS: SailDefinition[] = [
  { number: 1, label: 'Main + Jib 1' },
  { number: 2, label: 'Main + Jib 2' },
  { number: 3, label: 'Main + Jib 3' },
  { number: 4, label: 'Reef + Jib 2' },
  { number: 5, label: 'Reef + Jib 3' },
  { number: 6, label: 'Main + A2' },
  // Referenced by zero cells, and legal: a Sail Definition need not appear.
  { number: 7, label: 'Main + A3' },
  { number: 8, label: 'Reef + A2' },
]

function crossoverCell(twa: number, tws: number): number {
  if (twa < 70) {
    if (tws <= 10) return 1
    if (tws <= 16) return 2
    if (tws <= 20) return 3
    if (tws <= 25) return 4
    return 5
  }
  if (twa <= 160) {
    if (tws <= 16) return 6
    if (tws <= 22) return 8
    if (tws <= 25) return 3
    return 5
  }
  if (tws <= 14) return 6
  if (tws <= 22) return 2
  return 3
}

const CROSSOVER_V1: CrossoverPayload = {
  twaAxis: CROSSOVER_TWA,
  twsAxis: CROSSOVER_TWS,
  cells: CROSSOVER_TWA.map((twa) => CROSSOVER_TWS.map((tws) => crossoverCell(twa, tws))),
  sailDefinitions: SAIL_DEFINITIONS,
}

const CROSSOVER_V2: CrossoverPayload = {
  twaAxis: CROSSOVER_TWA,
  twsAxis: CROSSOVER_TWS,
  cells: CROSSOVER_TWA.map((twa) =>
    CROSSOVER_TWS.map((tws) => {
      const base = crossoverCell(twa, tws)
      // v2 carries the A2 a band further up the range.
      return base === 8 && tws <= 18 ? 6 : base
    })
  ),
  sailDefinitions: SAIL_DEFINITIONS,
}

// --- Instrument Calibration payloads ----------------------------------------

const CAL_V1: CalibrationPayload = {
  AWA: { offset: 0 },
  AWS: { multiplier: 1, offset: 0 },
  STW: { multiplier: 1, offset: 0 },
  HDG: { offset: 0 },
}

const CAL_V2: CalibrationPayload = {
  AWA: { offset: 0 },
  AWS: { multiplier: 1, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

const CAL_V3: CalibrationPayload = {
  AWA: { offset: 2 },
  AWS: { multiplier: 1.02, offset: 0 },
  STW: { multiplier: 1.02, offset: 0 },
  HDG: { offset: 0 },
}

// --- Rig Tune bands ---------------------------------------------------------

function shroud(gapMm: number, turns: number, sideBias = 0): { port: Shroud; starboard: Shroud } {
  return {
    port: { gapMm, turnsFromBase: turns },
    starboard: { gapMm: Math.round((gapMm + sideBias) * 10) / 10, turnsFromBase: turns },
  }
}

export const RIG_BANDS: RigTuneBand[] = [
  {
    id: 'band-light',
    lowKt: 0,
    highKt: 8,
    isBase: false,
    label: 'Light',
    note: 'Furthest from base. Two full turns off the caps, and the D1s go with them.',
    shrouds: {
      V1: shroud(12.5, -2, 0.2),
      D1: shroud(13.5, -2, 0),
      D2: shroud(12.5, -1.5, 0.2),
    },
  },
  {
    id: 'band-medium',
    lowKt: 9,
    highKt: 14,
    isBase: false,
    label: 'Medium',
    note: 'One turn off base all round.',
    shrouds: {
      V1: shroud(11.5, -1, 0.2),
      D1: shroud(12.8, -1, 0),
      D2: shroud(11.8, -1, 0.2),
    },
  },
  {
    id: 'band-base',
    lowKt: 15,
    highKt: 20,
    isBase: true,
    label: 'Base',
    note: 'The Mac tune, set on the dock and left in. Gaps here are absolute; every other band counts turns off these.',
    shrouds: {
      V1: shroud(10.5, 0, 0.2),
      D1: shroud(12, 0, 0),
      D2: shroud(11, 0, 0.2),
    },
  },
  {
    id: 'band-heavy',
    lowKt: 21,
    highKt: null,
    isBase: false,
    label: 'Heavy',
    note: 'Half a turn on from base, no more — the headstay is not reachable, so this is all the gear there is.',
    shrouds: {
      V1: shroud(10, 0.5, 0.2),
      D1: shroud(11.5, 0.5, 0),
      D2: shroud(10.6, 0.5, 0.2),
    },
  },
]

// --- Versions ---------------------------------------------------------------

export const VERSIONS: Version[] = [
  {
    id: 'ver-polar-1',
    kind: 'polar',
    versionNumber: 1,
    effectiveFrom: '2026-05-02',
    recordedAt: '2026-05-02T14:20:00',
    note: 'Certificate polar off the ORC file. Never measured.',
    filename: 'Beneteau_10R_ORC.pol',
    contentSha256: '4f1c9a2e8b7d0553',
    createdBy: 'Alex',
  },
  {
    id: 'ver-polar-2',
    kind: 'polar',
    versionNumber: 2,
    effectiveFrom: '2026-08-14',
    recordedAt: '2026-08-14T21:05:00',
    note: 'Trimmed 3% off the certificate after the summer. Still not measured.',
    filename: 'handsome-pete-2026-08.pol',
    contentSha256: 'a90b3417cc25de81',
    createdBy: 'Alex',
  },
  {
    id: 'ver-crossover-1',
    kind: 'crossover_chart',
    versionNumber: 1,
    effectiveFrom: '2026-05-02',
    recordedAt: '2026-05-02T14:31:00',
    note: null,
    filename: 'handsome-pete.saildef',
    contentSha256: '77ce01ba9f4d3320',
    createdBy: 'Alex',
  },
  {
    id: 'ver-crossover-2',
    kind: 'crossover_chart',
    versionNumber: 2,
    effectiveFrom: '2026-07-20',
    recordedAt: '2026-07-20T09:12:00',
    note: 'A2 held a band higher after carrying it at 19 kt off Michigan City.',
    filename: 'handsome-pete-v2.saildef',
    contentSha256: 'b1552ed7708a94c6',
    createdBy: 'Alex',
  },
  {
    id: 'ver-rig-1',
    kind: 'rig_tune',
    versionNumber: 1,
    effectiveFrom: '2026-09-05',
    recordedAt: '2026-09-05T17:40:00',
    note: 'First measured tune. Caliper on all six turnbuckles at the dock, base band read off the Mac setting the boat has been carrying since June — so no race before today can point at this.',
    filename: null,
    contentSha256: null,
    createdBy: 'Alex',
  },
  {
    id: 'ver-cal-1',
    kind: 'instrument_calibration',
    versionNumber: 1,
    effectiveFrom: '2026-05-10',
    recordedAt: '2026-05-10T19:58:00',
    note: 'Read off the display at commissioning. Everything at factory.',
    filename: null,
    contentSha256: null,
    createdBy: 'Alex',
  },
  {
    id: 'ver-cal-2',
    kind: 'instrument_calibration',
    versionNumber: 2,
    effectiveFrom: '2026-07-04',
    recordedAt: '2026-07-05T08:15:00',
    note: 'New paddlewheel in, 1.02 into STW off the dock run.',
    filename: null,
    contentSha256: null,
    createdBy: 'Alex',
  },
  {
    id: 'ver-cal-3',
    kind: 'instrument_calibration',
    versionNumber: 3,
    effectiveFrom: '2026-08-12',
    recordedAt: '2026-08-12T20:41:00',
    note: '2° into AWA, and the same 1.02 into AWS as STW.',
    filename: null,
    contentSha256: null,
    createdBy: 'Alex',
  },
]

export function versionById(id: string | null): Version | undefined {
  return id === null ? undefined : VERSIONS.find((v) => v.id === id)
}

export function versionsOf(kind: ArtifactKind): Version[] {
  return VERSIONS.filter((v) => v.kind === kind).sort((a, b) => b.versionNumber - a.versionNumber)
}

export function currentVersionOf(kind: ArtifactKind): Version {
  return versionsOf(kind)[0]
}

export const POLAR_PAYLOADS: Record<string, PolarPayload> = {
  'ver-polar-1': POLAR_V1,
  'ver-polar-2': POLAR_V2,
}

export const CROSSOVER_PAYLOADS: Record<string, CrossoverPayload> = {
  'ver-crossover-1': CROSSOVER_V1,
  'ver-crossover-2': CROSSOVER_V2,
}

export const CALIBRATION_PAYLOADS: Record<string, CalibrationPayload> = {
  'ver-cal-1': CAL_V1,
  'ver-cal-2': CAL_V2,
  'ver-cal-3': CAL_V3,
}

// ---------------------------------------------------------------------------
// Calibration Events — the archive holds exactly one
// ---------------------------------------------------------------------------

export interface CalibrationEvent {
  id: string
  occurredOn: string
  type: 'autocompensation' | 'other'
  channels: CalibrationChannel[]
  note: string
  createdBy: string
}

export const CALIBRATION_EVENTS: CalibrationEvent[] = [
  {
    id: 'evt-1',
    occurredOn: '2026-07-04',
    type: 'autocompensation',
    channels: ['HDG'],
    note: 'Two slow circles off the crib, autocompensation run and accepted. Everything before today carries the old deviation table.',
    createdBy: 'Alex',
  },
]

// ---------------------------------------------------------------------------
// Recordings — the Transcription's container
// ---------------------------------------------------------------------------

export interface Recording {
  id: string
  filename: string
  contentSha256: string
  firstRowTime: string
  rowCount: number
  cadenceSec: number
  uploadedBy: string
  uploadedAt: string
  columnCount: number
  seed: number
  twsBase: number
  twdBase: number
  legMinutes: number
  /**
   * How well the boat was sailed, as a fraction of its own polar. The rows are
   * generated *from* the Polar and then scaled by this, which is why the polar
   * percentages on screen land somewhere believable — 0.9 sails like a tired
   * crew, 1.02 like a good night with some current help. Nothing about the
   * resulting percentage is evidence of anything; it exists so the layout can
   * be judged against numbers a sailor would not immediately reject.
   */
  sailedAt?: number
  /** The feed dies and the software keeps writing the last fix verbatim. */
  dropout?: { fromIndex: number; toIndex: number; channelsBlankFromIndex: number }
  /** Paddlewheel out: no STW, no CTW, so no honest true wind. */
  noPaddlewheel?: { fromIndex: number; toIndex: number }
  /** Drifting: under a knot over the ground, so the wind maths is meaningless. */
  lowSpeed?: { fromIndex: number; toIndex: number }
}

function recording(r: Omit<Recording, 'columnCount' | 'uploadedBy'>): Recording {
  return { ...r, columnCount: 21, uploadedBy: 'Alex' }
}

export const RECORDINGS: Recording[] = [
  recording({
    id: 'rec-0603', filename: '06-03-26-beer-can.csv', contentSha256: '0f8a1d44',
    firstRowTime: '2026-06-03T18:31:00', rowCount: 205, cadenceSec: 30,
    uploadedAt: '2026-06-04T07:12:00', seed: 603, sailedAt: 0.94, twsBase: 11, twdBase: 190, legMinutes: 14,
  }),
  recording({
    id: 'rec-0606-a', filename: '06-06-26-nood.csv', contentSha256: 'c31be907',
    firstRowTime: '2026-06-06T10:40:00', rowCount: 620, cadenceSec: 30,
    uploadedAt: '2026-06-08T20:02:00', seed: 606, sailedAt: 0.99, twsBase: 13, twdBase: 60, legMinutes: 18,
  }),
  recording({
    // Same bytes, uploaded a second time for the second race of the day.
    id: 'rec-0606-b', filename: '06-06-26-nood.csv', contentSha256: 'c31be907',
    firstRowTime: '2026-06-06T10:40:00', rowCount: 620, cadenceSec: 30,
    uploadedAt: '2026-06-08T20:19:00', seed: 606, sailedAt: 0.99, twsBase: 13, twdBase: 60, legMinutes: 18,
  }),
  recording({
    id: 'rec-0607', filename: '06-07-26-nood.csv', contentSha256: '7a45f2e0',
    firstRowTime: '2026-06-07T10:52:00', rowCount: 460, cadenceSec: 30,
    uploadedAt: '2026-06-08T20:31:00', seed: 607, sailedAt: 1.01, twsBase: 16, twdBase: 45, legMinutes: 20,
  }),
  recording({
    id: 'rec-0617', filename: '06-17-26-beer-can.csv', contentSha256: '9cc07b13',
    firstRowTime: '2026-06-17T18:28:00', rowCount: 230, cadenceSec: 30,
    uploadedAt: '2026-06-18T06:55:00', seed: 617, sailedAt: 0.9, twsBase: 19, twdBase: 30, legMinutes: 12,
  }),
  recording({
    id: 'rec-0626', filename: '06-26-26-chi-mi-chi.csv', contentSha256: 'e2810cd5',
    firstRowTime: '2026-06-26T18:32:17', rowCount: 1420, cadenceSec: 30,
    uploadedAt: '2026-06-28T15:44:00', seed: 626, sailedAt: 0.96, twsBase: 9, twdBase: 210, legMinutes: 55,
  }),
  recording({
    id: 'rec-0701', filename: '07-01-26-beer-can.csv', contentSha256: '5b6d9a71',
    firstRowTime: '2026-07-01T18:34:00', rowCount: 195, cadenceSec: 30,
    uploadedAt: '2026-07-02T07:03:00', seed: 701, sailedAt: 0.86, twsBase: 7, twdBase: 155, legMinutes: 13,
  }),
  recording({
    id: 'rec-0708', filename: '07-08-26-beer-can.csv', contentSha256: '11f4c0ab',
    firstRowTime: '2026-07-08T18:30:00', rowCount: 210, cadenceSec: 30,
    uploadedAt: '2026-07-09T06:40:00', seed: 708, sailedAt: 0.97, twsBase: 12, twdBase: 175, legMinutes: 14,
    // Sitting on the line either side of the gun at 19:00.
    lowSpeed: { fromIndex: 56, toIndex: 62 },
  }),
  recording({
    id: 'rec-0715', filename: '07-15-26-beer-can.csv', contentSha256: '8dd2e5f6',
    firstRowTime: '2026-07-15T18:29:00', rowCount: 214, cadenceSec: 30,
    uploadedAt: '2026-07-16T06:48:00', seed: 715, sailedAt: 0.93, twsBase: 14, twdBase: 200, legMinutes: 14,
    noPaddlewheel: { fromIndex: 96, toIndex: 132 },
  }),
  recording({
    id: 'rec-0722', filename: '07-22-26-beer-can.csv', contentSha256: '3ae70b28',
    firstRowTime: '2026-07-22T18:33:00', rowCount: 198, cadenceSec: 30,
    uploadedAt: '2026-07-23T07:20:00', seed: 722, sailedAt: 0.88, twsBase: 8, twdBase: 130, legMinutes: 13,
  }),
  recording({
    id: 'rec-0804', filename: '08-04-26-100-beer-can.csv', contentSha256: 'd50ffa93',
    firstRowTime: '2026-08-04T18:22:00', rowCount: 240, cadenceSec: 30,
    uploadedAt: '2026-08-05T06:31:00', seed: 804, sailedAt: 1.03, twsBase: 10, twdBase: 95, legMinutes: 15,
  }),
  recording({
    id: 'rec-0812', filename: '08-12-26-beer-can.csv', contentSha256: '6c1a44b8',
    firstRowTime: '2026-08-12T18:31:00', rowCount: 206, cadenceSec: 30,
    uploadedAt: '2026-08-13T06:52:00', seed: 812, sailedAt: 0.95, twsBase: 17, twdBase: 220, legMinutes: 13,
  }),
  recording({
    id: 'rec-0822', filename: '08-22-26-glr.csv', contentSha256: 'fb0392da',
    firstRowTime: '2026-08-22T10:14:15', rowCount: 432, cadenceSec: 30,
    uploadedAt: '2026-08-23T11:07:00', seed: 822, sailedAt: 0.98, twsBase: 21, twdBase: 25, legMinutes: 24,
  }),
  recording({
    id: 'rec-0902', filename: '09-02-2026-beer-can.csv', contentSha256: '2f77bd01',
    firstRowTime: '2026-09-02T18:15:40', rowCount: 291, cadenceSec: 30,
    uploadedAt: '2026-09-03T06:44:00', seed: 902, sailedAt: 1.0, twsBase: 12, twdBase: 165, legMinutes: 13,
    // Parked in a hole two and a half minutes after the start.
    lowSpeed: { fromIndex: 92, toIndex: 96 },
    // Rows 129–275 repeat one fix for 73 minutes; from 131 the instrument
    // channels go blank. The annotated finish falls 20s into the freeze.
    dropout: { fromIndex: 128, toIndex: 274, channelsBlankFromIndex: 130 },
  }),
]

export function recordingById(id: string): Recording {
  const found = RECORDINGS.find((r) => r.id === id)
  if (!found) throw new Error(`no recording ${id}`)
  return found
}

export function lastRowTimeOf(rec: Recording): string {
  return addSeconds(rec.firstRowTime, (rec.rowCount - 1) * rec.cadenceSec)
}

// ---------------------------------------------------------------------------
// Recording Rows — generated, so quality can be derived rather than seeded
// ---------------------------------------------------------------------------

export interface Row {
  index: number
  time: string
  lat: number | null
  lon: number | null
  cog: number | null
  sog: number | null
  twd: number | null
  tws: number | null
  twa: number | null
  ctw: number | null
  stw: number | null
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROW_CACHE = new Map<string, Row[]>()

/** The Transcription for one Recording. Generated once, then held. */
export function rowsFor(recordingId: string): Row[] {
  const cached = ROW_CACHE.get(recordingId)
  if (cached) return cached

  const rec = recordingById(recordingId)
  const rand = mulberry32(rec.seed)
  const rows: Row[] = []

  let lat = 41.8528333
  let lon = -87.55683333
  const legRows = Math.round((rec.legMinutes * 60) / rec.cadenceSec)

  for (let i = 0; i < rec.rowCount; i += 1) {
    const time = addSeconds(rec.firstRowTime, i * rec.cadenceSec)
    const upwind = Math.floor(i / legRows) % 2 === 0
    const tackRows = Math.max(6, Math.round(legRows / 4))
    const starboard = Math.floor(i / tackRows) % 2 === 0

    const tws = Math.round((rec.twsBase + Math.sin(i / 23) * 1.8 + (rand() - 0.5) * 1.2) * 10) / 10
    const twd = Math.round(rec.twdBase + Math.sin(i / 37) * 7 + (rand() - 0.5) * 4)
    const twa = upwind ? (starboard ? -42 : 42) : starboard ? -150 : 150
    const cog = ((twd - twa) % 360 + 360) % 360
    // Boat speed comes off the Polar's own shape, scaled by how well the boat
    // was sailed, so light air reads like light air. Generated against v1; a
    // race frozen on v2 will therefore read a couple of percent off, which is
    // exactly what a new certificate does to a season of results.
    // Most crews are better at one end of the course than the other, so the
    // upwind and downwind figures are worth reading separately. Derived from the
    // seed rather than another field: ±5%, deterministic, and meaningless as
    // evidence.
    const legBias = upwind ? 1 : 1 + ((rec.seed % 7) - 3) * 0.017
    const throughWater = polarShapeSpeed(Math.abs(twa), tws, 1) * (rec.sailedAt ?? 0.95) * legBias
    const stwValue = Math.round(Math.max(0, throughWater + (rand() - 0.5) * 0.4) * 10) / 10
    // A fair current: over the ground is a little more than through the water.
    const sog = Math.round((stwValue + 0.15 + (rand() - 0.5) * 0.2) * 10) / 10

    // Drifting: a hole on the course, or the last minutes before the gun.
    const lowSpeed =
      rec.lowSpeed !== undefined && i >= rec.lowSpeed.fromIndex && i <= rec.lowSpeed.toIndex
    const sogOut = lowSpeed ? Math.round(rand() * 60) / 100 : sog

    const stepHours = rec.cadenceSec / 3600
    lat += sogOut * Math.cos((cog * Math.PI) / 180) * stepHours / 60
    lon += (sogOut * Math.sin((cog * Math.PI) / 180) * stepHours) / (60 * Math.cos((lat * Math.PI) / 180))

    const paddleOut =
      rec.noPaddlewheel !== undefined &&
      i >= rec.noPaddlewheel.fromIndex &&
      i <= rec.noPaddlewheel.toIndex

    rows.push({
      index: i + 1,
      time,
      lat: Math.round(lat * 1e7) / 1e7,
      lon: Math.round(lon * 1e7) / 1e7,
      cog,
      sog: sogOut,
      twd,
      tws,
      twa: Math.round(twa),
      ctw: paddleOut ? null : cog,
      stw: paddleOut ? null : lowSpeed ? Math.round(sogOut * 0.9 * 10) / 10 : stwValue,
    })
  }

  if (rec.dropout) {
    const { fromIndex, toIndex, channelsBlankFromIndex } = rec.dropout
    const latch = rows[fromIndex]
    for (let i = fromIndex + 1; i <= toIndex && i < rows.length; i += 1) {
      rows[i] = {
        ...rows[i],
        lat: latch.lat,
        lon: latch.lon,
        cog: latch.cog,
        sog: latch.sog,
        ...(i >= channelsBlankFromIndex
          ? { twd: null, tws: null, twa: null, ctw: null, stw: null }
          : {}),
      }
    }
  }

  ROW_CACHE.set(recordingId, rows)
  return rows
}

// ---------------------------------------------------------------------------
// Races — Testimony over an immutable Transcription
// ---------------------------------------------------------------------------

export interface SailEntry {
  id: string
  at: string
  sailKeys: string[]
  reef: 'full' | 'reef-1'
}

export interface SeaStateEntry {
  id: string
  at: string
  seaState: 'calm' | 'slight' | 'moderate' | 'rough'
}

export interface Race {
  id: string
  recordingId: string
  title: string | null
  windowStart: string
  windowFinish: string
  polarVersionId: string | null
  crossoverVersionId: string | null
  rigTuneVersionId: string | null
  rigTuneBandId: string | null
  calibrationVersionId: string | null
  sailEntries: SailEntry[]
  seaStateEntries: SeaStateEntry[]
  updatedAt: string
}

function sailEntry(id: string, at: string, sailKeys: string[], reef: 'full' | 'reef-1'): SailEntry {
  return { id, at, sailKeys, reef }
}

export const RACES: Race[] = [
  {
    id: 'race-0603', recordingId: 'rec-0603', title: null,
    windowStart: '2026-06-03T19:00:00', windowFinish: '2026-06-03T20:12:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null,
    // Nobody wrote down which calibration the boat was on in June.
    calibrationVersionId: null,
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-04T07:12:00',
  },
  {
    id: 'race-0606-1', recordingId: 'rec-0606-a', title: null,
    windowStart: '2026-06-06T11:05:00', windowFinish: '2026-06-06T13:16:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-08T20:02:00',
  },
  {
    id: 'race-0606-2', recordingId: 'rec-0606-b', title: null,
    windowStart: '2026-06-06T13:50:00', windowFinish: '2026-06-06T15:20:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-08T20:19:00',
  },
  {
    id: 'race-0607', recordingId: 'rec-0607', title: null,
    windowStart: '2026-06-07T11:10:00', windowFinish: '2026-06-07T13:53:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-08T20:31:00',
  },
  {
    id: 'race-0617', recordingId: 'rec-0617', title: null,
    windowStart: '2026-06-17T19:00:00', windowFinish: '2026-06-17T20:20:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-18T06:55:00',
  },
  {
    id: 'race-0626', recordingId: 'rec-0626', title: 'Chicago – Michigan City – Chicago',
    windowStart: '2026-06-26T18:32:17', windowFinish: '2026-06-27T05:57:41',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-06-28T15:44:00',
  },
  {
    id: 'race-0701', recordingId: 'rec-0701', title: null,
    windowStart: '2026-07-01T19:00:00', windowFinish: '2026-07-01T20:05:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-1',
    sailEntries: [], seaStateEntries: [], updatedAt: '2026-07-02T07:03:00',
  },
  {
    id: 'race-0708', recordingId: 'rec-0708', title: 'Wednesday Night — Race 14',
    windowStart: '2026-07-08T19:00:00', windowFinish: '2026-07-08T20:08:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-2',
    // A log kept leg by leg, with one late hoist: the kite went up six minutes
    // after the weather mark, which is the only thing the chart can object to.
    sailEntries: [
      sailEntry('se-0708-1', '2026-07-08T18:52:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0708-2', '2026-07-08T19:18:00', ['main', 'A2'], 'full'),
      sailEntry('se-0708-3', '2026-07-08T19:26:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0708-4', '2026-07-08T19:40:00', ['main', 'A2'], 'full'),
      sailEntry('se-0708-5', '2026-07-08T19:54:00', ['main', 'jib-2'], 'full'),
    ],
    seaStateEntries: [{ id: 'ss-0708-1', at: '2026-07-08T19:00:00', seaState: 'slight' }],
    updatedAt: '2026-07-09T06:40:00',
  },
  {
    id: 'race-0715', recordingId: 'rec-0715', title: null,
    windowStart: '2026-07-15T19:00:00', windowFinish: '2026-07-15T20:10:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-1',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-2',
    // Every change written down, and every one of them what the chart calls for:
    // the race that should read as agreeing, with a stretch it cannot check
    // because the paddlewheel was out.
    sailEntries: [
      sailEntry('se-0715-1', '2026-07-15T18:50:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0715-2', '2026-07-15T19:11:00', ['main', 'A2'], 'full'),
      sailEntry('se-0715-3', '2026-07-15T19:25:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0715-4', '2026-07-15T19:39:00', ['main', 'A2'], 'full'),
      sailEntry('se-0715-5', '2026-07-15T19:53:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0715-6', '2026-07-15T20:07:00', ['main', 'A2'], 'full'),
    ],
    seaStateEntries: [{ id: 'ss-0715-1', at: '2026-07-15T19:00:00', seaState: 'moderate' }],
    updatedAt: '2026-07-16T06:48:00',
  },
  {
    id: 'race-0722', recordingId: 'rec-0722', title: null,
    windowStart: '2026-07-22T19:00:00', windowFinish: '2026-07-22T20:02:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-2',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-2',
    // Both downwind legs sailed under the A3, which this boat's chart names as a
    // Sail Definition but never actually calls for in any cell. The disagreement
    // is real and the chart is the thing that is wrong.
    sailEntries: [
      sailEntry('se-0722-1', '2026-07-22T18:55:00', ['main', 'jib-1'], 'full'),
      sailEntry('se-0722-2', '2026-07-22T19:12:00', ['main', 'A3'], 'full'),
      sailEntry('se-0722-3', '2026-07-22T19:25:00', ['main', 'jib-1'], 'full'),
      sailEntry('se-0722-4', '2026-07-22T19:38:00', ['main', 'A3'], 'full'),
      sailEntry('se-0722-5', '2026-07-22T19:51:00', ['main', 'jib-1'], 'full'),
    ],
    seaStateEntries: [{ id: 'ss-0722-1', at: '2026-07-22T19:00:00', seaState: 'calm' }],
    updatedAt: '2026-07-23T07:20:00',
  },
  {
    id: 'race-0804', recordingId: 'rec-0804', title: '100th beer can',
    windowStart: '2026-08-04T18:50:00', windowFinish: '2026-08-04T20:11:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-2',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-2',
    // Wind built through the evening: the last beat was sailed under the Jib 1
    // while the chart had already crossed over to the Jib 2.
    sailEntries: [
      sailEntry('se-0804-1', '2026-08-04T18:44:00', ['main', 'jib-1'], 'full'),
      sailEntry('se-0804-2', '2026-08-04T19:07:00', ['main', 'A2'], 'full'),
      sailEntry('se-0804-3', '2026-08-04T19:22:00', ['main', 'jib-1'], 'full'),
      sailEntry('se-0804-4', '2026-08-04T19:37:00', ['main', 'A2'], 'full'),
      sailEntry('se-0804-5', '2026-08-04T19:52:00', ['main', 'jib-1'], 'full'),
    ],
    seaStateEntries: [{ id: 'ss-0804-1', at: '2026-08-04T18:50:00', seaState: 'slight' }],
    updatedAt: '2026-08-05T06:31:00',
  },
  {
    id: 'race-0812', recordingId: 'rec-0812', title: null,
    windowStart: '2026-08-12T19:00:00', windowFinish: '2026-08-12T20:07:00',
    polarVersionId: 'ver-polar-1', crossoverVersionId: 'ver-crossover-2',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-2',
    // 18 knots, and the chart calls for the Jib 3 on both beats — a sail this
    // boat sold on 08-01. The log is right; the chart is stale.
    sailEntries: [
      sailEntry('se-0812-1', '2026-08-12T18:51:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0812-2', '2026-08-12T19:10:00', ['main', 'A2'], 'full'),
      sailEntry('se-0812-3', '2026-08-12T19:23:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0812-4', '2026-08-12T19:36:00', ['main', 'A2'], 'full'),
      sailEntry('se-0812-5', '2026-08-12T19:49:00', ['main', 'jib-2'], 'reef-1'),
    ],
    seaStateEntries: [{ id: 'ss-0812-1', at: '2026-08-12T19:00:00', seaState: 'moderate' }],
    updatedAt: '2026-08-13T06:52:00',
  },
  {
    id: 'race-0822', recordingId: 'rec-0822', title: 'Great Lakes Regatta — day 2',
    windowStart: '2026-08-22T11:00:00', windowFinish: '2026-08-22T14:09:00',
    polarVersionId: 'ver-polar-2', crossoverVersionId: 'ver-crossover-2',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-3',
    // Three hours of regatta and two lines in the log: nobody was writing sail
    // changes down. The chart will disagree with almost the whole race, and the
    // honest reading of that is "the log does not track this race", not "the
    // boat was mis-rigged for two hours".
    sailEntries: [
      sailEntry('se-0822-1', '2026-08-22T10:45:00', ['main', 'jib-2'], 'full'),
      sailEntry('se-0822-2', '2026-08-22T12:30:00', ['main', 'jib-2'], 'reef-1'),
    ],
    seaStateEntries: [
      { id: 'ss-0822-1', at: '2026-08-22T11:00:00', seaState: 'moderate' },
      { id: 'ss-0822-2', at: '2026-08-22T12:40:00', seaState: 'rough' },
    ],
    updatedAt: '2026-08-23T11:07:00',
  },
  {
    id: 'race-0902', recordingId: 'rec-0902', title: null,
    windowStart: '2026-09-02T19:00:00', windowFinish: '2026-09-02T19:20:00',
    polarVersionId: 'ver-polar-2', crossoverVersionId: 'ver-crossover-2',
    rigTuneVersionId: null, rigTuneBandId: null, calibrationVersionId: 'ver-cal-3',
    sailEntries: [sailEntry('se-0902-1', '2026-09-02T18:55:00', ['main', 'jib-1'], 'full')],
    seaStateEntries: [{ id: 'ss-0902-1', at: '2026-09-02T19:00:00', seaState: 'slight' }],
    updatedAt: '2026-09-03T06:44:00',
  },
]

export const SEA_STATE_LABEL: Record<SeaStateEntry['seaState'], string> = {
  calm: 'Calm (0–1 ft)',
  slight: 'Slight (1–2 ft)',
  moderate: 'Moderate (2–3 ft)',
  rough: 'Rough (3+ ft)',
}

export function racesByDateDesc(races: Race[]): Race[] {
  return [...races].sort((a, b) => toMs(b.windowStart) - toMs(a.windowStart))
}

/** Sail Configuration as words: the set flown, plus the Reef State. */
export function sailConfigLabel(entry: SailEntry): string {
  const names = entry.sailKeys
    .map((key) => sailByKey(key))
    .filter((s): s is Sail => s !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label)
  const reef = entry.reef === 'reef-1' ? ' · reef 1' : ''
  return `${names.join(' + ')}${reef}`
}

/** Which Races name a given Sail, so a retired sail still resolves. */
export function racesUsingSail(key: string): Race[] {
  return RACES.filter((r) => r.sailEntries.some((e) => e.sailKeys.includes(key)))
}

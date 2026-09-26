/**
 * PROTOTYPE FIXTURE — LAY-147. Invented numbers, shaped to the real archive.
 *
 * Nothing here is read from the database. The point of a prototype fixture is to make the
 * *hard* cases visible on screen, so these numbers are chosen to reproduce, on purpose:
 *
 * - The **pre-July heading error**: `CONTEXT.md` records that recordings before July 2026 carry
 *   roughly 10-12° of `HDG` deviation. So era 1 sits near +11° and era 2 near +3°, and the trend
 *   has a visible step at a Calibration Event — which is the whole of LAY-147's question 3.
 * - **LAY-145's cross-channel wrinkle**: the July `HDG` autocompensation moves the *AWA* figure
 *   too (−7.8° → −4.1°), even though nobody touched the masthead. A screen that annotates only
 *   same-channel events would make that look like a mystery.
 * - **Exclusions that are not gaps**: one race with too few compass points, four with no usable
 *   tack pairs. LAY-145 §2.4 forbids rendering these as zero, so every variant has to show them
 *   as something.
 * - **A race that can't carry its own fit line**: a light-air evening whose `SOG` never spans the
 *   3kt ADR 0027 requires. Its scatter still shows; its line does not.
 * - **The distance race**: 13.68 hours against a beer-can's ~90 minutes (ADR 0009), the reason
 *   every aggregate in this map weights per-Race rather than per-row.
 */

/** A `Calibration Log` entry, as this screen needs it: a date, a channel, and words. */
export interface CalEvent {
  date: string
  /** Short label for a chart gutter — tight enough for 390px. */
  tick: string
  channel: 'HDG' | 'AWA' | 'AWS' | 'STW'
  /** Whether it came from a Calibration Event or an Instrument Calibration Version change. */
  source: 'event' | 'version'
  note: string
}

export const CAL_EVENTS: CalEvent[] = [
  {
    date: '2026-09-02',
    tick: 'MASTHEAD',
    channel: 'AWA',
    source: 'event',
    note: 'Masthead unit re-aligned after the mast came out and went back in.',
  },
  {
    date: '2026-08-19',
    tick: 'PADDLEWHEEL',
    channel: 'STW',
    source: 'version',
    note: 'STW multiplier 1.00 → 1.04 after the paddlewheel was cleaned.',
  },
  {
    date: '2026-07-08',
    tick: 'AUTOCOMP',
    channel: 'HDG',
    source: 'event',
    note: 'Compass autocompensation run off Navy Pier in flat water.',
  },
]

/** Why a Race has no point on a channel's trend. Never rendered as a zero. */
export type ExclusionReason = 'too-few-points' | 'too-few-segments' | 'no-pairs'

export const EXCLUSION_WORDS: Record<ExclusionReason, string> = {
  'too-few-points': 'too few valid points',
  'too-few-segments': 'too few steady segments',
  'no-pairs': 'no tack pairs',
}

/** One channel's reading for one Race: either a figure, or the reason there isn't one. */
export type ChannelPoint =
  | { ok: true; value: number; spread: number; points: number }
  | { ok: false; reason: ExclusionReason; points: number }

export interface Race {
  id: string
  date: string
  /** `null` is normal — an untitled Race is not a defect (ADR 0010). */
  title: string | null
  /** Hours of recorded window, for the "one long race must not dominate" story. */
  hours: number
  countableRows: number
  /** Measured Offset for `HDG`, via `COG`, in degrees. */
  hdg: ChannelPoint
  /** Apparent Wind Asymmetry, in degrees. Not a Measured Offset. */
  awa: ChannelPoint
  /** Measured Offset for `STW`, via `SOG` — knots of gap from the 1:1 line. */
  stw: ChannelPoint
  /** `R²` of this Race's own `SOG`-on-`STW` fit, or `null` if it earned no line. */
  stwR2: number | null
  /** Knots of `SOG` spread. Under 3, ADR 0027 draws no per-Race fit line. */
  sogSpread: number
}

export const RACES: Race[] = [
  {
    id: 'r01',
    date: '2026-06-03',
    title: 'Wednesday series 1',
    hours: 1.6,
    countableRows: 214,
    hdg: { ok: true, value: 11.4, spread: 4.1, points: 188 },
    awa: { ok: true, value: -7.6, spread: 5.2, points: 22 },
    stw: { ok: true, value: -0.54, spread: 0.19, points: 190 },
    stwR2: 0.86,
    sogSpread: 4.8,
  },
  {
    id: 'r02',
    date: '2026-06-10',
    title: 'Wednesday series 2',
    hours: 1.4,
    countableRows: 151,
    hdg: { ok: true, value: 10.8, spread: 4.6, points: 133 },
    awa: { ok: false, reason: 'no-pairs', points: 0 },
    stw: { ok: true, value: -0.31, spread: 0.28, points: 121 },
    stwR2: null,
    sogSpread: 2.1,
  },
  {
    id: 'r03',
    date: '2026-06-17',
    title: null,
    hours: 1.5,
    countableRows: 198,
    hdg: { ok: true, value: 12.1, spread: 3.8, points: 176 },
    awa: { ok: true, value: -8.4, spread: 4.7, points: 18 },
    stw: { ok: true, value: -0.58, spread: 0.21, points: 172 },
    stwR2: 0.88,
    sogSpread: 5.2,
  },
  {
    id: 'r04',
    date: '2026-06-24',
    title: 'Wednesday series 4',
    hours: 1.7,
    countableRows: 231,
    hdg: { ok: true, value: 11.6, spread: 4.4, points: 205 },
    awa: { ok: true, value: -7.1, spread: 6.1, points: 26 },
    stw: { ok: true, value: -0.49, spread: 0.23, points: 203 },
    stwR2: 0.84,
    sogSpread: 4.1,
  },
  {
    id: 'r05',
    date: '2026-07-01',
    title: 'Wednesday series 5',
    hours: 1.5,
    countableRows: 187,
    hdg: { ok: true, value: 10.9, spread: 5.0, points: 164 },
    awa: { ok: false, reason: 'too-few-segments', points: 9 },
    stw: { ok: true, value: -0.61, spread: 0.26, points: 159 },
    stwR2: 0.81,
    sogSpread: 3.6,
  },
  {
    id: 'r06',
    date: '2026-07-11',
    title: 'St Joe distance race',
    hours: 13.68,
    countableRows: 1042,
    hdg: { ok: true, value: 2.9, spread: 2.4, points: 961 },
    awa: { ok: true, value: -4.2, spread: 3.9, points: 84 },
    stw: { ok: true, value: -0.5, spread: 0.14, points: 902 },
    stwR2: 0.92,
    sogSpread: 7.4,
  },
  {
    id: 'r07',
    date: '2026-07-15',
    title: 'Wednesday series 6',
    hours: 1.6,
    countableRows: 209,
    hdg: { ok: true, value: 3.4, spread: 2.9, points: 184 },
    awa: { ok: true, value: -4.0, spread: 4.4, points: 24 },
    stw: { ok: true, value: -0.55, spread: 0.22, points: 181 },
    stwR2: 0.85,
    sogSpread: 4.6,
  },
  {
    id: 'r08',
    date: '2026-07-22',
    title: 'Wednesday series 7',
    hours: 1.5,
    countableRows: 194,
    hdg: { ok: true, value: 2.6, spread: 3.1, points: 171 },
    awa: { ok: false, reason: 'no-pairs', points: 0 },
    stw: { ok: true, value: -0.47, spread: 0.24, points: 168 },
    stwR2: 0.83,
    sogSpread: 4.3,
  },
  {
    id: 'r09',
    date: '2026-08-05',
    title: 'Verve Cup, race 1',
    hours: 2.3,
    countableRows: 298,
    hdg: { ok: true, value: 3.1, spread: 2.6, points: 271 },
    awa: { ok: true, value: -4.6, spread: 4.1, points: 31 },
    stw: { ok: true, value: -0.53, spread: 0.18, points: 266 },
    stwR2: 0.89,
    sogSpread: 5.9,
  },
  {
    id: 'r10',
    date: '2026-08-12',
    title: 'Verve Cup, race 2',
    hours: 2.1,
    countableRows: 276,
    hdg: { ok: true, value: 2.8, spread: 2.8, points: 248 },
    awa: { ok: true, value: -4.3, spread: 4.8, points: 29 },
    stw: { ok: true, value: -0.51, spread: 0.2, points: 244 },
    stwR2: 0.87,
    sogSpread: 5.1,
  },
  {
    id: 'r11',
    date: '2026-08-26',
    title: null,
    hours: 0.9,
    countableRows: 61,
    hdg: { ok: false, reason: 'too-few-points', points: 3 },
    awa: { ok: false, reason: 'no-pairs', points: 0 },
    stw: { ok: true, value: -0.22, spread: 0.31, points: 47 },
    stwR2: null,
    sogSpread: 2.4,
  },
  {
    id: 'r12',
    date: '2026-09-04',
    title: 'Wednesday series 12',
    hours: 1.6,
    countableRows: 218,
    hdg: { ok: true, value: 3.6, spread: 2.7, points: 193 },
    awa: { ok: true, value: -1.4, spread: 3.6, points: 27 },
    stw: { ok: true, value: -0.17, spread: 0.16, points: 190 },
    stwR2: 0.91,
    sogSpread: 5.4,
  },
  {
    id: 'r13',
    date: '2026-09-16',
    title: 'Fall series 1',
    hours: 1.8,
    countableRows: 239,
    hdg: { ok: true, value: 3.0, spread: 2.5, points: 213 },
    awa: { ok: true, value: -1.2, spread: 3.3, points: 30 },
    stw: { ok: true, value: -0.15, spread: 0.15, points: 209 },
    stwR2: 0.93,
    sogSpread: 6.2,
  },
]

export type ChannelKey = 'hdg' | 'awa' | 'stw'

export interface ChannelMeta {
  key: ChannelKey
  /** What a sailor calls it. */
  label: string
  /** The `Calibration Channel` it concerns. */
  channel: 'HDG' | 'AWA' | 'STW'
  /** The domain term for the figure, spelled exactly as the closed tickets settled it. */
  term: string
  unit: string
  /** How the figure is derived, in one line. */
  how: string
  /** The one caveat that must travel with the figure. */
  caveat: string
  /**
   * Which Calibration Log channels annotate this channel's trend. `AWA` carries `HDG` too,
   * because LAY-145 established the two are not independent — a compass autocompensation
   * plausibly moves the asymmetry.
   */
  marks: CalEvent['channel'][]
}

export const CHANNELS: ChannelMeta[] = [
  {
    key: 'hdg',
    label: 'Compass vs GPS course',
    channel: 'HDG',
    term: 'Measured Offset for HDG, via COG',
    unit: '°',
    how: 'The boat’s own course through the water against GPS course over ground, averaged over Countable rows and binned by heading.',
    caveat: 'CTW = HDG + leeway, so a little of this figure is leeway rather than compass.',
    marks: ['HDG'],
  },
  {
    key: 'awa',
    label: 'Apparent wind, tack to tack',
    channel: 'AWA',
    term: 'Apparent Wind Asymmetry',
    unit: '°',
    how: 'How far the apparent wind angle disagrees with itself across a tack, paired over steady segments either side.',
    caveat:
      'Not a Measured Offset for AWA. Its only input is qtVlm’s recomputed AWA, never the masthead’s reading, so the asymmetry cannot be pinned on the vane — it may be HDG deviation or a leeway-model error leaking through.',
    marks: ['AWA', 'HDG'],
  },
  {
    key: 'stw',
    label: 'Paddlewheel vs GPS speed',
    channel: 'STW',
    term: 'Measured Offset for STW, via SOG',
    unit: 'kt',
    how: 'GPS speed regressed on the recorded, already-corrected paddlewheel speed. The current configuration is the 1:1 line; this is the gap from it.',
    caveat:
      'Assumes current is negligible — measured true for this boat on Lake Michigan, and not safe to carry to another venue.',
    marks: ['STW'],
  },
]

/** One stretch of an instrument's life, bounded by Calibration Log entries. */
export interface Era {
  /** ISO date the era opens on. */
  from: string
  /** The entry that opened it, or `null` for the first race in the archive. */
  opener: CalEvent | null
  value: number
  spread: number
  races: number
  /** Only the `STW` check reports one. */
  r2: number | null
}

/**
 * Eras per channel, split at that channel's own marks — invented to match `RACES` above,
 * not computed from it. A prototype does not need the real aggregation, only its shape.
 */
export const ERAS: Record<ChannelKey, Era[]> = {
  hdg: [
    { from: '2026-07-08', opener: CAL_EVENTS[2], value: 3.0, spread: 2.7, races: 7, r2: null },
    { from: '2026-06-03', opener: null, value: 11.4, spread: 4.2, races: 5, r2: null },
  ],
  awa: [
    { from: '2026-09-02', opener: CAL_EVENTS[0], value: -1.3, spread: 3.4, races: 2, r2: null },
    { from: '2026-07-08', opener: CAL_EVENTS[2], value: -4.3, spread: 4.3, races: 5, r2: null },
    { from: '2026-06-03', opener: null, value: -7.7, spread: 5.3, races: 3, r2: null },
  ],
  stw: [
    { from: '2026-08-19', opener: CAL_EVENTS[1], value: -0.18, spread: 0.21, races: 3, r2: 0.91 },
    { from: '2026-06-03', opener: null, value: -0.52, spread: 0.22, races: 10, r2: 0.87 },
  ],
}

/** Population-level coverage, stated rather than filtered away. */
export const COVERAGE = {
  races: RACES.length,
  countableRows: RACES.reduce((sum, race) => sum + race.countableRows, 0),
  /** ADR 0027: these rows have no x-value to plot at all, so they are a stat, not a gap. */
  blankStwPct: 19.8,
  /** LAY-138: Sea State is unannotated on 6 of 13 races. The filter owes this a real bucket. */
  unknownSeaStateRaces: 6,
}

export function pointOf(race: Race, key: ChannelKey): ChannelPoint {
  return key === 'hdg' ? race.hdg : key === 'awa' ? race.awa : race.stw
}

/** `+3.0°`, `−0.18 kt` — signed, because the sign is the whole meaning of an offset. */
export function signed(value: number, unit: string, places = 1): string {
  const body = Math.abs(value).toFixed(places)
  const sign = value < 0 ? '−' : '+'
  return unit === 'kt' ? `${sign}${body} kt` : `${sign}${body}${unit}`
}

/** `Jun 3` — short enough for a 390px chart gutter. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function raceName(race: Race): string {
  return race.title ?? `Untitled race · ${shortDate(race.date)}`
}

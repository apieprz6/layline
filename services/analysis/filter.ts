/**
 * The **Analysis Filter**: one vocabulary per dimension, one rule for matching a row against it.
 *
 * ADR 0026's row-matching primitive, with ADR 0029's decisions in it. Three screens share this —
 * Polar performance, the **Sail Selection Screen**, the Instrument Tuning screen — each declaring
 * which dimensions it offers, so a new dimension is added once.
 *
 * ## Free of server-only imports, on purpose
 *
 * ADR 0029 moved aggregation into the browser: a tap must never wait on a navigation, so matching
 * runs on the rows the Server Component already shipped. Every function here is pure and
 * isomorphic, and the module imports nothing that could not run in either place. That is a
 * constraint on how this is written, not a change to what it does.
 *
 * ## An untouched dimension is an empty selection
 *
 * Not a pre-selected list of every bucket. This is what makes ADR 0026's "**Not recorded** is on by
 * default" fall out without an untouched filter enumerating anything, and it is what keeps a
 * shared URL meaningful after the vocabulary grows: `?sea=calm` says what the sailor picked, and
 * silence says they picked nothing.
 *
 * ## Which boundaries came from where
 *
 * Wind speed is `AGENTS.md`'s own Light/Medium/Heavy/Storm, as ADR 0026 instructed and ADR 0029
 * confirmed against the archive. `when` is derived from the archive, as ADR 0029 decided. The sail
 * vocabulary is the **Crossover Chart**'s and only ever the Crossover Chart's (ADR 0023).
 *
 * Two boundaries no ADR settled, and this module is their first home — both stated in the UI
 * rather than silently assumed, which is the whole of why they are constants with footnotes:
 *
 *   - **Point of sail** cuts at `|TWA|` 70° and 135°, the Claude Design mockup's own cuts and the
 *     ones the LAY-144 prototype measured the archive with. Deliberately *not* `ZONE_BOUNDARY_DEG`:
 *     that line splits the whole circle in two because a **Target VMG** search and a tack-or-gybe
 *     call have only two answers to give, whereas a sailor filtering by point of sail means three
 *     things, and a reach is neither of the other two.
 *   - **Time of day** is a fixed clock, `DAY_FROM_HOUR` to `NIGHT_FROM_HOUR`, and not civil
 *     twilight. A sunrise would need a date, a position and a library none of which this has, and
 *     an approximation presented as sunrise would be Layline claiming to know when the sun came
 *     up. So the bucket says `06:00–20:00` in as many words.
 */

import { seaStateLabel, SEA_STATES } from '@/services/races/annotations'
import { wallClockDay } from '@/services/recordings/wall-clock'
import type {
  AnalysisBucket,
  AnalysisDayRange,
  AnalysisDimension,
  AnalysisDimensionSpec,
  AnalysisFilter,
  MatchableRow,
} from '@/types'

/** A row whose value for this dimension nobody wrote down. In every dimension (ADR 0029). */
export const NOT_RECORDED = 'not-recorded'

/**
 * A **Sail Configuration** that names no **Sail Definition** — a note alone.
 *
 * Not a data defect. ADR 0023 makes the Crossover Chart the only sail vocabulary, and a boat can
 * fly something outside it: the 26 Aug race flew mainsail alone, four rows, which the chart has no
 * word for. A third non-value state on this dimension, and the only dimension with one.
 */
export const NOTE_ONLY = 'note-only'

/** Where day begins on the fixed clock the `time` dimension reads. */
export const DAY_FROM_HOUR = 6
/** Where night begins on it. */
export const NIGHT_FROM_HOUR = 20

/** `|TWA|` at or below this is upwind. */
export const UPWIND_TO_DEG = 70
/** `|TWA|` at or above this is downwind; between the two is a reach. */
export const DOWNWIND_FROM_HEIGHT_DEG = 135

/**
 * The four bands `AGENTS.md` defines, read at the knot each one opens on.
 *
 * `from_kt` is the whole of the rule: a band is entered at `>= from_kt`, so 8.9 knots is Light and
 * 9.0 is Medium. The table's `0–8 / 9–15 / 16–22 / 23+` reads as whole knots and a recording logs
 * tenths, so without this the fractional knots between two bands would fall in neither.
 */
const WIND_BANDS: readonly { id: string; label: string; from_kt: number }[] = [
  { id: 'light', label: 'Light (0–8 kt)', from_kt: 0 },
  { id: 'medium', label: 'Medium (9–15 kt)', from_kt: 9 },
  { id: 'heavy', label: 'Heavy (16–22 kt)', from_kt: 16 },
  { id: 'storm', label: 'Storm (23+ kt)', from_kt: 23 },
]

const POINTS_OF_SAIL: readonly { id: string; label: string }[] = [
  { id: 'upwind', label: 'Upwind' },
  { id: 'reach', label: 'Reach' },
  { id: 'downwind', label: 'Downwind' },
]

/** Every dimension the Polar performance screen offers, in the order its rail draws them. */
export const POLAR_PERFORMANCE_DIMENSIONS: readonly AnalysisDimension[] = [
  'wind',
  'pos',
  'sail',
  'sea',
  'time',
  'when',
]

/**
 * What the two derived dimensions take from the archive.
 *
 * A port, in the sense `AGENTS.md` means: whoever reads the archive supplies it, and this module
 * neither knows nor cares that one half comes from `crossover_sail_definitions` and the other
 * from the rows' own days.
 */
export interface AnalysisVocabulary {
  /**
   * Every **Sail Definition** label in play, in the order the chips should read.
   *
   * Labels rather than Definition numbers, and that is deliberate: a number is one Crossover Chart
   * Version's identifier, and a Race points at the Version it was sailed under (ADR 0012), so
   * `4` can be two different sails across a season. The label is the sail's own name in the
   * chart's words, which is the only thing two Versions can be compared on.
   */
  sails: readonly string[]
  /** Every `YYYY-MM` the archive's rows fall in, oldest first. */
  months: readonly string[]
}

const notRecorded = (footnote: string | null = null): AnalysisBucket => ({
  id: NOT_RECORDED,
  label: 'Not recorded',
  about_the_record: true,
  footnote,
})

/** Said on the two dimensions read off a row's own timestamp, where the bucket can never fill. */
const ALWAYS_RECORDED =
  'Every recording row has a time, so nothing can land in Not recorded here.'

const plain = (bucket: { id: string; label: string }): AnalysisBucket => ({
  ...bucket,
  about_the_record: false,
  footnote: null,
})

/** `2026-06` as `Jun 2026`, through the same month names every other screen prints. */
function monthLabel(id: string): string {
  return `${wallClockDay(`${id}-01T00:00:00`).split(' ')[0]} ${id.slice(0, 4)}`
}

/**
 * The dimensions a screen offers, each with its whole vocabulary.
 *
 * **Every entry always renders**, empty or not (ADR 0014, ADR 0029): this boat owns three sails it
 * has never raced, and a chip that vanished would not say why. Which is also why the empty ones
 * are the renderer's problem rather than this function's — nothing is filtered out here.
 *
 * **Not recorded** sits in all six. ADR 0029 only argues for it on the two dimensions that are
 * half unannotated, but a row can lack a `TWS` or a `TWA` too, and a dimension that quietly
 * swallowed those rows into a real band would be the one thing the bucket exists to prevent. On
 * `time` and `when` it is structurally empty — every row has a time — so it renders disabled,
 * which is the same answer ADR 0014 gives a sail nobody has raced.
 *
 * It leads the two dimensions where it is the largest bucket in the archive and trails the rest:
 * ADR 0029 is explicit that burying the biggest bucket last is "exactly backwards", and equally
 * that a structurally-empty one should not head the list.
 */
export function analysisDimensions(
  offered: readonly AnalysisDimension[],
  vocabulary: AnalysisVocabulary
): AnalysisDimensionSpec[] {
  const specs: Record<AnalysisDimension, AnalysisDimensionSpec> = {
    wind: {
      id: 'wind',
      label: 'Wind speed',
      derived: false,
      continuous: false,
      absence_possible: true,
      buckets: [...WIND_BANDS.map(plain), notRecorded()],
    },
    pos: {
      id: 'pos',
      label: 'Point of sail',
      derived: false,
      continuous: false,
      absence_possible: true,
      buckets: [
        {
          ...plain(POINTS_OF_SAIL[0]),
          footnote: `Read off |TWA|: upwind to ${UPWIND_TO_DEG}°, downwind from ${DOWNWIND_FROM_HEIGHT_DEG}°.`,
        },
        ...POINTS_OF_SAIL.slice(1).map(plain),
        notRecorded(),
      ],
    },
    sail: {
      id: 'sail',
      label: 'Sail used',
      derived: true,
      continuous: false,
      absence_possible: true,
      buckets: [
        notRecorded(),
        {
          id: NOTE_ONLY,
          label: 'Note only',
          about_the_record: true,
          footnote:
            'A Sail Configuration that names no sail from the Crossover Chart — the boat flew ' +
            'something the chart has no word for, which is the vocabulary running out and not a ' +
            'mistake.',
        },
        ...vocabulary.sails.map((label) => plain({ id: label, label })),
      ],
    },
    sea: {
      id: 'sea',
      label: 'Sea state',
      derived: false,
      continuous: false,
      absence_possible: true,
      buckets: [
        notRecorded(),
        ...SEA_STATES.map((each) => plain({ id: each.value, label: `${each.label} (${each.height})` })),
      ],
    },
    time: {
      id: 'time',
      label: 'Time of day',
      derived: false,
      continuous: false,
      absence_possible: false,
      buckets: [
        {
          ...plain({ id: 'day', label: 'Day' }),
          footnote:
            `A fixed clock — day runs ${String(DAY_FROM_HOUR).padStart(2, '0')}:00 to ` +
            `${String(NIGHT_FROM_HOUR).padStart(2, '0')}:00 in the recording's own frame — and ` +
            'not sunrise and sunset, which Layline does not know.',
        },
        plain({ id: 'night', label: 'Night' }),
        notRecorded(ALWAYS_RECORDED),
      ],
    },
    when: {
      id: 'when',
      label: 'When',
      derived: true,
      continuous: true,
      absence_possible: false,
      buckets: [
        notRecorded(ALWAYS_RECORDED),
        ...vocabulary.months.map((id) => plain({ id, label: monthLabel(id) })),
      ],
    },
  }

  return offered.map((id) => specs[id])
}

/**
 * Which bucket of one dimension a row falls in. Every row falls in exactly one, always.
 *
 * Total by construction: where the row recorded nothing the answer is **Not recorded**, which is a
 * bucket and not an absence. Nothing here can return null, because a row that matched no bucket
 * would be a row the filter silently dropped.
 */
export function bucketOf(row: MatchableRow, dimension: AnalysisDimension): string {
  switch (dimension) {
    case 'wind': {
      if (row.tws === null) return NOT_RECORDED
      // Last band whose opening knot the row is at or above. The list is ascending and opens at 0,
      // so a non-negative reading always finds one.
      const band = [...WIND_BANDS].reverse().find((each) => row.tws !== null && row.tws >= each.from_kt)
      return band?.id ?? WIND_BANDS[0].id
    }
    case 'pos': {
      if (row.twa === null) return NOT_RECORDED
      const off = Math.abs(row.twa)
      if (off <= UPWIND_TO_DEG) return 'upwind'
      return off >= DOWNWIND_FROM_HEIGHT_DEG ? 'downwind' : 'reach'
    }
    case 'sail':
      return row.sail.recorded === 'definition' ? row.sail.label : row.sail.recorded
    case 'sea':
      return row.sea_state ?? NOT_RECORDED
    case 'time': {
      const hour = Math.floor(row.day_seconds / 3600)
      return hour >= DAY_FROM_HOUR && hour < NIGHT_FROM_HOUR ? 'day' : 'night'
    }
    case 'when':
      return row.day.slice(0, 7)
  }
}

/** Nothing narrowed: the whole archive, **Not recorded** included. */
export const EMPTY_FILTER: AnalysisFilter = { buckets: {}, range: null }

/** What this dimension is narrowed to, or an empty list where it is untouched. */
export function selectedBuckets(
  filter: AnalysisFilter,
  dimension: AnalysisDimension
): readonly string[] {
  return filter.buckets[dimension] ?? []
}

/** Whether the sailor has narrowed this dimension at all — the chip's own lit/unlit state. */
export function isNarrowed(filter: AnalysisFilter, dimension: AnalysisDimension): boolean {
  return selectedBuckets(filter, dimension).length > 0 || (dimension === 'when' && filter.range !== null)
}

/**
 * One dimension's selection replaced.
 *
 * An empty selection **removes the key** rather than storing `[]`. Both mean untouched, and one
 * canonical shape for untouched is what lets two filters be compared, and what keeps a dimension
 * nobody narrowed out of the URL.
 */
function withBuckets(
  filter: AnalysisFilter,
  dimension: AnalysisDimension,
  ids: readonly string[]
): AnalysisFilter {
  const buckets = { ...filter.buckets }
  if (ids.length === 0) delete buckets[dimension]
  else buckets[dimension] = ids

  return { ...filter, buckets }
}

/**
 * One bucket on, or off again.
 *
 * Picking a month abandons a day range and vice versa: they are two ways of saying one thing, and
 * honouring both at once would silently let the narrower of them win.
 */
export function toggleBucket(
  filter: AnalysisFilter,
  dimension: AnalysisDimension,
  bucketId: string
): AnalysisFilter {
  const current = selectedBuckets(filter, dimension)
  const next = current.includes(bucketId)
    ? current.filter((id) => id !== bucketId)
    : [...current, bucketId]

  const narrowedFilter = withBuckets(filter, dimension, next)
  return dimension === 'when' ? { ...narrowedFilter, range: null } : narrowedFilter
}

/** The `when` dimension's continuous control: an explicit span of days. */
export function setDayRange(filter: AnalysisFilter, range: AnalysisDayRange | null): AnalysisFilter {
  return { ...withBuckets(filter, 'when', []), range }
}

/** One dimension back to untouched. */
export function clearDimension(
  filter: AnalysisFilter,
  dimension: AnalysisDimension
): AnalysisFilter {
  const cleared = withBuckets(filter, dimension, [])
  return dimension === 'when' ? { ...cleared, range: null } : cleared
}

/** The whole archive again. */
export function clearFilter(): AnalysisFilter {
  return EMPTY_FILTER
}

/**
 * Whether a row satisfies every dimension the screen offers.
 *
 * `ignoring` is what makes an honest chip count possible: a bucket's number has to be computed
 * with every *other* dimension applied but not its own, so it predicts what tapping it does rather
 * than describing what is already on screen.
 *
 * A dimension the screen does not offer is not consulted, whatever a URL said about it — the
 * registry is the authority on what this screen narrows by, not the query string.
 */
export function matchesFilter(
  row: MatchableRow,
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  ignoring: readonly AnalysisDimension[] = []
): boolean {
  for (const dimension of dimensions) {
    if (ignoring.includes(dimension.id)) continue

    const picked = selectedBuckets(filter, dimension.id)
    if (picked.length > 0 && !picked.includes(bucketOf(row, dimension.id))) return false

    if (dimension.id === 'when' && filter.range !== null) {
      if (row.day < filter.range.from || row.day > filter.range.to) return false
    }
  }

  return true
}

/** The matched rows, in the order they were given. */
export function matchedRows(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): MatchableRow[] {
  return rows.filter((row) => matchesFilter(row, filter, dimensions))
}

/** How many rows one bucket holds, and how many **Races** they come from. */
export interface BucketCount {
  rows: number
  races: number
}

/**
 * Every bucket of one dimension with the count tapping it would produce.
 *
 * Keyed by bucket id, with an entry for **every** bucket in the vocabulary — a zero is a count and
 * not a missing key, because the chip that renders it has to say "never raced" rather than vanish.
 */
export function bucketCounts(
  rows: readonly MatchableRow[],
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  dimension: AnalysisDimension
): Map<string, BucketCount> {
  const spec = dimensions.find((each) => each.id === dimension)
  const counts = new Map<string, BucketCount>()
  const races = new Map<string, Set<string>>()

  for (const bucket of spec?.buckets ?? []) {
    counts.set(bucket.id, { rows: 0, races: 0 })
    races.set(bucket.id, new Set())
  }

  for (const row of rows) {
    if (!matchesFilter(row, filter, dimensions, [dimension])) continue

    const id = bucketOf(row, dimension)
    const count = counts.get(id)
    // A bucket id no vocabulary holds is a sail a Race names and the current Crossover Chart
    // Version does not. Counted nowhere rather than invented as a chip: the vocabulary is the
    // chart's (ADR 0023), and a chip this screen could not label is worse than one it omits.
    if (count === undefined) continue

    count.rows += 1
    races.get(id)?.add(row.race_id)
  }

  for (const [id, count] of counts) count.races = races.get(id)?.size ?? 0

  return counts
}

/** A chip's own one-line reading of what it is narrowed to. */
export function summariseDimension(
  filter: AnalysisFilter,
  dimension: AnalysisDimensionSpec
): string {
  if (dimension.id === 'when' && filter.range !== null) {
    return `${wallClockDay(`${filter.range.from}T00:00:00`)} → ${wallClockDay(`${filter.range.to}T00:00:00`)}`
  }

  const picked = selectedBuckets(filter, dimension.id)
  if (picked.length === 0) return 'Any'

  const labels = picked.map(
    (id) => dimension.buckets.find((bucket) => bucket.id === id)?.label ?? id
  )

  return labels.length <= 2 ? labels.join(', ') : `${labels.length} of ${dimension.buckets.length}`
}

/**
 * Whether the rows nobody annotated are in, out, or some of each.
 *
 * **Derived, never held.** Two controls act on one piece of state — this switch and each
 * dimension's own **Not recorded** chip — so if the switch were its own boolean the two could
 * disagree and the ledger would lie.
 */
export type RecordedRowsState = 'included' | 'excluded' | 'mixed'

/**
 * The dimensions the switch acts on: those with a record bucket a row can actually land in.
 *
 * `absence_possible` is what keeps `time` and `when` out of it. Both have a **Not recorded** chip,
 * because every dimension does, but every row has a timestamp — so enumerating their real values
 * would light every chip on two dimensions and write every one into the URL to narrow away nothing.
 */
function withRecordBuckets(
  dimensions: readonly AnalysisDimensionSpec[]
): AnalysisDimensionSpec[] {
  return dimensions.filter(
    (each) => each.absence_possible && each.buckets.some((bucket) => bucket.about_the_record)
  )
}

const bucketIds = (dimension: AnalysisDimensionSpec, aboutTheRecord: boolean): string[] =>
  dimension.buckets
    .filter((bucket) => bucket.about_the_record === aboutTheRecord)
    .map((bucket) => bucket.id)

export function recordedRowsState(
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): RecordedRowsState {
  const perDimension = withRecordBuckets(dimensions).map((dimension) => {
    const picked = selectedBuckets(filter, dimension.id)
    // Untouched admits everything, which is the default ADR 0026 fixed.
    if (picked.length === 0) return 'included'

    const record = bucketIds(dimension, true)
    if (record.every((id) => picked.includes(id))) return 'included'
    return record.some((id) => picked.includes(id)) ? 'mixed' : 'excluded'
  })

  if (perDimension.every((each) => each === 'included')) return 'included'
  if (perDimension.every((each) => each === 'excluded')) return 'excluded'
  return 'mixed'
}

/**
 * The switch, acting at once on every dimension that has a record bucket.
 *
 * Off means: on each such dimension, select all the real values and none of the record ones. On
 * means the reverse, and it returns a dimension nobody narrowed to *untouched* rather than to
 * every chip lit — an untouched dimension and one with its whole vocabulary selected match the
 * same rows, but only the first keeps saying so after the vocabulary grows.
 */
export function setRecordedRows(
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[],
  include: boolean
): AnalysisFilter {
  let next = filter

  for (const dimension of withRecordBuckets(dimensions)) {
    const picked = selectedBuckets(next, dimension.id)
    const real = bucketIds(dimension, false)
    const record = bucketIds(dimension, true)

    if (!include) {
      const kept = picked.filter((id) => real.includes(id))
      next = withBuckets(next, dimension.id, kept.length > 0 ? kept : real)
      continue
    }

    if (picked.length === 0) continue

    const everyRealValue = real.every((id) => picked.includes(id)) && picked.length === real.length
    next = everyRealValue
      ? clearDimension(next, dimension.id)
      : withBuckets(next, dimension.id, [...picked, ...record.filter((id) => !picked.includes(id))])
  }

  return next
}

// ---------------------------------------------------------------------------
// The URL
// ---------------------------------------------------------------------------
// ADR 0029: the filter is client state mirrored into `searchParams` with `replaceState`, and first
// paint still reads `searchParams` on the server — so both directions of this live here, in the
// isomorphic module, and are called from both sides.
//
// One param per selected bucket rather than one comma-joined param per dimension. A bucket id can
// be a **Sail Definition**'s own words (ADR 0023), and a separator inside an id is a bug waiting
// for the first sail somebody names with a comma; `getAll` has no such edge.

/** `YYYY-MM-DD`, which is the only shape a day bound may take. */
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Every selected bucket, as the URL carries them. Empty where nothing is narrowed. */
export function filterToSearchParams(
  filter: AnalysisFilter,
  dimensions: readonly AnalysisDimensionSpec[]
): URLSearchParams {
  const params = new URLSearchParams()

  for (const dimension of dimensions) {
    for (const id of selectedBuckets(filter, dimension.id)) params.append(dimension.id, id)
  }

  if (filter.range !== null) {
    params.set('from', filter.range.from)
    params.set('to', filter.range.to)
  }

  return params
}

/** One `searchParams` entry as a list, however Next handed it over. */
function asList(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return []
  return Array.isArray(raw) ? raw : [raw]
}

const one = (raw: string | string[] | undefined): string | null => asList(raw)[0] ?? null

/**
 * A filter out of a query string, sanitised.
 *
 * A bucket id the vocabulary does not hold is **dropped, never honoured** — a stale link, a
 * hand-typed param or a season the archive has grown past should narrow to something real or to
 * nothing, never to an empty screen with no explanation. Same instinct as `amendSection()`.
 *
 * A half-written or back-to-front range is dropped whole for the same reason: guessing the missing
 * end would be Layline choosing which races a shared link was about.
 */
export function filterFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  dimensions: readonly AnalysisDimensionSpec[]
): AnalysisFilter {
  const buckets: AnalysisFilter['buckets'] = {}

  for (const dimension of dimensions) {
    const known = dimension.buckets.map((bucket) => bucket.id)
    const picked = asList(params[dimension.id]).filter((id) => known.includes(id))
    if (picked.length > 0) buckets[dimension.id] = picked
  }

  const from = one(params.from)
  const to = one(params.to)
  const rangeOffered = dimensions.some((dimension) => dimension.continuous)
  const range =
    rangeOffered && from !== null && to !== null && DAY.test(from) && DAY.test(to) && from <= to
      ? { from, to }
      : null

  // Mutually exclusive, and the range loses: a link carrying both was not written by this app, and
  // the chips are the thing a sailor can see they picked.
  if (range !== null) delete buckets.when

  return { buckets, range }
}

/** Re-exported so a renderer can print a Sea State's own word without a second lookup table. */
export { seaStateLabel }

/**
 * An **Analysis Filter** as a query string, both directions.
 *
 * ADR 0029 splits the filter's life in two: it is client state mirrored into `searchParams` with
 * `history.replaceState`, and **first paint still reads `searchParams` on the server** so a shared
 * link renders its own narrowing before hydration. Both directions therefore run on both sides,
 * and they live here rather than in `filter.ts` because a codec is a different concern from a
 * vocabulary — this module changes when the URL's shape changes, that one when a dimension does.
 *
 * One param per selected bucket rather than one comma-joined param per dimension. A bucket id can
 * be a **Sail Definition**'s own words (ADR 0023), and a separator inside an id is a bug waiting
 * for the first sail somebody names with a comma; `getAll` has no such edge.
 */

import { RANGE_DIMENSION, selectedBuckets } from '@/services/analysis/filter'
import type { AnalysisDimensionSpec, AnalysisFilter } from '@/types'

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
  if (range !== null) delete buckets[RANGE_DIMENSION]

  return { buckets, range }
}

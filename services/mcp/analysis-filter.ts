/**
 * The **Analysis Filter** as an MCP tool's argument: defined once, offered per tool (ADR 0042).
 *
 * Every tool that narrows the archive takes one `filter` argument shaped by this module, and
 * declares which dimensions it offers exactly as its screen does: `POLAR_PERFORMANCE_DIMENSIONS`,
 * `SAIL_SELECTION_DIMENSIONS`, and the Instrument Tuning screen's two. The filter it produces is
 * the screen's own `AnalysisFilter`, so the screen's own matching and aggregation run on it.
 *
 * ## Strict where the URL is forgiving
 *
 * `filterFromSearchParams` drops a bucket id it does not know, because a stale link should still
 * open a screen. A tool call has no screen to open: a dropped bucket would be an answer about a
 * wider match than Claude asked for, stated as though it were the narrow one. So an unknown
 * dimension, an unknown bucket or an unusable day range is refused, with the values that would
 * have worked.
 *
 * ## Two halves, because the vocabulary is the archive's
 *
 * The schema is static and tells Claude the shape and every fixed bucket. Sails and months are
 * derived from the archive (ADR 0023, ADR 0029), so they can only be checked after the read: that
 * is `filterFromArgument`, which takes the dimensions the screen itself would build.
 */

import { z } from 'zod'
import {
  NOTE_ONLY,
  NOT_RECORDED,
  RANGE_DIMENSION,
  analysisDimensions,
  ownsDayRange,
} from '@/services/analysis/filter'
import { DAY } from '@/services/analysis/filter-url'
import type {
  AnalysisDimension,
  AnalysisDimensionSpec,
  AnalysisFilter,
  McpAnalysisDimension,
  McpAnalysisFilterArgument,
} from '@/types'

/** The argument's one key that is not a dimension. */
const DAY_RANGE = 'dayRange'

/** How each archive-derived dimension's buckets are named, where the schema cannot list them. */
const DERIVED: Partial<Record<AnalysisDimension, string>> = {
  sail:
    "Sail Definition labels in the Crossover Chart's own words (never its number), plus " +
    `'${NOTE_ONLY}' for a Sail Configuration naming no Sail Definition and '${NOT_RECORDED}'.`,
  when: `Months as 'YYYY-MM', from the months the archive holds, plus '${NOT_RECORDED}'.`,
}

function bucketDescription(dimension: AnalysisDimensionSpec): string {
  const ids = DERIVED[dimension.id] ?? `One or more of: ${dimension.buckets.map((b) => b.id).join(', ')}.`
  const footnotes = dimension.buckets.flatMap((bucket) =>
    bucket.footnote && !bucket.about_the_record ? [bucket.footnote] : []
  )
  return [`${dimension.label}.`, ids, ...footnotes].join(' ')
}

/**
 * The `filter` argument's schema, for a tool offering these dimensions.
 *
 * Loose rather than strict, on purpose: an unknown key has to reach `filterFromArgument`
 * so the refusal can list the dimensions this tool does offer, which a schema error would not.
 */
export function analysisFilterSchema(offered: readonly AnalysisDimension[]) {
  const dimensions = analysisDimensions(offered, { sails: [], months: [] })

  const shape: Record<string, z.ZodOptional<z.ZodType>> = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.id,
      z.array(z.string()).optional().describe(bucketDescription(dimension)),
    ])
  )

  if (offered.some(ownsDayRange)) {
    shape[DAY_RANGE] = z
      .object({ from: z.string(), to: z.string() })
      .optional()
      .describe(
        "An inclusive span of days, 'YYYY-MM-DD', in the recording's own clock. Instead of " +
          "'when' months, never beside them."
      )
  }

  return z
    .looseObject(shape)
    .optional()
    .describe(
      'The Analysis Filter, as the screen\'s filter rail sets it. Leave a dimension out to include ' +
        'all of it, Not recorded included. Naming buckets narrows to exactly those, so add ' +
        `'${NOT_RECORDED}' to keep the sailing nobody annotated. Several buckets of one dimension ` +
        'match any of them; several dimensions must all match.'
    )
}

export type AnalysisFilterReading = { ok: true; filter: AnalysisFilter } | { ok: false; message: string }

const refuse = (message: string): AnalysisFilterReading => ({ ok: false, message })

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string')

/**
 * The argument as the screen's own `AnalysisFilter`, or a refusal naming what would have worked.
 *
 * No argument, and an empty list on a dimension, both mean untouched — the screen's default,
 * **Not recorded** included (ADR 0029).
 */
export function filterFromArgument(
  argument: McpAnalysisFilterArgument | Readonly<Record<string, unknown>> | undefined,
  dimensions: readonly AnalysisDimensionSpec[]
): AnalysisFilterReading {
  const offered = dimensions.map((dimension) => dimension.id)
  const rangeOffered = dimensions.some((dimension) => ownsDayRange(dimension.id))
  const validKeys = [...offered, ...(rangeOffered ? [DAY_RANGE] : [])].join(', ')

  const buckets: AnalysisFilter['buckets'] = {}
  let range: AnalysisFilter['range'] = null

  for (const [key, value] of Object.entries(argument ?? {})) {
    if (value === undefined) continue

    if (key === DAY_RANGE && rangeOffered) {
      const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown }
      if (typeof from !== 'string' || typeof to !== 'string' || !DAY.test(from) || !DAY.test(to)) {
        return refuse(`dayRange needs "from" and "to" as YYYY-MM-DD days.`)
      }
      if (from > to) return refuse(`dayRange runs backwards: "${from}" is after "${to}".`)
      range = { from, to }
      continue
    }

    const dimension = dimensions.find((each) => each.id === key)
    if (!dimension) {
      return refuse(`This tool has no "${key}" dimension. It offers: ${validKeys}.`)
    }
    if (!isStringList(value)) {
      return refuse(`"${key}" takes a list of bucket ids.`)
    }

    const known = dimension.buckets.map((bucket) => bucket.id)
    const unknown = value.find((id) => !known.includes(id))
    if (unknown !== undefined) {
      return refuse(
        `${dimension.label} has no "${unknown}" bucket. Its buckets are: ${known.join(', ')}.`
      )
    }

    if (value.length > 0) buckets[dimension.id] = [...new Set(value)]
  }

  if (range !== null && buckets[RANGE_DIMENSION]) {
    return refuse(
      'Give either "when" months or a dayRange, not both: they say the same thing two ways.'
    )
  }

  return { ok: true, filter: { buckets, range } }
}

/**
 * The filter as it was applied, in the argument's own shape, so Claude can say what it asked.
 *
 * The canonical form and not an echo of the input: an empty list is gone and a repeat is folded,
 * which is what the figures are actually over.
 */
export function filterAsArgument(filter: AnalysisFilter): McpAnalysisFilterArgument {
  return {
    ...Object.fromEntries(Object.entries(filter.buckets).map(([id, ids]) => [id, [...(ids ?? [])]])),
    ...(filter.range ? { [DAY_RANGE]: { ...filter.range } } : {}),
  }
}

/**
 * Every dimension the tool offers with every bucket it holds, empty ones included (ADR 0014).
 *
 * In every answer, because sails and months are the archive's: this is how Claude learns the
 * Sail Definition labels and the months it can narrow by without guessing at them.
 */
export function offeredDimensions(dimensions: readonly AnalysisDimensionSpec[]): McpAnalysisDimension[] {
  return dimensions.map((dimension) => ({
    dimension: dimension.id,
    label: dimension.label,
    buckets: dimension.buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      ...(bucket.footnote ? { footnote: bucket.footnote } : {}),
    })),
  }))
}

/**
 * The filter argument is built from the screen's own definitions, so a new bucket reaches every
 * tool with no change to the MCP server (ADR 0042, *Arguments are built from the screen's own
 * definitions*).
 *
 * Its own file because it replaces `analysisDimensions` for the whole module: here the screen's
 * definitions grow a Sea State nobody has written yet, and nothing under `services/mcp` is told.
 */

import { z } from 'zod'
import type { AnalysisDimension, AnalysisDimensionSpec } from '@/types'

jest.mock('@/services/analysis/filter', () => {
  const actual = jest.requireActual('@/services/analysis/filter')
  return {
    ...actual,
    analysisDimensions: (...args: Parameters<typeof actual.analysisDimensions>): AnalysisDimensionSpec[] =>
      actual.analysisDimensions(...args).map((dimension: AnalysisDimensionSpec) =>
        dimension.id === 'sea'
          ? {
              ...dimension,
              buckets: [
                ...dimension.buckets,
                { id: 'squall', label: 'Squall', about_the_record: false, footnote: null },
              ],
            }
          : dimension
      ),
  }
})

import { analysisFilterSchema, filterFromArgument } from '../analysis-filter'
import { analysisDimensions } from '@/services/analysis/filter'

const OFFERED: AnalysisDimension[] = ['pos', 'sea']

describe('a bucket added to the screen’s definitions', () => {
  it('is accepted by the tool', () => {
    const dimensions = analysisDimensions(OFFERED, { sails: [], months: [] })

    expect(filterFromArgument({ sea: ['squall'] }, dimensions)).toEqual({
      ok: true,
      filter: { buckets: { sea: ['squall'] }, range: null },
    })
  })

  it('is offered to Claude in the argument’s schema', () => {
    const schema = z.toJSONSchema(analysisFilterSchema(OFFERED)) as {
      properties: Record<string, { description?: string }>
    }

    expect(schema.properties.sea.description).toContain('squall')
  })
})

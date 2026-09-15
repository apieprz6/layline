/**
 * The shape a **Polar** payload must have before it is written.
 *
 * `parsePolarFile` already refuses a file it cannot read, so this is not a second copy of the
 * parser's rules for their own sake. It is the gate on the *payload*, which reaches the write
 * by more than one road: parsed on the server, echoed back from a preview the admin confirmed,
 * assembled by a test, and one day produced by a parser for a second format. Whatever built
 * it, this is what the JSONB column is allowed to hold.
 *
 * The shape itself is fixed by `docs/design-docs/race-archive-schema.md`, and the database
 * enforces the outermost part of it — `boat_setup_versions.payload_keys_present` requires a
 * polar to carry `twa_axis`, `tws_axis` and `boat_speed`. Postgres cannot see whether the rows
 * are the width of the wind speed axis, so that is checked here.
 *
 * Unknown keys are refused rather than passed through. A JSONB column keeps whatever it is
 * given forever, so a typo would become a permanent fixture of the archive; a genuinely new
 * key is a schema change, made here on purpose.
 */

import { z } from 'zod'

import type { PolarPayload } from '@/types'

/** Whole degrees of true wind angle, port side, bow to stern. */
const MIN_TWA = 0
const MAX_TWA = 180

/**
 * An axis: at least one value, every value a real non-negative number, strictly ascending.
 *
 * Strictly, so a repeated value is refused too. A duplicated axis entry gives two rows the
 * same coordinate, and no interpolation over that grid has an answer.
 */
function ascendingAxis(label: string, max?: number): z.ZodType<number[]> {
  const value = max === undefined ? z.number().nonnegative() : z.number().min(MIN_TWA).max(max)

  return z
    .array(value)
    .min(1, `${label} must carry at least one value`)
    .refine(
      (values) => values.every((entry, index) => index === 0 || entry > values[index - 1]),
      `${label} must ascend, with no value repeated`
    )
}

export const polarPayloadSchema = z
  .strictObject({
    twa_axis: ascendingAxis('twa_axis', MAX_TWA),
    tws_axis: ascendingAxis('tws_axis'),
    /**
     * Boat speed in knots — speed through the water at that angle and wind speed, not VMG.
     * Zero is legal and common: the qtVlm library files carry an explicit TWS 0 column of it.
     */
    boat_speed: z.array(z.array(z.number().nonnegative())).min(1),
    /**
     * Where the grid came from. Required, because a payload that does not say which format
     * and which header token it was read from cannot be checked against the file again.
     */
    source: z.strictObject({
      format: z.string().min(1, 'source.format must name the format the file was read as'),
      header_token: z
        .string()
        .min(1, 'source.header_token must be the token the file actually carried'),
    }),
  })
  .check((ctx) => {
    const { twa_axis, tws_axis, boat_speed } = ctx.value

    if (boat_speed.length !== twa_axis.length) {
      ctx.issues.push({
        code: 'custom',
        input: boat_speed,
        path: ['boat_speed'],
        message: `boat_speed has ${boat_speed.length} rows for ${twa_axis.length} angles`,
      })
    }

    for (const [index, row] of boat_speed.entries()) {
      if (row.length !== tws_axis.length) {
        ctx.issues.push({
          code: 'custom',
          input: row,
          path: ['boat_speed', index],
          message: `boat_speed row ${index} has ${row.length} speeds for ${tws_axis.length} wind speeds`,
        })
      }
    }
  })

/**
 * A payload that has passed the schema. Identical in shape to `PolarPayload` except that
 * `source` is no longer optional, which is what the schema adds.
 */
export type ValidPolarPayload = z.infer<typeof polarPayloadSchema>

// The two spellings of the payload must stay one shape: `types/index.ts` is what the rest of
// the app reads, and this schema is what the write gate enforces.
const _assignable: PolarPayload = {} as ValidPolarPayload
void _assignable

export type PolarPayloadValidation =
  | { ok: true; payload: ValidPolarPayload }
  | { ok: false; issues: string[] }

/**
 * Validate a payload, reporting every problem rather than only the first.
 *
 * Each issue is rendered as `path: message`, because "boat_speed row 3 has 8 speeds for 9 wind
 * speeds" is a fixable complaint and "invalid payload" is not.
 */
export function validatePolarPayload(payload: unknown): PolarPayloadValidation {
  const result = polarPayloadSchema.safeParse(payload)

  if (result.success) return { ok: true, payload: result.data }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path === '' ? issue.message : `${path}: ${issue.message}`
    }),
  }
}

/**
 * The shape a **Crossover Chart** payload must have before it is written.
 *
 * Both parsers already refuse a file they cannot read, so this is not a second copy of their rules
 * for their own sake. It is the gate on the *payload*, which reaches the write by more than one
 * road: parsed on the server, echoed back from a preview the admin confirmed, assembled by a test.
 * Whatever built it, this is what the JSONB column is allowed to hold.
 *
 * `boat_setup_versions.payload_keys_present` enforces the outermost part of the shape — a
 * crossover payload must carry `twa_axis`, `tws_axis`, `cells` and `sail_definitions`. Three things
 * Postgres cannot reach live here:
 *
 *   1. **The grid is rectangular.** One row per angle, one cell per wind speed.
 *   2. **Every cell resolves to a definition.** A dangling id is unrenderable: there is no sail to
 *      name in that box. The converse is *legal* — a definition no cell references is an inventory
 *      entry the chart simply never recommends, which is a real state and is tolerated.
 *   3. **No superseded sail name gets in.** The one rule here that is about Layline rather than
 *      about the file, for the reason ADR 0012 and the CONTEXT decision log give: nothing outside
 *      this project reads either file, so v1 of this artifact is authored with the corrected names
 *      rather than recording a correction to a name Layline never used.
 *
 * That third rule is a **refusal and never a rewrite**. Layline does not edit the sailor's file for
 * them — the bytes in Storage are what they gave us, and silently substituting a label would be
 * exactly the overwriting the core beliefs forbid. So the message names the correction and the
 * admin makes it.
 *
 * It is also the one rule an already-stored Version is not held to. Two schemas leave here: the
 * **structure**, which is rules 1 and 2 and is what a payload must be to *be* a chart, and the
 * **write gate**, which is that plus rule 3. The reader validates structure only, because a policy
 * can tighten — the next rename is one line in `RENAMED_SAILS` — and a chart written years before
 * that line existed is still the chart the boat sailed with. Running the whole gate on the way out
 * would turn such a Version into "No such Crossover Chart Version", which is exactly the mistake
 * the download route already refuses to make: a rule tightened later must not take the sailor's own
 * file down with it. Structure is different, and is checked both ways for the reason
 * `readFileBackedVersions` gives — a grid whose rows are not the width of its own wind speed axis
 * cannot be drawn at all.
 *
 * The two halves are one payload on purpose. Two artifacts with separate version histories would
 * let a Race freeze a pairing that never existed aboard the boat — a grid from March against
 * definitions from June, with sail 7 meaning two different things (ADR 0012). So the definitions
 * live here beside the grid, and so does the definitions file's own provenance, which has no
 * column of its own (ADR 0022).
 *
 * Unknown keys are refused rather than passed through. A JSONB column keeps whatever it is given
 * forever, so a typo would become a permanent fixture of the archive; a genuinely new key is a
 * schema change, made here on purpose.
 */

import { z } from 'zod'

import { MAX_TWA, ascendingAxis } from '@/services/boat/gridPayloadAxis'
import type { CrossoverChartPayload } from '@/types'

/**
 * A sail Layline has renamed, and what it is called now.
 *
 * One entry, because one sail has been renamed: the sail annotated `reaching-spin` in the boat's
 * own recordings is the **A3**, and two Sail Definition labels used the old word. A table rather
 * than an `if`, so the next rename is one line here and nothing else.
 *
 * The pattern is global, because a label may name two sails and only one of them may be stale.
 */
const RENAMED_SAILS: readonly { readonly was: RegExp; readonly now: string }[] = [
  { was: /reaching[\s-]*spin(?:naker)?/gi, now: 'A3' },
]

const sailDefinitionSchema = z.strictObject({
  /**
   * qtVlm's external id for one Sail Configuration, and what the grid's cells hold. Whole and
   * non-negative; stored as the file gave it, never renumbered, and not required to start at 1 or
   * to be contiguous — qtVlm demands none of that, and renumbering would break the correspondence
   * with the grid file sitting next to it.
   */
  number: z
    .number()
    .int('a sail definition is numbered with a whole number')
    .nonnegative('a sail number cannot be negative'),
  /**
   * What the sailor sees in the box. Free text: qtVlm's own example is French, the boat's is
   * English, and the two share no token. Trimmed non-empty is the whole of the structural rule.
   */
  label: z.string().trim().min(1, 'a sail definition needs a label; a bare number names nothing'),
})

/**
 * What a payload must be to be a chart at all: the shape, and the two rules about how its own parts
 * fit together. Everything here would make the grid unrenderable if it were false, which is why it
 * is checked on the way out of the database as well as on the way in.
 */
export const crossoverChartStructureSchema = z
  .strictObject({
    twa_axis: ascendingAxis('twa_axis', MAX_TWA),
    tws_axis: ascendingAxis('tws_axis'),
    /**
     * One row per TWA, one cell per TWS, each cell the number of a sail definition.
     *
     * A whole number because it is an identifier: `2.5` identifies nothing. Zero is legal — qtVlm
     * documents no meaning for it, so it is the id `0` if a definition claims it and a dangling
     * reference if none does, which the check below decides.
     */
    cells: z
      .array(
        z.array(
          z
            .number()
            .int('a cell holds a whole number: the one its sail definition is numbered with')
            .nonnegative('a sail number cannot be negative')
        )
      )
      .min(1, 'cells must carry at least one angle row'),
    sail_definitions: z
      .array(sailDefinitionSchema)
      .min(1, 'a chart needs at least one sail definition for its cells to resolve against'),
    /**
     * Where both halves came from. Required, because a payload that does not say which formats and
     * which header token it was read from cannot be checked against the files again — and because
     * the definitions half's filename and hash exist nowhere else.
     */
    source: z.strictObject({
      format: z.string().min(1, 'source.format must name the format the grid was read as'),
      header_token: z
        .string()
        .min(1, 'source.header_token must be the token the grid file actually carried'),
      definitions: z.strictObject({
        format: z
          .string()
          .min(1, 'source.definitions.format must name the format the definitions were read as'),
        filename: z
          .string()
          .min(1, "source.definitions.filename must be the definitions file's own name"),
        content_sha256: z
          .string()
          .regex(
            /^[0-9a-f]{64}$/,
            'source.definitions.content_sha256 must be the hex SHA-256 of the definitions file'
          ),
      }),
    }),
  })
  .check((ctx) => {
    const { twa_axis, tws_axis, cells, sail_definitions } = ctx.value

    if (cells.length !== twa_axis.length) {
      ctx.issues.push({
        code: 'custom',
        input: cells,
        path: ['cells'],
        message: `cells has ${cells.length} rows for ${twa_axis.length} angles`,
      })
    }

    for (const [index, row] of cells.entries()) {
      if (row.length !== tws_axis.length) {
        ctx.issues.push({
          code: 'custom',
          input: row,
          path: ['cells', index],
          message: `cells row ${index} has ${row.length} sails for ${tws_axis.length} wind speeds`,
        })
      }
    }

    const definedOn = new Map<number, number>()
    for (const [index, definition] of sail_definitions.entries()) {
      const first = definedOn.get(definition.number)

      if (first === undefined) {
        definedOn.set(definition.number, index)
      } else {
        ctx.issues.push({
          code: 'custom',
          input: definition,
          path: ['sail_definitions', index, 'number'],
          message: `sail ${definition.number} is defined twice, at ${first} and ${index}; a cell holding it would resolve to both`,
        })
      }
    }

    // Reported once per number rather than once per cell: a chart missing sail 7 is one mistake,
    // and 55 copies of it would bury everything else the admin needs to read.
    const dangling = new Map<number, [number, number]>()
    for (const [rowIndex, row] of cells.entries()) {
      for (const [columnIndex, sail] of row.entries()) {
        if (definedOn.has(sail) || dangling.has(sail)) continue
        dangling.set(sail, [rowIndex, columnIndex])
      }
    }

    for (const [sail, [rowIndex, columnIndex]] of dangling) {
      ctx.issues.push({
        code: 'custom',
        input: sail,
        path: ['cells', rowIndex, columnIndex],
        message: `the grid calls for sail ${sail}, which no definition defines: there is no sail to name in that box. Angle ${twa_axis[rowIndex] ?? '?'}, ${tws_axis[columnIndex] ?? '?'} knots.`,
      })
    }
  })

/**
 * The structure, plus the one rule that is Layline's own: no superseded sail name gets written.
 *
 * This is the gate every write goes through, and only writes. The corrections are a table that may
 * grow, and a payload already in the archive was authored against the table as it stood — so the
 * reader is given the structure alone, and a stored Version stays readable when a name policy
 * tightens.
 */
export const crossoverChartPayloadSchema = crossoverChartStructureSchema.check((ctx) => {
  for (const [index, definition] of ctx.value.sail_definitions.entries()) {
    for (const renamed of RENAMED_SAILS) {
      const found = definition.label.match(renamed.was)
      if (found === null) continue

      ctx.issues.push({
        code: 'custom',
        input: definition.label,
        path: ['sail_definitions', index, 'label'],
        message: `${JSON.stringify(definition.label)} uses the superseded name ${JSON.stringify(found[0])}; that sail is the ${renamed.now}, so this definition is ${JSON.stringify(definition.label.replace(renamed.was, renamed.now))}. Correct it in the file and upload again — Layline will not rewrite what you gave it.`,
      })
    }
  }
})

/**
 * A payload that has passed the schema. Identical in shape to `CrossoverChartPayload` except that
 * `source` is no longer optional, which is what the schema adds.
 */
export type ValidCrossoverChartPayload = z.infer<typeof crossoverChartPayloadSchema>

// The two spellings of the payload must stay one shape: `types/index.ts` is what the rest of the
// app reads, and this schema is what the write gate enforces.
const _assignable: CrossoverChartPayload = {} as ValidCrossoverChartPayload
void _assignable

export type CrossoverChartPayloadValidation =
  | { ok: true; payload: ValidCrossoverChartPayload }
  | { ok: false; issues: string[] }

/**
 * Validate a payload for writing, reporting every problem rather than only the first.
 *
 * Each issue is rendered as `path: message`, because "the grid calls for sail 7, which no
 * definition defines" is a fixable complaint and "invalid payload" is not.
 */
export function validateCrossoverChartPayload(payload: unknown): CrossoverChartPayloadValidation {
  return report(crossoverChartPayloadSchema.safeParse(payload))
}

/**
 * Validate a payload that has already been written: is it still a chart that can be drawn?
 *
 * The reader's gate, and deliberately the smaller one. The naming policy is not asked of a Version
 * the archive already holds — see the note at the top of this file.
 */
export function validateCrossoverChartStructure(payload: unknown): CrossoverChartPayloadValidation {
  return report(crossoverChartStructureSchema.safeParse(payload))
}

function report(
  result: z.ZodSafeParseResult<ValidCrossoverChartPayload>
): CrossoverChartPayloadValidation {
  if (result.success) return { ok: true, payload: result.data }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path === '' ? issue.message : `${path}: ${issue.message}`
    }),
  }
}

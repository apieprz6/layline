/**
 * Parse the definitions half of a **Crossover Chart** — a `.saildesc`, or the `.saildef` the
 * boat's own copy is misnamed — into the `sail_definitions` a `CrossoverChartPayload` holds.
 *
 * The format is two fields per line: `number;label`. qtVlm documents it in one sentence (p. 33,
 * *"The first file affects a number to each sail's configuration"*) and one rule: *"In both cases
 * separation is the semi-column."* So unlike the grid parsers, this one does **not** sniff its
 * delimiter. There is no corpus of exporters to accommodate — the delimiter is stated, and
 * sniffing would let a tab or a comma inside a free-text label redefine the file's structure.
 *
 * The number is qtVlm's external id for one Sail Configuration and is what the grid's cells hold.
 * It is stored as given: nothing here renumbers, sorts, or requires the numbers to start at 1 or
 * to be contiguous. The documentation demands none of that, and a Layline that renumbered them
 * would break the correspondence with the grid file sitting next to it.
 *
 * The label is free text and is kept as written. `docs/research/orc-polar-file-formats.md`
 * establishes that there is nothing in it to parse — the manual's own example is French
 * (`GV + Assym`), the boat's is English (`Main + A2`), the two share no token, and the `+` is a
 * human convention rather than syntax. So this parser reads a label; the payload gate is what has
 * an opinion about the *names in* it, and it refuses a legacy spelling rather than rewriting one.
 *
 * That document also sets the temperature: *"be strict with the polar; be permissive and
 * constructive with the sail files."* The refusals below are therefore only the things that would
 * leave the definitions unusable as a lookup — a number that identifies nothing, two definitions
 * claiming one number, a label that the format cannot represent — and each one names what to fix.
 */

import { GridWarnings, readGridLines } from '@/services/boat/delimitedGrid'
import type {
  CrossoverDefinitionsParseOutcome,
  CrossoverDefinitionsParseRefusal,
  CrossoverDefinitionsParseWarningCode,
  CrossoverSailDefinition,
} from '@/types'

/** The format label recorded in `payload.source.definitions.format`. */
export const CROSSOVER_DEFINITIONS_FORMAT = 'qtvlm-saildesc'

/** The one delimiter the documentation permits. */
const DELIMITER = ';'

/**
 * A megabyte, as for the grid. The boat's own definitions are eight lines, and qtVlm's own
 * example is eight, so anything approaching this is not a list of sail configurations.
 */
const MAX_CHARACTERS = 1_048_576

/** A whole number, with no decimal part at all — which is what a sail id is. */
const WHOLE_NUMBER = /^[+-]?\d+$/

export function parseCrossoverDefinitionsFile(contents: string): CrossoverDefinitionsParseOutcome {
  const warnings = new GridWarnings<CrossoverDefinitionsParseWarningCode>()

  function refuse(
    reason: CrossoverDefinitionsParseRefusal,
    message: string,
    line?: number
  ): CrossoverDefinitionsParseOutcome {
    return { ok: false, reason, message, ...(line === undefined ? {} : { line }) }
  }

  if (contents.length > MAX_CHARACTERS) {
    return refuse(
      'too-large',
      `a list of sail configurations is a few lines; this file is ${Math.round(contents.length / 1024)} KB`
    )
  }

  const content = readGridLines(contents, warnings)

  const definitions: CrossoverSailDefinition[] = []
  const seen = new Map<number, number>()

  for (const row of content) {
    const fields = row.text.split(DELIMITER)

    if (fields.length === 1) {
      return refuse(
        'no-delimiter',
        `this line has no ${JSON.stringify(DELIMITER)} on it, so it is neither a number nor a label: ${JSON.stringify(row.text.trim().slice(0, 60))}`,
        row.line
      )
    }

    if (fields.length > 2) {
      // Split on the first delimiter only would keep `Main + Jib 1` and drop ` heavy`, which is
      // overwriting what the source gave us. The delimiter is the only structure this format has,
      // so a label containing one cannot be stored — the admin has to rename the configuration.
      return refuse(
        'delimiter-in-label',
        `this label contains a ${JSON.stringify(DELIMITER)}, which the format uses to separate the number from the label; rename the configuration without one`,
        row.line
      )
    }

    const rawNumber = fields[0].trim()
    const rawLabel = fields[1]

    if (!WHOLE_NUMBER.test(rawNumber)) {
      return refuse(
        'not-an-integer',
        `${JSON.stringify(rawNumber)} is not a sail number; each line begins with the whole number the chart's cells hold`,
        row.line
      )
    }

    const number = Number(rawNumber)

    if (number < 0) {
      return refuse('value-out-of-range', `a sail number cannot be negative: ${number}`, row.line)
    }

    const firstSeenOn = seen.get(number)
    if (firstSeenOn !== undefined) {
      return refuse(
        'duplicate-number',
        `sail number ${number} is defined twice, on line ${firstSeenOn} and here; a cell holding it would resolve to both`,
        row.line
      )
    }

    const label = rawLabel.trim()

    if (label === '') {
      return refuse(
        'empty-label',
        `sail number ${number} has no label; a number with no name tells the sailor nothing`,
        row.line
      )
    }

    if (label !== rawLabel) {
      warnings.once('label-whitespace-trimmed', row.line, label)
    }

    const previous = definitions.at(-1)
    if (previous !== undefined && number <= previous.number) {
      // Kept in the file's own order either way: the numbers are ids, nothing reads them in
      // sequence, and reordering them would be a correction nobody asked for.
      warnings.once('numbers-not-ascending', row.line, `${previous.number} then ${number}`)
    }

    seen.set(number, row.line)
    definitions.push({ number, label })
  }

  if (definitions.length === 0) {
    return refuse(
      'no-definitions',
      'this file defines no sail configurations, so the chart has nothing to resolve its cells against'
    )
  }

  return { ok: true, definitions, warnings: warnings.all() }
}

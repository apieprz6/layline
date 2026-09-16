import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCrossoverGridFile } from '@/services/boat/crossoverGridFile'
import type { CrossoverGridParseWarningCode } from '@/types'

/**
 * Parsing a **Crossover Chart** grid (`.sailselect`).
 *
 * The format is surveyed in `docs/research/orc-polar-file-formats.md`. Every expectation below is
 * either quoted from qtVlm's own documented example — vendored as a fixture for the reason
 * `docs/research/fixtures/README.md` gives — or from a rule that document records with a
 * `[DOCUMENTED]` tag.
 *
 * The grid shares its whole text-level shape with a `.pol`, so the tolerances are the polar's and
 * are tested here only where reading a *sail id* differs from reading a *boat speed*.
 */

const FIXTURES = join(process.cwd(), 'docs/research/fixtures')

/** qtVlm manual p. 33, verbatim: `TWA/TWS`, semicolon, LF, 9 × 7. */
const DOC_EXAMPLE = readFileSync(join(FIXTURES, 'qtvlm-doc-example.sailselect'), 'utf8')

function codes(warnings: readonly { code: CrossoverGridParseWarningCode }[]): string[] {
  return warnings.map((warning) => warning.code)
}

describe('parseCrossoverGridFile', () => {
  describe("qtVlm's own documented example", () => {
    it('reads both axes exactly as the file gives them, irregular steps and all', () => {
      const result = parseCrossoverGridFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // p. 33 verbatim. The 25 breakpoint sits between 20 and 30 on purpose, and the angle axis
      // jumps 40 to 80: "the steps between TWAs and TWs is free of constraints" (p. 38).
      expect(result.grid.tws_axis).toEqual([8, 12, 16, 20, 25, 30, 32])
      expect(result.grid.twa_axis).toEqual([40, 80, 100, 110, 120, 130, 140, 150, 180])
    })

    it('reads one row per angle and one cell per wind speed', () => {
      const result = parseCrossoverGridFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.cells).toHaveLength(9)
      expect(result.grid.cells.every((row) => row.length === 7)).toBe(true)
      expect(result.grid.cells[0]).toEqual([1, 1, 2, 3, 3, 4, 5])
      expect(result.grid.cells.at(-1)).toEqual([8, 8, 8, 8, 8, 7, 3])
    })

    it('keeps a non-monotonic row as it stands, because a sail id is not a magnitude', () => {
      const result = parseCrossoverGridFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // Row 80 of the manual's own example. Sail 6 gives way to sail 2 as it blows on: a downwind
      // sail replaced by an upwind jib, which reads as "backwards" only if the number is mistaken
      // for a size. 15 of the 26 rows of the boat's own chart do the same.
      expect(result.grid.cells[1]).toEqual([6, 6, 6, 2, 2, 4, 5])
    })

    it('records the header token verbatim', () => {
      const result = parseCrossoverGridFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.header_token).toBe('TWA/TWS')
    })

    it('has nothing to warn about: the documented example is clean', () => {
      const result = parseCrossoverGridFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.warnings).toEqual([])
    })
  })

  describe('the tolerances it shares with a polar', () => {
    it('reads the backslash header token, TAB delimiter, CRLF and a trailing delimiter', () => {
      const contents = 'TWA\\TWS\t8\t12\t\r\n40\t1\t2\t\r\n80\t3\t4\t\r\n'

      const result = parseCrossoverGridFile(contents)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.tws_axis).toEqual([8, 12])
      expect(result.grid.cells).toEqual([
        [1, 2],
        [3, 4],
      ])
      expect(result.grid.header_token).toBe('TWA\\TWS')
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining(['crlf-line-endings', 'trailing-empty-field'])
      )
    })

    it('strips a byte-order mark and says so', () => {
      const result = parseCrossoverGridFile(`﻿${DOC_EXAMPLE}`)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.twa_axis[0]).toBe(40)
      expect(codes(result.warnings)).toContain('bom-stripped')
    })

    it('skips blank and comment lines and reports each one', () => {
      const contents = ['# our 2026 chart', 'TWA/TWS;8;12', '', '40;1;2', '80;3;4'].join('\n')

      const result = parseCrossoverGridFile(contents)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.twa_axis).toEqual([40, 80])
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining(['comment-line-skipped', 'blank-line-skipped'])
      )
    })

    it('skips one free-text line before the header and reports it', () => {
      const contents = ['Handsome Pete 2026', 'TWA/TWS;8;12', '40;1;2'].join('\n')

      const result = parseCrossoverGridFile(contents)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.twa_axis).toEqual([40])
      expect(codes(result.warnings)).toContain('description-line-skipped')
    })

    it('reports a bare TWA header and keeps the token', () => {
      const result = parseCrossoverGridFile('TWA;8;12\n40;1;2')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.header_token).toBe('TWA')
      expect(codes(result.warnings)).toContain('bare-twa-header')
    })

    it('reports an unrecognised header token and keeps it verbatim', () => {
      const result = parseCrossoverGridFile('Angle/Vent;8;12\n40;1;2')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.grid.header_token).toBe('Angle/Vent')
      expect(codes(result.warnings)).toContain('unexpected-header-token')
    })
  })

  describe('reading a sail id rather than a boat speed', () => {
    it('refuses a cell with a decimal part, which identifies no configuration', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;1;2.5')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('not-an-integer')
      expect(result.line).toBe(2)
    })

    it('refuses a negative cell', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;1;-2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('value-out-of-range')
      expect(result.line).toBe(2)
    })

    it('accepts a zero cell without inventing a meaning for it', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;0;2')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // qtVlm documents no meaning for `0`, so it is read as the id `0` and nothing more. Whether
      // it resolves is the payload gate's question, not this parser's.
      expect(result.grid.cells).toEqual([[0, 2]])
    })

    it('does not read a decimal comma as a decimal point', () => {
      // Under a semicolon delimiter `1,5` would be a decimal comma in a polar. A sail id has no
      // decimals, so there is nothing to normalise and the value is simply not a whole number.
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;1;1,5')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('not-an-integer')
    })

    it('refuses a cell that is not a number at all', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;1;Main + A2')

      if (result.ok) throw new Error('expected a refusal')

      // A transposed Expedition sail chart holds names rather than ids, and this is where one
      // would be caught.
      expect(result.reason).toBe('not-a-number')
    })

    it('refuses an empty cell, which the format prohibits', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n40;1;')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('empty-cell')
      expect(result.line).toBe(2)
    })
  })

  describe('refusals about the grid itself', () => {
    it('refuses a row that is not the header width', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12;16\n40;1;2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('row-width-mismatch')
      expect(result.message).toContain('3')
    })

    it('refuses a wind speed axis that does not ascend', () => {
      const result = parseCrossoverGridFile('TWA/TWS;12;8\n40;1;2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('axis-not-ascending')
    })

    it('refuses an angle axis that does not ascend', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n80;1;2\n40;3;4')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('axis-not-ascending')
      expect(result.line).toBe(3)
    })

    it('refuses an angle outside 0 to 180', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n190;1;2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('value-out-of-range')
    })

    it('refuses a header with no wind speeds on it', () => {
      const result = parseCrossoverGridFile('TWA/TWS\n40')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('no-header')
    })

    it('refuses a header with no angle rows under it', () => {
      const result = parseCrossoverGridFile('TWA/TWS;8;12\n')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('too-few-lines')
    })

    it('refuses a file too large to be a sail chart', () => {
      const result = parseCrossoverGridFile('x'.repeat(1_048_577))

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('too-large')
    })
  })
})

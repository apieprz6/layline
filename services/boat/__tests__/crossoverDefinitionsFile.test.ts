import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCrossoverDefinitionsFile } from '@/services/boat/crossoverDefinitionsFile'
import type { CrossoverDefinitionsParseWarningCode } from '@/types'

/**
 * Parsing a **Sail Definitions** file (`.saildesc`, or `.saildef` as the boat's own copy is
 * misnamed).
 *
 * Two lines of `docs/research/orc-polar-file-formats.md` set the temperature of this parser:
 * *"In both cases separation is the semi-column"* (qtVlm p. 33, so the delimiter is not sniffed),
 * and *"be strict with the polar; be permissive and constructive with the sail files"*. So the
 * refusals here are only the things that would leave the definitions unusable as a lookup, and
 * every one of them names what the admin should change.
 */

const FIXTURES = join(process.cwd(), 'docs/research/fixtures')

/** qtVlm manual p. 33, verbatim: eight numbered French sail configurations. */
const DOC_EXAMPLE = readFileSync(join(FIXTURES, 'qtvlm-doc-example.saildesc'), 'utf8')

function codes(warnings: readonly { code: CrossoverDefinitionsParseWarningCode }[]): string[] {
  return warnings.map((warning) => warning.code)
}

describe('parseCrossoverDefinitionsFile', () => {
  describe("qtVlm's own documented example", () => {
    it('reads every definition in the order the file gives them', () => {
      const result = parseCrossoverDefinitionsFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions).toEqual([
        { number: 1, label: 'GV + Genois' },
        { number: 2, label: 'GV + Inter' },
        { number: 3, label: '1ris + Inter' },
        { number: 4, label: '2ris + Foc' },
        { number: 5, label: '3ris + Foc' },
        { number: 6, label: 'GV + Leger' },
        { number: 7, label: 'GV + Assym' },
        { number: 8, label: 'GV + Sym' },
      ])
    })

    it('has nothing to warn about', () => {
      const result = parseCrossoverDefinitionsFile(DOC_EXAMPLE)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.warnings).toEqual([])
    })
  })

  describe('the label', () => {
    it('keeps free text exactly as written, in whatever language', () => {
      const result = parseCrossoverDefinitionsFile('1;Grand-voile haute + Génois léger')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // There is nothing in a label to parse: the `+` is a human convention and not syntax, and
      // no two boats share a vocabulary.
      expect(result.definitions[0].label).toBe('Grand-voile haute + Génois léger')
    })

    it('splits on the first delimiter only, so a label cannot be truncated silently', () => {
      const result = parseCrossoverDefinitionsFile('1;Main + Jib 1; heavy')

      if (result.ok) throw new Error('expected a refusal')

      // Keeping `Main + Jib 1` and dropping ` heavy` would be overwriting what the source gave us.
      // The delimiter is the only structure the format has, so this label cannot be represented.
      expect(result.reason).toBe('delimiter-in-label')
      expect(result.line).toBe(1)
    })

    it('trims surrounding whitespace and says that it did', () => {
      const result = parseCrossoverDefinitionsFile('1;  Main + Jib 1  ')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions[0].label).toBe('Main + Jib 1')
      expect(codes(result.warnings)).toContain('label-whitespace-trimmed')
    })

    it('refuses a number with no label', () => {
      const result = parseCrossoverDefinitionsFile('1;Main + Jib 1\n2;')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('empty-label')
      expect(result.line).toBe(2)
    })
  })

  describe('the number', () => {
    it('refuses a number with a decimal part', () => {
      const result = parseCrossoverDefinitionsFile('1.5;Main + Jib 1')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('not-an-integer')
    })

    it('refuses something that is not a number at all', () => {
      const result = parseCrossoverDefinitionsFile('main;Main + Jib 1')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('not-an-integer')
    })

    it('refuses a negative number', () => {
      const result = parseCrossoverDefinitionsFile('-1;Main + Jib 1')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('value-out-of-range')
    })

    it('accepts zero, since the format nowhere reserves it', () => {
      const result = parseCrossoverDefinitionsFile('0;No sail up')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions).toEqual([{ number: 0, label: 'No sail up' }])
    })

    it('refuses two definitions claiming the same number', () => {
      const result = parseCrossoverDefinitionsFile('1;Main + Jib 1\n2;Main + Jib 2\n1;Main + A2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('duplicate-number')
      expect(result.line).toBe(3)
      expect(result.message).toContain('1')
    })

    it('accepts numbers that are neither contiguous nor starting at one', () => {
      const result = parseCrossoverDefinitionsFile('4;Main + Jib 2\n9;Main + A2')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // Nothing in qtVlm's documentation requires contiguity, and the number is an external id
      // rather than a Layline key, so renumbering it would be a correction nobody asked for.
      expect(result.definitions.map((definition) => definition.number)).toEqual([4, 9])
    })

    it('keeps out-of-order numbers in the file order and reports the oddity', () => {
      const result = parseCrossoverDefinitionsFile('8;Main + A2\n1;Main + Jib 1')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions.map((definition) => definition.number)).toEqual([8, 1])
      expect(codes(result.warnings)).toContain('numbers-not-ascending')
    })
  })

  describe('the file', () => {
    it('refuses a line with no delimiter, which is neither a number nor a label', () => {
      const result = parseCrossoverDefinitionsFile('1;Main + Jib 1\nMain + A2')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('no-delimiter')
      expect(result.line).toBe(2)
    })

    it('refuses a file with no definitions in it', () => {
      const result = parseCrossoverDefinitionsFile('# our sails\n\n')

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('no-definitions')
    })

    it('skips blank and comment lines and reports each one', () => {
      const contents = ['# 2026 inventory', '1;Main + Jib 1', '', '2;Main + A2'].join('\n')

      const result = parseCrossoverDefinitionsFile(contents)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions).toHaveLength(2)
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining(['comment-line-skipped', 'blank-line-skipped'])
      )
    })

    it('strips a byte-order mark and normalises CRLF, reporting both', () => {
      const result = parseCrossoverDefinitionsFile('﻿1;Main + Jib 1\r\n2;Main + A2\r\n')

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.definitions).toEqual([
        { number: 1, label: 'Main + Jib 1' },
        { number: 2, label: 'Main + A2' },
      ])
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining(['bom-stripped', 'crlf-line-endings'])
      )
    })

    it('refuses a file too large to be a list of sail configurations', () => {
      const result = parseCrossoverDefinitionsFile('x'.repeat(1_048_577))

      if (result.ok) throw new Error('expected a refusal')

      expect(result.reason).toBe('too-large')
    })
  })
})

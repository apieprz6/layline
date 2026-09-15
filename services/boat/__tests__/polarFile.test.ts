import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePolarFile } from '@/services/boat/polarFile'
import type { PolarPayload } from '@/types'

/**
 * Parsing a **Polar** file.
 *
 * The format is specified in `docs/research/orc-polar-file-formats.md`, which is also
 * where every expected figure below comes from — either quoted from that document or
 * read out of one of the two real fixtures. Nothing here recomputes an expectation the
 * way the parser does.
 *
 * Two real files carry most of the weight, for the reason
 * `docs/research/fixtures/README.md` gives: a fixture we author can only encode what we
 * already believe about the format.
 */

const FIXTURES = join(process.cwd(), 'docs/research/fixtures')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

/** The ORC-derived form: lowercase `twa/tws`, semicolon, LF. */
const ORC_10R = fixture('orc-first-10r.pol')

/** The qtVlm library form: `TWA\TWS`, TAB, CRLF, and a trailing delimiter per line. */
const CLASS40 = fixture('qtvlm-library-class40.pol')

describe('parsePolarFile', () => {
  describe('the ORC-derived form (semicolon, lowercase twa/tws, LF)', () => {
    it('reads the certificate axes exactly as the file gives them', () => {
      const result = parsePolarFile(ORC_10R)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // ORC Rating Systems 2026: nine wind speeds, eight true wind angles.
      expect(result.payload.tws_axis).toEqual([4, 6, 8, 10, 12, 14, 16, 20, 24])
      expect(result.payload.twa_axis).toEqual([52, 60, 75, 90, 110, 120, 135, 150])
    })

    it('reads boat speed in knots, one row per angle and one cell per wind speed', () => {
      const result = parsePolarFile(ORC_10R)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.payload.boat_speed).toHaveLength(8)
      expect(result.payload.boat_speed.every((row) => row.length === 9)).toBe(true)
      // Row 52 of the fixture, verbatim: 3600/R52 for certificate US61013.
      expect(result.payload.boat_speed[0]).toEqual([
        3.96, 5.39, 6.29, 6.78, 7.01, 7.11, 7.16, 7.21, 7.19,
      ])
    })

    it('records the format and the header token it actually found', () => {
      const result = parsePolarFile(ORC_10R)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // The token is `jieter/orc-data`'s exporter signature, and is kept in the case
      // the file used rather than in either case the qtVlm manual prints.
      expect(result.payload.source).toEqual({ format: 'orc-pol', header_token: 'twa/tws' })
    })

    it('parses cleanly, with nothing to warn about', () => {
      const result = parsePolarFile(ORC_10R)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.warnings).toEqual([])
    })
  })

  describe('the qtVlm library form (TAB, TWA\\TWS, CRLF, trailing delimiter)', () => {
    it('sniffs TAB rather than trusting the .pol extension to mean anything', () => {
      const result = parsePolarFile(CLASS40)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      expect(result.payload.tws_axis).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])
      expect(result.payload.twa_axis).toHaveLength(37)
      expect(result.payload.twa_axis[0]).toBe(0)
      expect(result.payload.twa_axis.at(-1)).toBe(180)
    })

    it('keeps the TWA 0 row and the TWS 0 column the file supplied', () => {
      const result = parsePolarFile(CLASS40)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // Padding is a lookup-time concern. A row of zeros the file supplied is data.
      expect(result.payload.boat_speed[0]).toEqual(new Array(13).fill(0))
      expect(result.payload.boat_speed.every((row) => row[0] === 0)).toBe(true)
      // Row 5, verbatim from the fixture.
      expect(result.payload.boat_speed[1]).toEqual([
        0, 0.53, 0.91, 0.99, 1.03, 1.02, 0.86, 0.68, 0.48, 0.24, 0, 0, 0,
      ])
    })

    it('warns about the line endings and the trailing delimiter rather than failing', () => {
      const result = parsePolarFile(CLASS40)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      const codes = result.warnings.map((warning) => warning.code)
      expect(codes).toContain('crlf-line-endings')
      expect(codes).toContain('trailing-empty-field')
    })

    it('reports one trailing delimiter for the file, not one per line', () => {
      const result = parsePolarFile(CLASS40)

      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)

      // Every one of the file's 38 lines ends in a tab. That is one fact about the file, and
      // 38 copies of it would bury the warnings that are about single lines.
      const trailing = result.warnings.filter((warning) => warning.code === 'trailing-empty-field')
      expect(trailing).toHaveLength(1)
    })
  })

  describe('what it tolerates, having said so', () => {
    /** The ORC form, rewritten with whatever oddity a case is about. */
    const grid = ['twa/tws;4;6', '52;3.96;5.39', '60;4.25;5.66'].join('\n')

    function parsed(contents: string): { warnings: string[]; payload: PolarPayload } {
      const result = parsePolarFile(contents)
      if (!result.ok) throw new Error(`expected a parse, got: ${result.message}`)
      return {
        warnings: result.warnings.map((warning) => warning.code),
        payload: result.payload,
      }
    }

    it('strips a byte-order mark', () => {
      const { warnings, payload } = parsed(`﻿${grid}`)

      expect(warnings).toContain('bom-stripped')
      // The BOM is not left glued to the token, where it would make every header unrecognised.
      expect(payload.source?.header_token).toBe('twa/tws')
    })

    it('skips blank lines inside the grid', () => {
      const { warnings, payload } = parsed('twa/tws;4;6\n\n52;3.96;5.39\n\n60;4.25;5.66\n')

      expect(warnings.filter((code) => code === 'blank-line-skipped')).toHaveLength(2)
      expect(payload.twa_axis).toEqual([52, 60])
    })

    it('does not call a file ending in a newline odd', () => {
      expect(parsed(`${grid}\n`).warnings).toEqual([])
    })

    it('skips comment lines', () => {
      const { warnings, payload } = parsed(`# Beneteau FIRST 10R\n${grid}\n! generated\n`)

      expect(warnings.filter((code) => code === 'comment-line-skipped')).toHaveLength(2)
      expect(payload.twa_axis).toEqual([52, 60])
    })

    it('skips one free-text line before the header', () => {
      const { warnings, payload } = parsed(`JAVELIN US61013\n${grid}`)

      expect(warnings).toContain('description-line-skipped')
      expect(payload.tws_axis).toEqual([4, 6])
    })

    it('accepts a bare TWA header, saying which it found', () => {
      const { warnings, payload } = parsed('TWA;4;6\n52;3.96;5.39\n60;4.25;5.66')

      expect(warnings).toContain('bare-twa-header')
      expect(payload.source).toEqual({ format: 'orc-pol', header_token: 'TWA' })
    })

    it('keeps an unrecognised header token rather than refusing or rewriting it', () => {
      const { warnings, payload } = parsed('Angle;4;6\n52;3.96;5.39\n60;4.25;5.66')

      expect(warnings).toContain('unexpected-header-token')
      expect(payload.source?.header_token).toBe('Angle')
    })

    it('reads decimal commas when the delimiter is a semicolon', () => {
      const { warnings, payload } = parsed('twa/tws;4;6\n52;3,96;5,39\n60;4,25;5,66')

      expect(warnings).toContain('decimal-comma-normalised')
      expect(payload.boat_speed[0]).toEqual([3.96, 5.39])
    })

    it('refuses to read a comma as a decimal point when a comma is the delimiter', () => {
      // `52,3,96,5,39` is five fields under a comma delimiter, and reading it any other way
      // would invent a grid the file does not have.
      const result = parsePolarFile('twa/tws,4,6\n52,3,96,5,39')

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('row-width-mismatch')
    })

    it('reads a space-delimited file', () => {
      const { payload } = parsed('twa/tws 4 6\n52 3.96 5.39\n60 4.25 5.66')

      expect(payload.tws_axis).toEqual([4, 6])
      expect(payload.boat_speed).toEqual([
        [3.96, 5.39],
        [4.25, 5.66],
      ])
    })
  })

  describe('what it refuses, and where', () => {
    function refusal(contents: string): { reason: string; line?: number; message: string } {
      const result = parsePolarFile(contents)
      if (result.ok) throw new Error('expected a refusal, got a parse')
      return { reason: result.reason, line: result.line, message: result.message }
    }

    it('refuses an empty file', () => {
      expect(refusal('').reason).toBe('too-few-lines')
      expect(refusal('   \n\n').reason).toBe('too-few-lines')
    })

    it('refuses a header with no wind speeds', () => {
      expect(refusal('twa/tws\n52\n60').reason).toBe('no-header')
    })

    it('refuses a row that is not the header width, naming its line', () => {
      const { reason, line } = refusal('twa/tws;4;6\n52;3.96;5.39\n60;4.25')

      expect(reason).toBe('row-width-mismatch')
      expect(line).toBe(3)
    })

    it('refuses an empty cell rather than reading it as zero', () => {
      // Zero is a real boat speed — the qtVlm library files are full of them — so an empty
      // cell cannot be filled in without inventing a measurement.
      const { reason, line } = refusal('twa/tws;4;6\n52;3.96;\n60;4.25;5.66')

      expect(reason).toBe('empty-cell')
      expect(line).toBe(2)
    })

    it('refuses a non-numeric cell', () => {
      expect(refusal('twa/tws;4;6\n52;3.96;fast').reason).toBe('not-a-number')
    })

    it('refuses an axis that repeats or goes backwards instead of truncating there', () => {
      // qtVlm reads this file and silently drops everything from the fault onwards.
      const backwards = refusal('twa/tws;4;6\n52;3.96;5.39\n40;4.25;5.66')
      expect(backwards.reason).toBe('axis-not-ascending')
      expect(backwards.line).toBe(3)

      const repeated = refusal('twa/tws;4;6\n52;3.96;5.39\n52;4.25;5.66')
      expect(repeated.reason).toBe('axis-not-ascending')

      const wind = refusal('twa/tws;6;4\n52;3.96;5.39')
      expect(wind.reason).toBe('axis-not-ascending')
      expect(wind.line).toBe(1)
    })

    it('refuses an angle outside 0 to 180', () => {
      expect(refusal('twa/tws;4;6\n190;3.96;5.39').reason).toBe('value-out-of-range')
      expect(refusal('twa/tws;4;6\n-5;3.96;5.39').reason).toBe('value-out-of-range')
    })

    it('refuses a negative wind speed or boat speed', () => {
      expect(refusal('twa/tws;-4;6\n52;3.96;5.39').reason).toBe('value-out-of-range')
      expect(refusal('twa/tws;4;6\n52;-3.96;5.39').reason).toBe('value-out-of-range')
    })

    it('refuses a grid past any plausible size', () => {
      const speeds = Array.from({ length: 201 }, (_, index) => index)
      const wide = `twa/tws;${speeds.join(';')}\n52;${speeds.map(() => '5').join(';')}`
      expect(refusal(wide).reason).toBe('grid-too-large')

      const tall = [
        'twa/tws;4;6',
        ...Array.from({ length: 182 }, (_, index) => `${index / 2};5;5`),
      ].join('\n')
      expect(refusal(tall).reason).toBe('grid-too-large')
    })

    it('refuses a file larger than any polar is', () => {
      const { reason, message } = refusal(`twa/tws;4;6\n${'52;3.96;5.39\n'.repeat(100_000)}`)

      expect(reason).toBe('too-large')
      // The admin is told what it saw, not just that it said no.
      expect(message).toMatch(/KB/)
    })
  })
})

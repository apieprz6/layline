import {
  validateCrossoverChartPayload,
  validateCrossoverChartStructure,
} from '@/services/boat/crossoverPayload'
import type { CrossoverChartPayload } from '@/types'

/**
 * The gate on a **Crossover Chart** payload.
 *
 * This is where "Zod enforces what SQL cannot reach" is tested. `boat_setup_versions`'
 * `payload_keys_present` check can see that a crossover payload carries `twa_axis`, `tws_axis`,
 * `cells` and `sail_definitions`; it cannot see that the rows are the width of the wind speed axis
 * or that every cell resolves to a definition. Those live here, and so does the one rule that is
 * about Layline's vocabulary rather than about the file: no legacy sail spelling gets in.
 *
 * That last rule is the one difference between the two gates the module exports, and the last
 * `describe` here is about the difference: the write gate refuses a legacy spelling, and the
 * reader's structural gate hands back a Version recorded before the refusal existed.
 *
 * The grid below is qtVlm's documented example (p. 33) trimmed to a shape a reader can check by
 * eye. The definitions are Layline's own, because the vocabulary rule is about Layline's names.
 */

const SOURCE = {
  format: 'qtvlm-sailselect',
  header_token: 'TWA/TWS',
  definitions: {
    format: 'qtvlm-saildesc',
    filename: 'HandsomePete_2026.saildef',
    content_sha256: 'a'.repeat(64),
  },
} as const

function payload(overrides: Partial<CrossoverChartPayload> = {}): CrossoverChartPayload {
  return {
    twa_axis: [40, 80, 120],
    tws_axis: [8, 12, 16],
    cells: [
      [1, 1, 2],
      [6, 6, 2],
      [8, 8, 6],
    ],
    sail_definitions: [
      { number: 1, label: 'Main + Jib 1' },
      { number: 2, label: 'Main + Jib 2' },
      { number: 6, label: 'Main + A3' },
      { number: 8, label: 'Main + A2' },
    ],
    source: SOURCE,
    ...overrides,
  }
}

function issuesOf(candidate: unknown): string[] {
  const result = validateCrossoverChartPayload(candidate)
  if (result.ok) throw new Error('expected the payload to be refused')
  return result.issues
}

describe('validateCrossoverChartPayload', () => {
  it('accepts a chart whose every cell resolves to a definition', () => {
    const result = validateCrossoverChartPayload(payload())

    expect(result).toEqual({ ok: true, payload: payload() })
  })

  describe('what SQL cannot reach', () => {
    it('refuses a cell that resolves to no definition, naming the number', () => {
      const issues = issuesOf(
        payload({
          cells: [
            [1, 1, 2],
            [6, 6, 2],
            [8, 8, 7],
          ],
        })
      )

      // A dangling reference is unrenderable: there is no sail to name in that box.
      expect(issues.join('\n')).toContain('7')
      expect(issues.join('\n')).toMatch(/no definition|not defined/i)
    })

    it('accepts a definition that no cell references', () => {
      // Sail 7 of the boat's own chart, `Reef + A3`, is defined and called for by zero cells. It
      // is an inventory entry the chart never recommends, which is a real state and not an error.
      const result = validateCrossoverChartPayload(
        payload({
          sail_definitions: [
            { number: 1, label: 'Main + Jib 1' },
            { number: 2, label: 'Main + Jib 2' },
            { number: 6, label: 'Main + A3' },
            { number: 7, label: 'Reef + A3' },
            { number: 8, label: 'Main + A2' },
          ],
        })
      )

      expect(result.ok).toBe(true)
    })

    it('refuses a cells array with the wrong number of rows', () => {
      const issues = issuesOf(payload({ cells: [[1, 1, 2]] }))

      expect(issues.join('\n')).toContain('1 rows for 3 angles')
    })

    it('refuses a row that is not the width of the wind speed axis', () => {
      const issues = issuesOf(
        payload({
          cells: [
            [1, 1, 2],
            [6, 6],
            [8, 8, 6],
          ],
        })
      )

      expect(issues.join('\n')).toContain('row 1 has 2 sails for 3 wind speeds')
    })

    it('refuses a cell that is not a whole number', () => {
      const issues = issuesOf(
        payload({
          cells: [
            [1, 1, 2.5],
            [6, 6, 2],
            [8, 8, 6],
          ],
        })
      )

      expect(issues.join('\n')).toMatch(/whole number|integer/i)
    })

    it('refuses a negative cell', () => {
      const issues = issuesOf(
        payload({
          cells: [
            [1, 1, -2],
            [6, 6, 2],
            [8, 8, 6],
          ],
        })
      )

      expect(issues).not.toHaveLength(0)
    })

    it('refuses two definitions claiming the same number', () => {
      const issues = issuesOf(
        payload({
          sail_definitions: [
            { number: 1, label: 'Main + Jib 1' },
            { number: 1, label: 'Main + Jib 2' },
            { number: 2, label: 'Main + Jib 2' },
            { number: 6, label: 'Main + A3' },
            { number: 8, label: 'Main + A2' },
          ],
        })
      )

      expect(issues.join('\n')).toMatch(/1 is defined twice|defined more than once/i)
    })

    it('refuses a chart with no definitions at all', () => {
      const issues = issuesOf(payload({ sail_definitions: [] }))

      expect(issues).not.toHaveLength(0)
    })

    it('refuses a definition with no label', () => {
      const issues = issuesOf(
        payload({
          sail_definitions: [
            { number: 1, label: 'Main + Jib 1' },
            { number: 2, label: '   ' },
            { number: 6, label: 'Main + A3' },
            { number: 8, label: 'Main + A2' },
          ],
        })
      )

      expect(issues).not.toHaveLength(0)
    })
  })

  describe("Layline's own sail vocabulary", () => {
    it('refuses a legacy sail name and names the correction', () => {
      const issues = issuesOf(
        payload({
          sail_definitions: [
            { number: 1, label: 'Main + Jib 1' },
            { number: 2, label: 'Main + Jib 2' },
            { number: 6, label: 'Main + Reaching Spin' },
            { number: 8, label: 'Main + A2' },
          ],
        })
      )

      // The message has to be actionable: the admin edits their own file, because Layline will not
      // edit it for them. Nothing outside this project reads these files, so v1 is authored with
      // the right names rather than recording a correction to a name Layline never used.
      expect(issues.join('\n')).toContain('Reaching Spin')
      expect(issues.join('\n')).toContain('A3')
      expect(issues.join('\n')).toContain('Main + A3')
    })

    it('refuses the legacy name however it is spelled', () => {
      for (const label of ['Reef + reaching spin', 'reef + Reaching-Spin', 'REEF + REACHING SPINNAKER']) {
        const issues = issuesOf(
          payload({
            sail_definitions: [
              { number: 1, label: 'Main + Jib 1' },
              { number: 2, label: 'Main + Jib 2' },
              { number: 6, label },
              { number: 8, label: 'Main + A2' },
            ],
          })
        )

        expect(issues.join('\n')).toContain('A3')
      }
    })

    it('accepts the corrected name', () => {
      const result = validateCrossoverChartPayload(
        payload({
          sail_definitions: [
            { number: 1, label: 'Main + Jib 1' },
            { number: 2, label: 'Main + Jib 2' },
            { number: 6, label: 'Main + A3' },
            { number: 8, label: 'Main + A2' },
          ],
        })
      )

      expect(result.ok).toBe(true)
    })

    it('leaves a label in another language alone', () => {
      // Labels are free text and qtVlm's own example is French. Only Layline's own superseded
      // names are refused; nothing else about a label is this schema's business.
      const result = validateCrossoverChartPayload(
        payload({
          sail_definitions: [
            { number: 1, label: 'GV + Genois' },
            { number: 2, label: 'GV + Inter' },
            { number: 6, label: 'GV + Leger' },
            { number: 8, label: 'GV + Sym' },
          ],
        })
      )

      expect(result.ok).toBe(true)
    })
  })

  describe('the axes and the shape', () => {
    it('refuses an angle axis that repeats a value', () => {
      const issues = issuesOf(payload({ twa_axis: [40, 40, 120] }))

      expect(issues.join('\n')).toMatch(/ascend/i)
    })

    it('refuses an angle past 180', () => {
      const issues = issuesOf(payload({ twa_axis: [40, 80, 190] }))

      expect(issues).not.toHaveLength(0)
    })

    it('refuses a wind speed axis that goes backwards', () => {
      const issues = issuesOf(payload({ tws_axis: [16, 12, 8] }))

      expect(issues.join('\n')).toMatch(/ascend/i)
    })
  })

  describe('the provenance', () => {
    it('requires a source, so the payload can be checked against the files again', () => {
      const { source: _source, ...withoutSource } = payload()

      expect(issuesOf(withoutSource)).not.toHaveLength(0)
    })

    it("requires the definitions half's own filename and hash", () => {
      // The grid file's filename and hash are columns on the Version. The definitions file has no
      // columns of its own, so its provenance lives in the payload beside the definitions.
      const issues = issuesOf(
        payload({
          source: {
            format: 'qtvlm-sailselect',
            header_token: 'TWA/TWS',
            definitions: { format: 'qtvlm-saildesc', filename: '', content_sha256: '' },
          },
        })
      )

      expect(issues).toHaveLength(2)
    })
  })

  it('refuses a key the schema does not know', () => {
    const issues = issuesOf({ ...payload(), boat_speed: [[1]] })

    expect(issues).not.toHaveLength(0)
  })

  it('reports every problem rather than only the first', () => {
    const issues = issuesOf(payload({ twa_axis: [40, 40, 190], tws_axis: [16, 12, 8] }))

    expect(issues.length).toBeGreaterThan(1)
  })
})

describe('validateCrossoverChartStructure', () => {
  /**
   * The reader's gate, which is the write gate minus the naming policy.
   *
   * A rename table that grows must not reach back into the archive: the Version below was authored
   * and accepted before `reaching-spin` was a refusal, and it is still the chart the boat sailed
   * with. The write gate refuses it, so nothing like it can be recorded from now on; the read path
   * hands it back, because the alternative is a screen that says "No such Crossover Chart Version"
   * about a Version that is right there — the same mistake the download route refuses to make.
   */
  const legacy = payload({
    sail_definitions: [
      { number: 1, label: 'Main + Jib 1' },
      { number: 2, label: 'Main + Jib 2' },
      { number: 6, label: 'Main + Reaching Spin' },
      { number: 8, label: 'Main + A2' },
    ],
  })

  it('hands back a stored chart the naming policy has since come to refuse', () => {
    expect(validateCrossoverChartPayload(legacy).ok).toBe(false)

    expect(validateCrossoverChartStructure(legacy)).toEqual({ ok: true, payload: legacy })
  })

  it('still refuses a chart that cannot be drawn', () => {
    // Structure is checked both ways round: a row that is not the width of its own wind speed axis
    // would render as a table with holes in it, and a cell naming no sail names nothing.
    const short = validateCrossoverChartStructure(
      payload({ cells: [[1, 1, 2], [6, 6], [8, 8, 6]] })
    )
    const dangling = validateCrossoverChartStructure(
      payload({
        cells: [
          [1, 1, 2],
          [6, 6, 2],
          [8, 8, 9],
        ],
      })
    )

    expect(short.ok).toBe(false)
    expect(dangling.ok).toBe(false)
  })
})

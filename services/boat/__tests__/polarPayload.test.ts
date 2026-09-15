import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePolarFile } from '@/services/boat/polarFile'
import { polarPayloadSchema, validatePolarPayload } from '@/services/boat/polarPayload'
import type { PolarPayload } from '@/types'

/**
 * The gate a Polar payload passes before it is written.
 *
 * The parser cannot be the only check: the payload also arrives from a client-side preview,
 * from a fixture, and one day from a second parser for another format. So the shape the
 * database will hold is asserted here, independently of who assembled it.
 */

const ORC_10R = readFileSync(
  join(process.cwd(), 'docs/research/fixtures/orc-first-10r.pol'),
  'utf8'
)

/** A valid payload to bend one field of at a time. */
function valid(): PolarPayload {
  const result = parsePolarFile(ORC_10R)
  if (!result.ok) throw new Error(`fixture no longer parses: ${result.message}`)
  return result.payload
}

/** The first issue's path and message, which is what a refusal is worth reading for. */
function issues(payload: unknown): string[] {
  const result = validatePolarPayload(payload)
  if (result.ok) throw new Error('expected the payload to be refused')
  return result.issues
}

describe('polarPayloadSchema', () => {
  it('accepts a payload parsed from a real ORC polar', () => {
    const result = validatePolarPayload(valid())

    expect(result.ok).toBe(true)
  })

  it('accepts the zero-padded qtVlm library grid too', () => {
    const parsed = parsePolarFile(
      readFileSync(join(process.cwd(), 'docs/research/fixtures/qtvlm-library-class40.pol'), 'utf8')
    )
    if (!parsed.ok) throw new Error(`fixture no longer parses: ${parsed.message}`)

    // A TWA of 0 and a TWS of 0 are both legal: the file gave them, so the schema takes them.
    expect(validatePolarPayload(parsed.payload).ok).toBe(true)
  })

  it('returns the payload typed, so a caller need not re-assert its shape', () => {
    const result = polarPayloadSchema.safeParse(valid())

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.boat_speed[0][0]).toBe(3.96)
  })

  describe('axes present and ascending', () => {
    it('refuses a missing angle axis', () => {
      const { twa_axis: _omitted, ...rest } = valid()

      expect(issues(rest).join(' ')).toMatch(/twa_axis/)
    })

    it('refuses a missing wind speed axis', () => {
      const { tws_axis: _omitted, ...rest } = valid()

      expect(issues(rest).join(' ')).toMatch(/tws_axis/)
    })

    it('refuses an empty axis', () => {
      expect(issues({ ...valid(), tws_axis: [], boat_speed: [[]] }).join(' ')).toMatch(/tws_axis/)
    })

    it('refuses an angle axis that goes backwards', () => {
      const payload = valid()
      const twa_axis = [...payload.twa_axis]
      ;[twa_axis[2], twa_axis[3]] = [twa_axis[3], twa_axis[2]]

      expect(issues({ ...payload, twa_axis }).join(' ')).toMatch(/ascend/)
    })

    it('refuses a repeated wind speed', () => {
      const payload = valid()
      const tws_axis = [...payload.tws_axis]
      tws_axis[1] = tws_axis[0]

      expect(issues({ ...payload, tws_axis }).join(' ')).toMatch(/ascend/)
    })

    it('refuses an angle outside 0 to 180', () => {
      const payload = valid()

      expect(issues({ ...payload, twa_axis: [...payload.twa_axis.slice(0, 7), 190] }).length)
        .toBeGreaterThan(0)
    })

    it('refuses a negative wind speed or boat speed', () => {
      const payload = valid()

      expect(issues({ ...payload, tws_axis: [-4, ...payload.tws_axis.slice(1)] }).length)
        .toBeGreaterThan(0)

      const boat_speed = payload.boat_speed.map((row) => [...row])
      boat_speed[0][0] = -1
      expect(issues({ ...payload, boat_speed }).length).toBeGreaterThan(0)
    })
  })

  describe('every row the width of the TWS axis', () => {
    it('refuses a short row', () => {
      const payload = valid()
      const boat_speed = payload.boat_speed.map((row) => [...row])
      boat_speed[3] = boat_speed[3].slice(0, -1)

      expect(issues({ ...payload, boat_speed }).join(' ')).toMatch(/boat_speed/)
    })

    it('refuses a grid with a row count the angle axis does not match', () => {
      const payload = valid()

      expect(issues({ ...payload, boat_speed: payload.boat_speed.slice(1) }).join(' ')).toMatch(
        /boat_speed/
      )
    })
  })

  describe('source recording the format and header token', () => {
    it('refuses a payload with no source', () => {
      const { source: _omitted, ...rest } = valid()

      expect(issues(rest).join(' ')).toMatch(/source/)
    })

    it('refuses a blank header token, which records nothing', () => {
      const payload = valid()

      expect(
        issues({ ...payload, source: { format: 'orc-pol', header_token: '' } }).join(' ')
      ).toMatch(/header_token/)
    })

    it('refuses a blank format', () => {
      const payload = valid()

      expect(issues({ ...payload, source: { format: '', header_token: 'twa/tws' } }).join(' ')).toMatch(
        /format/
      )
    })
  })

  it('refuses a key nobody put there', () => {
    // The payload shape is fixed by docs/design-docs/race-archive-schema.md, and this schema is
    // what stands between a typo and a JSONB column that quietly holds it forever.
    expect(issues({ ...valid(), twa_axis_v2: [1, 2] }).join(' ')).toMatch(/twa_axis_v2/)
  })

  it('refuses something that is not an object at all', () => {
    expect(issues(null).length).toBeGreaterThan(0)
    expect(issues('twa/tws;4;6').length).toBeGreaterThan(0)
  })
})

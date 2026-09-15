import { isUuid } from '../uuid'

/**
 * The guard in front of an `id=eq.…` filter. PostgREST answers a malformed uuid with a 22P02
 * *error*, not an empty result, so without this a stale link comes back as a read that failed —
 * a 500 and a logged fault of ours for what is only a Version that does not exist.
 */
describe('isUuid', () => {
  it('accepts a uuid', () => {
    expect(isUuid('3f1b2c4d-0000-4000-8000-000000000001')).toBe(true)
  })

  it('accepts one in capitals, which Postgres does too', () => {
    expect(isUuid('3F1B2C4D-0000-4000-8000-000000000001')).toBe(true)
  })

  it('refuses what a mistyped or truncated link carries', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid('version-1')).toBe(false)
    expect(isUuid('3f1b2c4d-0000-4000-8000')).toBe(false)
    expect(isUuid('3f1b2c4d-0000-4000-8000-000000000001x')).toBe(false)
    expect(isUuid(' 3f1b2c4d-0000-4000-8000-000000000001')).toBe(false)
    // The right shape with a character no hex digit has.
    expect(isUuid('3f1b2c4g-0000-4000-8000-000000000001')).toBe(false)
    expect(isUuid('3f1b2c4d000040008000000000000001')).toBe(false)
  })

  it('does not care which uuid version made it', () => {
    // Shape only, deliberately: nothing here reads the version or variant bits, and Postgres
    // accepts the text either way. The nil uuid is a uuid.
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
    expect(isUuid('9b2e4f10-1c3a-11ef-9c7a-0242ac120002')).toBe(true)
  })
})

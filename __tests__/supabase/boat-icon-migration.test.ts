/**
 * Static assertions over the boat icon migration (LAY-180).
 *
 * Applied to the local stack by hand while this was written; jest cannot reach Postgres, so what
 * it guards is the text — the properties a plausible edit could lose without any database objecting.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const FILENAME = '20261016190000_boat_icon.sql'

const sql = readFileSync(resolve(MIGRATIONS, FILENAME), 'utf8')

/** The statements alone, since the prose above them discusses what they avoid. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('the boat icon migration', () => {
  it('runs after every migration already in the repository', () => {
    // `supabase db push` refuses a local migration that sorts before one the remote applied.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files.indexOf(FILENAME)).toBe(files.length - 1)
  })

  it('adds the two columns nullable, so a boat with no icon is the state every row starts in', () => {
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS icon_path TEXT;/)
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS icon_updated_at TIMESTAMPTZ;/)
    expect(code).not.toMatch(/NOT NULL/)
    expect(code).not.toMatch(/DEFAULT/)
  })

  it('holds the path and its cache key together: both or neither', () => {
    expect(code).toMatch(/CHECK \(\(icon_path IS NULL\) = \(icon_updated_at IS NULL\)\)/)
  })

  it('leaves the bucket and its policies alone — they already cover boat-identity/', () => {
    expect(code).not.toMatch(/storage\./)
    expect(code).not.toMatch(/POLICY/)
  })

  it('is recorded in the bucket’s path convention', () => {
    const bucket = readFileSync(
      resolve(MIGRATIONS, '20260909190000_create_boat_storage_bucket.sql'),
      'utf8'
    )
    expect(bucket).toMatch(/boat-identity\/icon\/\{icon_id\}\/\{filename\}/)
  })
})

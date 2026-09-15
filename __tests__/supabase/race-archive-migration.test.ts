/**
 * Static assertions over the race archive migration.
 *
 * The invariants themselves are proved against a live database by
 * scripts/verify-race-archive-schema.sql. That suite needs Postgres, so it cannot
 * run here. What jest can do is guard the handful of properties that are properties of the
 * *text* of the migration — the ones where the failure mode is a plausible edit that no
 * running database would object to, or that only a hosted project would reject.
 */

import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { CURRENT_VERSION_FK } from '@/services/boat/readBoatSetup'
import { VERSIONS_FK } from '@/services/boat/readRigTune'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')
const MIGRATION = resolve(MIGRATIONS, '20260910183000_create_race_archive_and_boat_setup.sql')

const sql = readFileSync(MIGRATION, 'utf8')

/** Statement bodies with comment lines stripped, since the prose discusses what it avoids. */
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('the race archive migration', () => {
  it('exists under a timestamp later than the storage migration it depends on', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    const storage = files.indexOf('20260909190000_create_boat_storage_bucket.sql')
    const archive = files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')

    expect(storage).toBeGreaterThanOrEqual(0)
    expect(archive).toBeGreaterThan(storage)
  })

  it('never enables row level security on storage.objects', () => {
    // The single most likely way a hosted `db push` of this project fails. postgres lost
    // membership of supabase_storage_admin on 2025-04-21, so the statement raises 42501 —
    // and because a migration is one transaction, the abort is reported against the
    // *following* statement, which makes an innocent CREATE POLICY look like the culprit.
    expect(code).not.toMatch(/ALTER\s+TABLE\s+storage\.objects/i)
    expect(code).not.toMatch(/storage\.objects/i)
  })

  it('creates nothing in the storage schema, where postgres has no CREATE', () => {
    expect(code).not.toMatch(/CREATE\s+(TABLE|FUNCTION|POLICY)[^;]*\sstorage\./i)
  })

  it('declares no precision or scale on any numeric column', () => {
    // A declared scale is a rounding rule, and rounding a recorded value is the one thing
    // ADR 0008 forbids. `numeric` bare, always.
    expect(code).not.toMatch(/\bNUMERIC\s*\(/i)
    expect(code).toMatch(/\bNUMERIC\b/)
  })

  it('gives recordings.id no DEFAULT', () => {
    // ADR 0013: the id is minted client-side, because the permanent Storage path contains it
    // and the bytes move before the transaction commits. A DEFAULT here would make an
    // orphaned *row* possible, which is the failure the ADR chose against.
    const recordings = code.match(/CREATE TABLE IF NOT EXISTS recordings \(([\s\S]*?)\n\);/)
    expect(recordings).not.toBeNull()
    expect(recordings![1]).toMatch(/id\s+UUID PRIMARY KEY,/)
    expect(recordings![1]).not.toMatch(/id\s+UUID PRIMARY KEY DEFAULT/)
  })

  it('generates water_referenced and nothing else', () => {
    const generated = code.match(/GENERATED ALWAYS AS/g) ?? []
    expect(generated).toHaveLength(1)
    expect(code).toMatch(/water_referenced\s+BOOLEAN GENERATED ALWAYS AS[\s\S]*?STORED/)
  })

  it('never tests an array for emptiness with a bare ARRAY_LENGTH', () => {
    // array_length('{}', 1) is NULL, and a CHECK that evaluates to NULL is satisfied — so
    // `ARRAY_LENGTH(x, 1) >= 1` admits the empty array it exists to refuse. Both non-empty
    // array CHECKs in this migration shipped with that bug and the SQL suite caught it.
    const bare = code.match(/ARRAY_LENGTH\([^)]*\)\s*>=/gi) ?? []
    expect(bare).toHaveLength(0)
    expect(code).toMatch(/COALESCE\(ARRAY_LENGTH\(channels, 1\), 0\) >= 1/)
    expect(code).toMatch(/COALESCE\(ARRAY_LENGTH\(source_columns, 1\), 0\) >= 1/)
  })

  describe('policies', () => {
    const policies = [...code.matchAll(/CREATE POLICY[\s\S]*?;/g)].map((m) => m[0])

    it('are all there is: twelve tables, a read policy and a write policy each, less two', () => {
      // 12 SELECT policies + 12 write policies, minus the two tables that get less than
      // FOR ALL: recording_rows (INSERT only) and boat_setup_versions (INSERT + UPDATE).
      expect(policies).toHaveLength(25)
    })

    it('are every one of them TO authenticated', () => {
      // A guest is `anon`, so a policy TO authenticated is never even evaluated for one:
      // zero rows, not an error. Any policy TO public would also apply to `anon`.
      for (const policy of policies) {
        expect(policy).toMatch(/TO authenticated/)
      }
    })

    it('reuse public.is_admin() rather than re-deriving the check on profiles', () => {
      // LAY-92 answered this: a policy body runs as `authenticated`, so an inline subquery
      // on profiles is filtered by profiles' own RLS and would fail closed and silently.
      for (const policy of policies) {
        expect(policy).not.toMatch(/\bprofiles\b/)
      }
    })

    it('wrap it as (SELECT public.is_admin()) so the planner hoists it to an initPlan', () => {
      const writes = policies.filter((p) => !/FOR SELECT/.test(p))
      expect(writes.length).toBeGreaterThan(0)
      for (const policy of writes) {
        expect(policy).toMatch(/\(SELECT public\.is_admin\(\)\)/)
        expect(policy).not.toMatch(/[^(]public\.is_admin\(\)\s*[)]?\s*;/)
      }
    })

    it('give recording_rows no way to be rewritten', () => {
      // Immutability by absent policy. The Transcription is append-only, and a row leaves
      // only with its Recording — through a cascade, which RLS does not police.
      const rows = policies.filter((p) => /ON recording_rows/.test(p))
      expect(rows).toHaveLength(2)
      expect(rows.some((p) => /FOR SELECT/.test(p))).toBe(true)
      expect(rows.some((p) => /FOR INSERT/.test(p))).toBe(true)
      expect(rows.some((p) => /FOR (ALL|UPDATE|DELETE)/.test(p))).toBe(false)
    })

    it('give boat_setup_versions no way to be deleted', () => {
      // A Version is superseded, never removed: the pointer moves forward and the old row
      // stays, because a Race frozen against it still names it (ADR 0012).
      const versions = policies.filter((p) => /ON boat_setup_versions/.test(p))
      expect(versions).toHaveLength(3)
      expect(versions.some((p) => /FOR (ALL|DELETE)/.test(p))).toBe(false)
    })
  })

  it('comments every table it creates', () => {
    const tables = [...code.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1])
    expect(tables).toHaveLength(12)
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`COMMENT ON TABLE ${table} IS`))
    }
  })

  it('is idempotent in every object it creates', () => {
    // `supabase db reset` and a re-run of a partially applied push both have to work.
    expect(code.match(/CREATE TABLE(?! IF NOT EXISTS)/g)).toBeNull()
    expect(code.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)).toBeNull()

    // Triggers and policies cannot say IF NOT EXISTS, so each is preceded by a DROP.
    const triggers = [...code.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER (\w+)/g)].map((m) => m[1])
    expect(triggers.length).toBeGreaterThan(0)
    for (const trigger of triggers) {
      expect(code).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${trigger} ON `))
    }
    const named = [...code.matchAll(/CREATE POLICY "([^"]+)"\s+ON (\w+)/g)]
    expect(named).toHaveLength(25)
    for (const [, policy, table] of named) {
      expect(code).toContain(`DROP POLICY IF EXISTS "${policy}" ON ${table};`)
    }
  })

  it('declares the current-version foreign key under the name PostgREST is asked for', () => {
    // Two foreign keys join boat_setup_artifacts and boat_setup_versions, so the
    // Boat management screen's embed has to name one — and a name PostgREST cannot
    // resolve fails at request time, where no mocked client would notice. This is
    // the one place the two strings can be held together cheaply.
    expect(code).toContain(`ADD CONSTRAINT ${CURRENT_VERSION_FK}`)
  })

  it('declares the other one on the columns its derived name is built from', () => {
    // The Rig Tune screen embeds the other direction and has to name it too, but this key
    // is declared unnamed, so the name is Postgres' own: table, then the columns in the
    // order written, then _fkey. Reordering the pair would silently rename the key and
    // break the embed, so assert the column order the name encodes.
    expect(VERSIONS_FK).toBe('boat_setup_versions_artifact_id_kind_fkey')
    expect(code).toMatch(/FOREIGN KEY \(artifact_id, kind\)\s*\n\s*REFERENCES boat_setup_artifacts/)
  })
})

describe('the Rig Tune staleness and minting migration', () => {
  const RIG_TUNE = resolve(MIGRATIONS, '20260915190000_rig_tune_stale_gaps_and_mint.sql')
  const rigSql = readFileSync(RIG_TUNE, 'utf8')
  const rigCode = rigSql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  it('applies after the migration that creates the table it alters', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files.indexOf('20260915190000_rig_tune_stale_gaps_and_mint.sql')).toBeGreaterThan(
      files.indexOf('20260910183000_create_race_archive_and_boat_setup.sql')
    )
  })

  it('mints under the caller own privileges, never as its owner', () => {
    // The whole point of routing three writes through one function is the transaction, not
    // authority. SECURITY DEFINER would hand every signed-in account the owner's rights and
    // quietly undo ADR 0019, and no database would object — only this assertion does.
    expect(rigCode).toMatch(/SECURITY INVOKER/)
    expect(rigCode).not.toMatch(/SECURITY DEFINER/)
    expect(rigCode).toMatch(/SET search_path = ''/)
  })

  it('leaves the function unreachable by a guest', () => {
    // ADR 0015: there is no signed-out boat screen, so `anon` has no business holding
    // EXECUTE — and `public` includes `anon`, which is how EXECUTE arrives by default.
    expect(rigCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.mint_rig_tune_version[^;]*FROM PUBLIC;/)
    expect(rigCode).toMatch(/REVOKE EXECUTE ON FUNCTION public\.mint_rig_tune_version[^;]*FROM anon;/)
    expect(rigCode).toMatch(/GRANT EXECUTE ON FUNCTION public\.mint_rig_tune_version[^;]*TO authenticated;/)
  })

  it('keeps the Base Tune out of the set of bands whose Gaps can go stale', () => {
    // The Base Tune is what the other bands' Turns are counted from, so it is the one band
    // re-measuring cannot invalidate: it *is* the new measurement (ADR 0007).
    expect(rigCode).toMatch(
      /ADD CONSTRAINT base_band_gaps_never_stale CHECK \(NOT \(is_base AND gaps_stale\)\)/
    )
  })

  it('counts the Base Tune bands before it writes anything', () => {
    // "Exactly one per Version, enforced by the database" is two halves: the partial unique
    // index in the creating migration refuses the second base, and this counts the zeroth.
    // A table whose Turns are counted from no band at all is figures that mean nothing.
    expect(rigCode).toMatch(/SELECT count\(\*\) INTO v_bases\s*\n\s*FROM jsonb_array_elements\(p_bands\)/)
    expect(rigCode).toMatch(/IF v_bases <> 1 THEN\s*\n\s*RAISE EXCEPTION/)
  })

  it('refuses to guess which boat it is writing to', () => {
    // The artifact is found by kind alone, so a second boat's row would make the target
    // arbitrary. STRICT turns that into a failed call rather than a Version on the wrong boat.
    expect(rigCode).toMatch(/SELECT id INTO STRICT v_artifact_id/)
    expect(rigCode).toMatch(/WHEN too_many_rows THEN/)
    // And a viewer, whom RLS leaves with no row to lock, still hears about privileges.
    expect(rigCode).toMatch(/WHEN no_data_found THEN\s*\n\s*RAISE EXCEPTION[^;]*42501/)
  })

  it('is idempotent in everything it adds', () => {
    expect(rigCode).toMatch(/ADD COLUMN IF NOT EXISTS gaps_stale/)
    // A CHECK cannot say IF NOT EXISTS, so it is dropped first.
    expect(rigCode).toMatch(/DROP CONSTRAINT IF EXISTS base_band_gaps_never_stale/)
    expect(rigCode).toMatch(/CREATE OR REPLACE FUNCTION public\.mint_rig_tune_version/)
  })

  it('comments the column and the function it adds', () => {
    expect(rigSql).toMatch(/COMMENT ON COLUMN public\.rig_tune_bands\.gaps_stale IS/)
    expect(rigSql).toMatch(/COMMENT ON FUNCTION public\.mint_rig_tune_version/)
  })
})

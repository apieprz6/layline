-- Verification suite for the race archive and Boat Setup schema.
--
-- Asserts the refusals as well as the successes: every invariant the design doc
-- (docs/design-docs/race-archive-schema.md) claims Postgres enforces is attacked here, and
-- the check passes only when the database says no.
--
-- Run it with scripts/verify-race-archive-schema.sh, which points psql at either the local
-- stack or a hosted project.
--
-- SAFE AGAINST A LIVE PROJECT. Everything happens inside one transaction that ends in
-- ROLLBACK, so the fixtures -- two auth users, a Recording, two Races, some Versions -- exist
-- only for the length of the run. If a check crashes the script, the transaction aborts,
-- which has the same effect.
--
-- Three mechanics worth knowing before reading the checks:
--
--   * Deferred constraint triggers normally fire at COMMIT, and this suite never commits, so
--     the helpers call SET CONSTRAINTS ALL IMMEDIATE to make them fire at the statement
--     instead. Without that, every deferred refusal would look like a pass.
--   * The RLS tiers are exercised with SET LOCAL ROLE plus a request.jwt.claims setting,
--     which is what auth.uid() reads. The helpers always RESET ROLE before recording a
--     result, because the results table belongs to the session's own temp schema.
--   * A touched updated_at cannot be seen by comparing timestamps here: NOW() is frozen for
--     the whole transaction, so a trigger that sets updated_at = NOW() writes the value it
--     already had. The touch is observed through the row's ctid instead, which changes when
--     and only when the row is rewritten.

\set ON_ERROR_STOP on
\pset pager off
\timing off

BEGIN;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _results (
    n       SERIAL PRIMARY KEY,
    name    TEXT NOT NULL,
    ok      BOOLEAN NOT NULL,
    detail  TEXT
);

CREATE FUNCTION pg_temp.chk(p_name TEXT, p_ok BOOLEAN, p_detail TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO _results (name, ok, detail) VALUES (p_name, p_ok, p_detail);
END;
$$;

-- Passes when the statement is refused. Reports the refusal's own message, so a check that
-- passes for the wrong reason is visible in the output rather than hidden by it.
CREATE FUNCTION pg_temp.refuses(p_name TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_ok     BOOLEAN;
    v_detail TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        SET CONSTRAINTS ALL IMMEDIATE;
        v_ok := FALSE;
        v_detail := 'expected a refusal; the statement was accepted';
        -- Raise so the subtransaction unwinds and the accepted statement leaves nothing
        -- behind. The verdict is already in v_ok, which plpgsql does not roll back.
        RAISE EXCEPTION '__unexpected_success__';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> '__unexpected_success__' THEN
            v_ok := TRUE;
            v_detail := SQLERRM;
        END IF;
    END;
    PERFORM pg_temp.chk(p_name, v_ok, v_detail);
END;
$$;

-- Passes when the statement is accepted, deferred triggers included. Its effects persist, so
-- this doubles as the way fixtures are built.
CREATE FUNCTION pg_temp.accepts(p_name TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_ok     BOOLEAN := TRUE;
    v_detail TEXT;
BEGIN
    BEGIN
        EXECUTE p_sql;
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
        v_ok := FALSE;
        v_detail := SQLERRM;
    END;
    IF v_ok THEN
        -- Put the deferred constraints back, or every later deferred refusal would be
        -- checked immediately by accident.
        SET CONSTRAINTS ALL DEFERRED;
    END IF;
    PERFORM pg_temp.chk(p_name, v_ok, v_detail);
END;
$$;

-- Become a request: `anon` for a guest, `authenticated` with a sub claim for a signed-in
-- user. auth.uid() reads request.jwt.claims, and is_admin() reads auth.uid().
CREATE FUNCTION pg_temp.act_as(p_uid UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_uid IS NULL THEN
        PERFORM set_config('request.jwt.claims', '', TRUE);
        EXECUTE 'SET LOCAL ROLE anon';
    ELSE
        PERFORM set_config(
            'request.jwt.claims',
            json_build_object('sub', p_uid, 'role', 'authenticated')::TEXT,
            TRUE
        );
        EXECUTE 'SET LOCAL ROLE authenticated';
    END IF;
END;
$$;

-- Count a table as somebody. `err` distinguishes "zero rows" from "you may not look", which
-- is the whole point of the guest tier.
CREATE FUNCTION pg_temp.count_as(p_uid UUID, p_relation TEXT, OUT n BIGINT, OUT err TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', p_relation) INTO n;
    EXCEPTION WHEN OTHERS THEN
        err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$;

-- Run a statement as somebody. Returns NULL when it was accepted, the message when it was not.
CREATE FUNCTION pg_temp.exec_as(p_uid UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_err TEXT;
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        EXECUTE p_sql;
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
    IF v_err IS NULL THEN
        SET CONSTRAINTS ALL DEFERRED;
    END IF;
    RETURN v_err;
END;
$$;

-- Evaluate a scalar query as somebody. `val` is the result as text and `err` the refusal, so a
-- function's own return value can be asserted rather than inferred from what it wrote.
CREATE FUNCTION pg_temp.value_as(p_uid UUID, p_sql TEXT, OUT val TEXT, OUT err TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        EXECUTE p_sql INTO val;
        -- Immediate, so a deferred constraint trigger the call ought to satisfy is made to fire
        -- here rather than at the end of the whole suite.
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
        err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
    IF err IS NULL THEN
        SET CONSTRAINTS ALL DEFERRED;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Fixed UUIDs so a failure message points at something nameable.
--
--   admin  aaaaaaa1  an admin profile
--   crew   cccccccc  a viewer -- every signed-in account reads everything (ADR 0019)
--   P1/P2  polar Versions 1 and 2
--   R1/R2  rig_tune Versions 1 and 2, with bands
--   C1     instrument_calibration Version 1
--   REC1   a Recording with three rows; REC2 a second Recording with one

-- 20260911213000_profile_trigger_and_role_lock.sql puts an AFTER INSERT trigger on auth.users
-- that creates the Profile in this same transaction, with role defaulting to 'viewer'. So the
-- two inserts below are all it takes to get both tiers, and a hand-written INSERT INTO profiles
-- would now collide on the primary key.
INSERT INTO auth.users (id, email) VALUES
    ('aaaaaaa1-0000-4000-8000-000000000001', 'admin@layline.test'),
    ('cccccccc-0000-4000-8000-000000000002', 'crew@layline.test');

-- Promoting one of them is a role write, which the same migration refuses for any caller whose
-- JWT role is `authenticated`. This runs as the session user with no JWT, which is the SQL
-- console path ADR 0017 designated, so it is allowed — and asserted below rather than assumed.
UPDATE profiles SET role = 'admin'
 WHERE id = 'aaaaaaa1-0000-4000-8000-000000000001';

DO $$
DECLARE
    v_admin TEXT;
    v_crew  TEXT;
BEGIN
    SELECT role INTO v_admin FROM profiles
     WHERE id = 'aaaaaaa1-0000-4000-8000-000000000001';
    SELECT role INTO v_crew FROM profiles
     WHERE id = 'cccccccc-0000-4000-8000-000000000002';

    PERFORM pg_temp.chk(
        'the Profile trigger gave both fixtures a Profile, one admin and one viewer',
        v_admin = 'admin' AND v_crew = 'viewer',
        format('admin=%s crew=%s', COALESCE(v_admin, 'no profile'), COALESCE(v_crew, 'no profile'))
    );
END;
$$;

-- ===========================================================================
-- Shape: what the migration is, before anything is written to it
-- ===========================================================================

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries'
    ];
    v_missing TEXT[];
    v_unprotected TEXT[];
BEGIN
    SELECT array_agg(t) INTO v_missing
    FROM unnest(v_tables) AS t
    WHERE to_regclass('public.' || t) IS NULL;

    PERFORM pg_temp.chk(
        'all eleven archive and Boat Setup tables exist',
        v_missing IS NULL,
        'missing: ' || COALESCE(v_missing::TEXT, '-')
    );

    SELECT array_agg(c.relname) INTO v_unprotected
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY (v_tables) AND NOT c.relrowsecurity;

    PERFORM pg_temp.chk(
        'row level security is enabled on every one of them',
        v_unprotected IS NULL,
        'without RLS: ' || COALESCE(v_unprotected::TEXT, '-')
    );
END;
$$;

DO $$
DECLARE v_default TEXT;
BEGIN
    SELECT column_default INTO v_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recordings' AND column_name = 'id';

    PERFORM pg_temp.chk(
        'recordings.id has no DEFAULT, so the caller must supply it (ADR 0013)',
        v_default IS NULL,
        COALESCE(v_default, 'no default')
    );
END;
$$;

DO $$
DECLARE
    v_generation TEXT;
    v_others     TEXT[];
BEGIN
    SELECT is_generated INTO v_generation
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recording_rows'
      AND column_name = 'water_referenced';

    PERFORM pg_temp.chk(
        'recording_rows.water_referenced is a generated stored column',
        v_generation = 'ALWAYS',
        COALESCE(v_generation, 'column absent')
    );

    SELECT array_agg(c.relname || '.' || a.attname) INTO v_others
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attgenerated <> ''
      AND c.relname IN (
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries')
      AND NOT (c.relname = 'recording_rows' AND a.attname = 'water_referenced');

    PERFORM pg_temp.chk(
        'and it is the only thing Layline computes onto a row',
        v_others IS NULL,
        'other generated columns: ' || COALESCE(v_others::TEXT, '-')
    );
END;
$$;

DO $$
DECLARE v_scaled TEXT[];
BEGIN
    SELECT array_agg(table_name || '.' || column_name) INTO v_scaled
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'numeric'
      AND (numeric_precision IS NOT NULL OR numeric_scale IS NOT NULL)
      AND table_name IN (
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries');

    PERFORM pg_temp.chk(
        'no recorded channel declares a scale: a declared scale is a rounding rule (ADR 0008)',
        v_scaled IS NULL,
        'scaled: ' || COALESCE(v_scaled::TEXT, '-')
    );
END;
$$;

DO $$
DECLARE
    v_naive TEXT[] := ARRAY[
        'recordings.first_row_time', 'recordings.last_row_time', 'recording_rows.row_time',
        'races.window_start', 'races.window_finish', 'race_sail_entries.at',
        'race_sea_state_entries.at'
    ];
    v_layline TEXT[] := ARRAY[
        'boats.created_at', 'boats.updated_at', 'recordings.created_at',
        'boat_setup_versions.recorded_at', 'races.created_at', 'races.updated_at',
        'race_sail_entries.created_at', 'race_sea_state_entries.created_at'
    ];
    v_wrong TEXT[];
BEGIN
    SELECT array_agg(q.qname || ' is ' || c.data_type) INTO v_wrong
    FROM (
        SELECT unnest(v_naive) AS qname, 'timestamp without time zone' AS want
        UNION ALL
        SELECT unnest(v_layline), 'timestamp with time zone'
    ) q
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = split_part(q.qname, '.', 1)
     AND c.column_name = split_part(q.qname, '.', 2)
    WHERE c.data_type <> q.want;

    PERFORM pg_temp.chk(
        'a recording''s own wall clock is timestamp, Layline''s own moments are timestamptz',
        v_wrong IS NULL,
        'wrong frame: ' || COALESCE(v_wrong::TEXT, '-')
    );
END;
$$;

DO $$
DECLARE
    v_boats   BIGINT;
    v_arts    BIGINT;
    v_pointed BIGINT;
    v_other   BIGINT;
BEGIN
    SELECT count(*) INTO v_boats FROM boats WHERE name = 'Handsome Pete' AND model = 'Beneteau 10R';
    SELECT count(*) INTO v_arts FROM boat_setup_artifacts;
    SELECT count(*) INTO v_pointed FROM boat_setup_artifacts WHERE current_version_id IS NOT NULL;
    -- crossover_sail_definitions belongs in this sum now: the boat's sail vocabulary is not
    -- seeded reference data any more, it arrives with a Crossover Chart Version (ADR 0023).
    SELECT (SELECT count(*) FROM boat_setup_versions) + (SELECT count(*) FROM rig_tune_bands)
         + (SELECT count(*) FROM crossover_sail_definitions)
         + (SELECT count(*) FROM calibration_events) + (SELECT count(*) FROM recordings)
         + (SELECT count(*) FROM races)
      INTO v_other;

    PERFORM pg_temp.chk(
        'the migration seeds one boat and four unpointed artifacts, and no sails at all',
        v_boats = 1 AND v_arts = 4 AND v_pointed = 0,
        format('boat=%s artifacts=%s pointed=%s', v_boats, v_arts, v_pointed)
    );

    PERFORM pg_temp.chk(
        'and seeds no race data at all: the archive is entered by hand through the UI',
        v_other = 0,
        format('rows in versions/bands/definitions/events/recordings/races: %s', v_other)
    );
END;
$$;

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries'
    ];
    v_ungranted TEXT[];
BEGIN
    -- A read tier is a GRANT and a policy. Without the GRANT, the guest tier fails as a
    -- permission error rather than as zero rows, which is the distinction LAY-95 settled.
    SELECT array_agg(t || ' / ' || r) INTO v_ungranted
    FROM unnest(v_tables) AS t, unnest(ARRAY['anon', 'authenticated']) AS r
    WHERE NOT has_table_privilege(r, 'public.' || t, 'SELECT');

    PERFORM pg_temp.chk(
        'anon and authenticated both hold SELECT, so RLS is what decides what they see',
        v_ungranted IS NULL,
        COALESCE(v_ungranted::TEXT, '-')
    );
END;
$$;

SELECT pg_temp.refuses(
    'a second boat is refused (boats_singleton)',
    $sql$INSERT INTO boats (name, model) VALUES ('Wayward Wind', 'J/105')$sql$
);

-- ===========================================================================
-- Boat Setup Versions
-- ===========================================================================

SELECT pg_temp.accepts(
    'a polar Version is accepted with a filename and a hash',
    $sql$
    INSERT INTO boat_setup_versions
        (id, artifact_id, kind, version_number, effective_from, created_by,
         filename, content_sha256, payload)
    SELECT '10000000-0000-4000-8000-000000000001', a.id, 'polar', 1, DATE '2026-05-01',
           'aaaaaaa1-0000-4000-8000-000000000001', 'Beneteau10R.pol', repeat('a', 64),
           '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.2]]}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'polar'
    $sql$
);

SELECT pg_temp.refuses(
    'a polar Version with no filename is refused (file_backed_kinds_only)',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, payload)
    SELECT a.id, 'polar', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.2]]}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'polar'
    $sql$
);

SELECT pg_temp.refuses(
    'a filename on a rig_tune Version is refused (the Wayward_Wind.rig mistake)',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, note,
         filename, content_sha256, payload)
    SELECT a.id, 'rig_tune', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           'from the tuning guide', 'Wayward_Wind.rig', repeat('b', 64), '{}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
    $sql$
);

SELECT pg_temp.refuses(
    'a hash with no filename is refused (hash_accompanies_filename)',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, note,
         content_sha256, payload)
    SELECT a.id, 'rig_tune', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           'from the tuning guide', repeat('b', 64), '{}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
    $sql$
);

SELECT pg_temp.refuses(
    'a rig_tune Version with no note is refused (ADR 0007)',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, payload)
    SELECT a.id, 'rig_tune', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           '{}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
    $sql$
);

SELECT pg_temp.refuses(
    'a polar payload missing an axis is refused (payload_keys_present)',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by,
         filename, content_sha256, payload)
    SELECT a.id, 'polar', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           'x.pol', repeat('a', 64), '{"twa_axis": [30], "boat_speed": [[3.2]]}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'polar'
    $sql$
);

SELECT pg_temp.refuses(
    'a rig_tune payload carrying content is refused: the bands are rows',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, note, payload)
    SELECT a.id, 'rig_tune', 99, DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
           'from the tuning guide', '{"bands": []}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
    $sql$
);

-- Sail Definitions as rows --------------------------------------------------
-- Two Crossover Chart Versions, each with its own numbering, because that is the state the
-- whole of ADR 0023 turns on: sail 3 of v1 and sail 4 of v2 are not each other, and sail
-- identity does not span Versions. The payload keeps its own `sail_definitions` -- it is the
-- file's testimony -- and the rows beside it are what a Sail Configuration points at.
--
-- Inserted directly here rather than through mint_boat_setup_version, which the minting section
-- exercises separately: these are the fixtures the annotation checks below need, and the table's
-- own refusals are worth attacking without a function in the way.

SELECT pg_temp.accepts(
    'a crossover_chart Version and its Sail Definitions are accepted',
    $sql$
    WITH v AS (
        INSERT INTO boat_setup_versions
            (id, artifact_id, kind, version_number, effective_from, created_by,
             filename, content_sha256, payload)
        SELECT '11000000-0000-4000-8000-000000000001', a.id, 'crossover_chart', 1,
               DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
               'Handsome_Pete_crossover.csv', repeat('1', 64),
               '{"twa_axis": [40], "tws_axis": [6], "cells": [[1]],
                 "sail_definitions": [{"number": 1, "label": "Main + Jib 1"},
                                      {"number": 2, "label": "Main reefed + Jib 3"},
                                      {"number": 3, "label": "Main + A2"}]}'::JSONB
        FROM boat_setup_artifacts a WHERE a.kind = 'crossover_chart'
        RETURNING id
    )
    INSERT INTO crossover_sail_definitions (version_id, number, label)
    SELECT v.id, d.number, d.label
    FROM v, (VALUES (1, 'Main + Jib 1'), (2, 'Main reefed + Jib 3'), (3, 'Main + A2'))
        AS d(number, label)
    $sql$
);

SELECT pg_temp.accepts(
    'and so is a second Version that numbers its sails differently',
    $sql$
    WITH v AS (
        INSERT INTO boat_setup_versions
            (id, artifact_id, kind, version_number, effective_from, created_by,
             filename, content_sha256, payload)
        SELECT '11000000-0000-4000-8000-000000000002', a.id, 'crossover_chart', 2,
               DATE '2026-06-01', 'aaaaaaa1-0000-4000-8000-000000000001',
               'Handsome_Pete_crossover_v2.csv', repeat('2', 64),
               '{"twa_axis": [40], "tws_axis": [6], "cells": [[1]],
                 "sail_definitions": [{"number": 1, "label": "Main + Jib 1"},
                                      {"number": 4, "label": "Main + A3"}]}'::JSONB
        FROM boat_setup_artifacts a WHERE a.kind = 'crossover_chart'
        RETURNING id
    )
    INSERT INTO crossover_sail_definitions (version_id, number, label)
    SELECT v.id, d.number, d.label
    FROM v, (VALUES (1, 'Main + Jib 1'), (4, 'Main + A3')) AS d(number, label)
    $sql$
);

SELECT pg_temp.refuses(
    'a Sail Definition on a Version of another kind is refused (the constant tag column)',
    $sql$
    INSERT INTO crossover_sail_definitions (version_id, number, label)
    VALUES ('10000000-0000-4000-8000-000000000001', 1, 'Main + Jib 1')
    $sql$
);

SELECT pg_temp.refuses(
    'one number cannot mean two sails in one Version',
    $sql$
    INSERT INTO crossover_sail_definitions (version_id, number, label)
    VALUES ('11000000-0000-4000-8000-000000000001', 3, 'Main + A3')
    $sql$
);

SELECT pg_temp.refuses(
    'a Definition with no label is refused: a bare number names nothing',
    $sql$
    INSERT INTO crossover_sail_definitions (version_id, number, label)
    VALUES ('11000000-0000-4000-8000-000000000001', 9, '   ')
    $sql$
);

-- The current pointer -------------------------------------------------------

SELECT pg_temp.accepts(
    'an artifact may be pointed at a Version of its own',
    $sql$
    UPDATE boat_setup_artifacts SET current_version_id = '10000000-0000-4000-8000-000000000001'
    WHERE kind = 'polar'
    $sql$
);

SELECT pg_temp.refuses(
    'the current pointer cannot name a Version of another artifact',
    $sql$
    UPDATE boat_setup_artifacts SET current_version_id = '10000000-0000-4000-8000-000000000001'
    WHERE kind = 'crossover_chart'
    $sql$
);

SELECT pg_temp.refuses(
    'the current pointer cannot be cleared once set',
    $sql$UPDATE boat_setup_artifacts SET current_version_id = NULL WHERE kind = 'polar'$sql$
);

SELECT pg_temp.accepts(
    'a Version and the pointer to it can be written in one transaction, and the pointer moves forward',
    $sql$
    WITH v AS (
        INSERT INTO boat_setup_versions
            (id, artifact_id, kind, version_number, effective_from, created_by,
             filename, content_sha256, payload)
        SELECT '10000000-0000-4000-8000-000000000002', a.id, 'polar', 2, DATE '2026-06-01',
               'aaaaaaa1-0000-4000-8000-000000000001', 'Beneteau10R-v2.pol', repeat('c', 64),
               '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.3]]}'::JSONB
        FROM boat_setup_artifacts a WHERE a.kind = 'polar'
        RETURNING id
    )
    UPDATE boat_setup_artifacts SET current_version_id = (SELECT id FROM v) WHERE kind = 'polar'
    $sql$
);

SELECT pg_temp.refuses(
    'the current pointer cannot move backwards',
    $sql$
    UPDATE boat_setup_artifacts SET current_version_id = '10000000-0000-4000-8000-000000000001'
    WHERE kind = 'polar'
    $sql$
);

-- Immutability, with the calibration exception ------------------------------

SELECT pg_temp.refuses(
    'a polar Version cannot be updated; it is superseded instead',
    $sql$
    UPDATE boat_setup_versions SET note = 'second thoughts'
    WHERE id = '10000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.accepts(
    'an instrument_calibration Version is accepted with all four channels',
    $sql$
    INSERT INTO boat_setup_versions
        (id, artifact_id, kind, version_number, effective_from, created_by, note, payload)
    SELECT '20000000-0000-4000-8000-000000000001', a.id, 'instrument_calibration', 1,
           DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001', 'off the display',
           '{"AWA": {"offset": 2.0}, "AWS": {"multiplier": 1.02, "offset": 0.0},
             "STW": {"multiplier": 1.02, "offset": 0.0}, "HDG": {"offset": 0.0}}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.refuses(
    'a calibration payload missing a channel is refused',
    $sql$
    INSERT INTO boat_setup_versions
        (artifact_id, kind, version_number, effective_from, created_by, payload)
    SELECT a.id, 'instrument_calibration', 99, DATE '2026-05-01',
           'aaaaaaa1-0000-4000-8000-000000000001',
           '{"AWA": {"offset": 2.0}, "AWS": {}, "STW": {}}'::JSONB
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.accepts(
    'an instrument_calibration Version can be corrected in values, note and effective date',
    $sql$
    UPDATE boat_setup_versions
    SET payload = '{"AWA": {"offset": 2.5}, "AWS": {"multiplier": 1.02, "offset": 0.0},
                    "STW": {"multiplier": 1.02, "offset": 0.0}, "HDG": {"offset": 0.0}}'::JSONB,
        note = 'AWA was mistyped',
        effective_from = DATE '2026-04-15'
    WHERE id = '20000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'and in nothing else: not its version_number',
    $sql$
    UPDATE boat_setup_versions SET version_number = 7
    WHERE id = '20000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'and not its recorded_at, which keeps meaning when it was first entered',
    $sql$
    UPDATE boat_setup_versions SET recorded_at = NOW() - INTERVAL '1 year'
    WHERE id = '20000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'and not its author',
    $sql$
    UPDATE boat_setup_versions SET created_by = 'cccccccc-0000-4000-8000-000000000002'
    WHERE id = '20000000-0000-4000-8000-000000000001'
    $sql$
);

-- ===========================================================================
-- Rig Tune Wind Bands
-- ===========================================================================

SELECT pg_temp.accepts(
    'a rig_tune Version with a Base Tune and two bands above it is accepted',
    $sql$
    WITH v AS (
        INSERT INTO boat_setup_versions
            (id, artifact_id, kind, version_number, effective_from, created_by, note, payload)
        SELECT '30000000-0000-4000-8000-000000000001', a.id, 'rig_tune', 1, DATE '2026-05-01',
               'aaaaaaa1-0000-4000-8000-000000000001',
               'base from the guide; spread is one to three turns because the headstay is fixed',
               '{}'::JSONB
        FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
        RETURNING id
    )
    INSERT INTO rig_tune_bands (id, version_id, low_kt, high_kt, is_base, label, shrouds)
    SELECT b.id, v.id, b.low_kt, b.high_kt, b.is_base, b.label,
           '{"V1": {"port": {"gap_mm": 12.5, "turns_from_base": 0},
                    "starboard": {"gap_mm": 12.5, "turns_from_base": 0}},
             "D1": {"port": {"gap_mm": 8.0, "turns_from_base": 0},
                    "starboard": {"gap_mm": 8.0, "turns_from_base": 0}},
             "D2": {"port": {"gap_mm": 4.0, "turns_from_base": 0},
                    "starboard": {"gap_mm": 4.0, "turns_from_base": 0}}}'::JSONB
    FROM v, (VALUES
        ('40000000-0000-4000-8000-000000000001'::UUID, 0::NUMERIC, 8::NUMERIC, TRUE, 'light'),
        ('40000000-0000-4000-8000-000000000002', 8, 15, FALSE, 'medium'),
        ('40000000-0000-4000-8000-000000000003', 15, NULL, FALSE, 'heavy')
    ) AS b(id, low_kt, high_kt, is_base, label)
    $sql$
);

SELECT pg_temp.refuses(
    'a second Base Tune in one Version is refused (rig_tune_bands_one_base)',
    $sql$
    INSERT INTO rig_tune_bands (version_id, low_kt, high_kt, is_base, shrouds)
    VALUES ('30000000-0000-4000-8000-000000000001', 20, 22, TRUE,
            '{"V1": {}, "D1": {}, "D2": {}}'::JSONB)
    $sql$
);

SELECT pg_temp.refuses(
    'a second open-topped band in one Version is refused (rig_tune_bands_one_open_top)',
    $sql$
    INSERT INTO rig_tune_bands (version_id, low_kt, high_kt, shrouds)
    VALUES ('30000000-0000-4000-8000-000000000001', 25, NULL,
            '{"V1": {}, "D1": {}, "D2": {}}'::JSONB)
    $sql$
);

SELECT pg_temp.refuses(
    'a band whose top is not above its bottom is refused (band_bounds_ordered)',
    $sql$
    INSERT INTO rig_tune_bands (version_id, low_kt, high_kt, shrouds)
    VALUES ('30000000-0000-4000-8000-000000000001', 20, 20,
            '{"V1": {}, "D1": {}, "D2": {}}'::JSONB)
    $sql$
);

SELECT pg_temp.refuses(
    'a band missing a shroud position is refused (shrouds_positions_present)',
    $sql$
    INSERT INTO rig_tune_bands (version_id, low_kt, high_kt, shrouds)
    VALUES ('30000000-0000-4000-8000-000000000001', 30, 35, '{"V1": {}, "D1": {}}'::JSONB)
    $sql$
);

SELECT pg_temp.refuses(
    'a band cannot hang off a Version of another kind',
    $sql$
    INSERT INTO rig_tune_bands (version_id, low_kt, high_kt, shrouds)
    VALUES ('10000000-0000-4000-8000-000000000001', 0, 8,
            '{"V1": {}, "D1": {}, "D2": {}}'::JSONB)
    $sql$
);

-- A second Rig Tune Version, so a Race can be caught pointing at the wrong Version's band.
SELECT pg_temp.accepts(
    'a second rig_tune Version with its own band is accepted',
    $sql$
    WITH v AS (
        INSERT INTO boat_setup_versions
            (id, artifact_id, kind, version_number, effective_from, created_by, note, payload)
        SELECT '30000000-0000-4000-8000-000000000002', a.id, 'rig_tune', 2, DATE '2026-07-01',
               'aaaaaaa1-0000-4000-8000-000000000001', 'retuned after the shrouds were reset',
               '{}'::JSONB
        FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune'
        RETURNING id
    )
    INSERT INTO rig_tune_bands (id, version_id, low_kt, high_kt, is_base, shrouds)
    SELECT '40000000-0000-4000-8000-000000000009', v.id, 0, NULL, TRUE,
           '{"V1": {}, "D1": {}, "D2": {}}'::JSONB
    FROM v
    $sql$
);

-- ===========================================================================
-- Rig Tune staleness and minting
-- ===========================================================================
-- 20260915190000_rig_tune_stale_gaps_and_mint.sql (LAY-107): the gaps_stale column and
-- mint_rig_tune_version, the one write path the Rig Tune form has.

SELECT pg_temp.accepts(
    'a band that was not re-measured can be marked stale',
    $sql$
    UPDATE rig_tune_bands SET gaps_stale = TRUE
     WHERE id = '40000000-0000-4000-8000-000000000002'
    $sql$
);

SELECT pg_temp.refuses(
    'the Base Tune''s own Gaps cannot go stale (base_band_gaps_never_stale)',
    $sql$
    UPDATE rig_tune_bands SET gaps_stale = TRUE
     WHERE id = '40000000-0000-4000-8000-000000000001'
    $sql$
);

DO $$
DECLARE
    v_secdef BOOLEAN;
BEGIN
    SELECT p.prosecdef INTO v_secdef
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'mint_rig_tune_version';

    -- The whole point of the function is a transaction, not a privilege: if it ever becomes
    -- SECURITY DEFINER, every RLS check below stops proving anything.
    PERFORM pg_temp.chk(
        'mint_rig_tune_version runs as its caller, not as its owner',
        v_secdef IS FALSE,
        format('prosecdef=%s', COALESCE(v_secdef::TEXT, 'no such function'))
    );
END;
$$;

DO $$
DECLARE
    -- Two bands, both figures on both sides of all three positions. The light band's Gaps were
    -- measured against a base that has since moved, which is what gaps_stale says.
    v_bands JSONB := $j$[
        {"low_kt": 0, "high_kt": 9, "is_base": false, "label": "Light", "gaps_stale": true,
         "note": "flat water, full main",
         "shrouds": {"V1": {"port": {"gap_mm": 70, "turns_from_base": -1},
                            "starboard": {"gap_mm": 70, "turns_from_base": -1}},
                     "D1": {"port": {"gap_mm": 62, "turns_from_base": -1},
                            "starboard": {"gap_mm": 62, "turns_from_base": -1}},
                     "D2": {"port": {"gap_mm": 60, "turns_from_base": -1},
                            "starboard": {"gap_mm": 60, "turns_from_base": -1}}}},
        {"low_kt": 9, "high_kt": null, "is_base": true, "label": "Mac base",
         "shrouds": {"V1": {"port": {"gap_mm": 72, "turns_from_base": 0},
                            "starboard": {"gap_mm": 72, "turns_from_base": 0}},
                     "D1": {"port": {"gap_mm": 64, "turns_from_base": 0},
                            "starboard": {"gap_mm": 64, "turns_from_base": 0}},
                     "D2": {"port": {"gap_mm": 61, "turns_from_base": 0},
                            "starboard": {"gap_mm": 61, "turns_from_base": 0}}}}
    ]$j$::JSONB;
    v_err     TEXT;
    v_id      UUID;
    v_num     INTEGER;
    v_author  UUID;
    v_pointer UUID;
    v_count   INTEGER;
    v_stale   BOOLEAN;
    v_open    INTEGER;
    v_before  INTEGER;
BEGIN
    v_err := pg_temp.exec_as(
        'cccccccc-0000-4000-8000-000000000002',
        format($q$SELECT public.mint_rig_tune_version(
            DATE '2026-09-14', 'crew retuned the rig', %L::JSONB)$q$, v_bands)
    );
    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot mint a Rig Tune Version, function or no function',
        v_err IS NOT NULL,
        COALESCE(v_err, 'the call was accepted')
    );

    -- Asserted through the catalog rather than by calling it as `anon`. On the local stack's
    -- image (PostgreSQL 17.6, Supabase CLI) calling *any* plpgsql function the caller lacks
    -- EXECUTE on terminates the backend rather than raising permission denied -- reproduced
    -- with a three-line function, so it is the build and not this one. The grant is the thing
    -- worth asserting anyway: a guest has no boat screens at all (ADR 0015).
    PERFORM pg_temp.chk(
        'and a guest holds no EXECUTE on it at all (ADR 0015)',
        NOT has_function_privilege(
            'anon', 'public.mint_rig_tune_version(DATE, TEXT, JSONB)', 'EXECUTE'),
        format('authenticated=%s anon=%s',
            has_function_privilege(
                'authenticated', 'public.mint_rig_tune_version(DATE, TEXT, JSONB)', 'EXECUTE'),
            has_function_privilege(
                'anon', 'public.mint_rig_tune_version(DATE, TEXT, JSONB)', 'EXECUTE'))
    );

    SELECT count(*) INTO v_before FROM boat_setup_versions WHERE kind = 'rig_tune';

    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        format($q$SELECT public.mint_rig_tune_version(
            DATE '2026-09-14', 'first tune measured off the boat with a caliper', %L::JSONB)$q$,
            v_bands)
    );
    PERFORM pg_temp.chk('an admin mints a whole Version in one call', v_err IS NULL, v_err);

    SELECT id, version_number, created_by INTO v_id, v_num, v_author
      FROM boat_setup_versions
     WHERE kind = 'rig_tune'
     ORDER BY version_number DESC
     LIMIT 1;

    PERFORM pg_temp.chk(
        'the Version number is allocated inside the call, not sent by the client',
        v_num = v_before + 1,
        format('v%s after %s Versions', v_num, v_before)
    );

    PERFORM pg_temp.chk(
        'the author is the caller''s account, read from the JWT',
        v_author = 'aaaaaaa1-0000-4000-8000-000000000001',
        v_author::TEXT
    );

    SELECT count(*), count(*) FILTER (WHERE high_kt IS NULL)
      INTO v_count, v_open
      FROM rig_tune_bands WHERE version_id = v_id;
    SELECT gaps_stale INTO v_stale
      FROM rig_tune_bands WHERE version_id = v_id AND NOT is_base;

    PERFORM pg_temp.chk(
        'both bands landed, one of them open-topped',
        v_count = 2 AND v_open = 1,
        format('%s bands, %s open', v_count, v_open)
    );

    PERFORM pg_temp.chk(
        'the stale marker the app decided is stored, not recomputed',
        v_stale IS TRUE,
        format('gaps_stale=%s', v_stale)
    );

    SELECT current_version_id INTO v_pointer
      FROM boat_setup_artifacts WHERE kind = 'rig_tune';

    PERFORM pg_temp.chk(
        'and the current pointer moved to it in the same transaction',
        v_pointer = v_id,
        format('pointer=%s minted=%s', v_pointer, v_id)
    );
END;
$$;

DO $$
DECLARE
    v_err    TEXT;
    v_before INTEGER;
    v_after  INTEGER;
BEGIN
    SELECT count(*) INTO v_before FROM boat_setup_versions WHERE kind = 'rig_tune';

    -- The second band is missing D2, which shrouds_positions_present refuses. The Version row
    -- and the first band are written before the database sees it.
    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_rig_tune_version(DATE '2026-09-14', 'half a table', $j$[
            {"low_kt": 0, "high_kt": 9, "is_base": true,
             "shrouds": {"V1": {}, "D1": {}, "D2": {}}},
            {"low_kt": 9, "high_kt": null, "is_base": false,
             "shrouds": {"V1": {}, "D1": {}}}
        ]$j$::JSONB)$q$
    );

    SELECT count(*) INTO v_after FROM boat_setup_versions WHERE kind = 'rig_tune';

    PERFORM pg_temp.chk(
        'one bad band takes the whole Version with it: no half-written table survives',
        v_err IS NOT NULL AND v_after = v_before,
        format('%s; Versions %s -> %s', COALESCE(v_err, 'accepted'), v_before, v_after)
    );

    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_rig_tune_version(DATE '2026-09-14', 'no bands at all', '[]'::JSONB)$q$
    );

    PERFORM pg_temp.chk(
        'a Version with no Wind Bands is refused',
        v_err IS NOT NULL,
        COALESCE(v_err, 'the call was accepted')
    );

    -- Exactly one Base Tune per Version, from the database and not only from the form: the
    -- Turns are counted from the base, so a table with none means nothing and a table with two
    -- means two different things (ADR 0007). Both figures are complete here, so nothing but
    -- the flag can be what is refused.
    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_rig_tune_version(DATE '2026-09-14', 'no base at all', $j$[
            {"low_kt": 0, "high_kt": 9, "is_base": false,
             "shrouds": {"V1": {}, "D1": {}, "D2": {}}},
            {"low_kt": 9, "high_kt": null, "is_base": false,
             "shrouds": {"V1": {}, "D1": {}, "D2": {}}}
        ]$j$::JSONB)$q$
    );

    PERFORM pg_temp.chk(
        'a Version with no Base Tune band is refused',
        v_err IS NOT NULL,
        COALESCE(v_err, 'the call was accepted')
    );

    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_rig_tune_version(DATE '2026-09-14', 'two bases', $j$[
            {"low_kt": 0, "high_kt": 9, "is_base": true,
             "shrouds": {"V1": {}, "D1": {}, "D2": {}}},
            {"low_kt": 9, "high_kt": null, "is_base": true,
             "shrouds": {"V1": {}, "D1": {}, "D2": {}}}
        ]$j$::JSONB)$q$
    );

    PERFORM pg_temp.chk(
        'and a Version with two of them is refused as well',
        v_err IS NOT NULL,
        COALESCE(v_err, 'the call was accepted')
    );
END;
$$;

-- The function finds the artifact by kind alone, which `boats_singleton` makes unambiguous
-- today. That index is documented as "one line to drop when a second boat is real", so this
-- check drops it and asks what the function does on that day: fail, or write the Version to
-- whichever row came back first. The drop and the second boat are both undone by raising out
-- of the block, so nothing after this sees either.
DO $$
DECLARE
    v_err     TEXT;
    v_fixture TEXT;
BEGIN
    BEGIN
        DROP INDEX public.boats_singleton;
        INSERT INTO boats (id, name, model)
        VALUES ('b0a70002-0000-4000-8000-000000000002', 'Second Wind', 'J/109');
        INSERT INTO boat_setup_artifacts (boat_id, kind)
        VALUES ('b0a70002-0000-4000-8000-000000000002', 'rig_tune');

        v_err := pg_temp.exec_as(
            'aaaaaaa1-0000-4000-8000-000000000001',
            $q$SELECT public.mint_rig_tune_version(DATE '2026-09-14', 'whose rig?', $j$[
                {"low_kt": 0, "high_kt": null, "is_base": true,
                 "shrouds": {"V1": {}, "D1": {}, "D2": {}}}
            ]$j$::JSONB)$q$
        );

        -- Unwind the second boat. The verdict is already in v_err, which plpgsql does not
        -- roll back with the subtransaction.
        RAISE EXCEPTION '__undo_second_boat__';
    EXCEPTION WHEN OTHERS THEN
        -- Anything else means the fixture never stood up, so the check has proved nothing and
        -- says so rather than passing on a refusal it did not cause.
        IF SQLERRM <> '__undo_second_boat__' THEN v_fixture := SQLERRM; END IF;
    END;

    PERFORM pg_temp.chk(
        'with two boats'' Rig Tunes visible the call fails rather than picking one',
        v_fixture IS NULL AND v_err IS NOT NULL,
        COALESCE(v_fixture, v_err, 'the call was accepted')
    );
END;
$$;

-- ===========================================================================
-- Calibration events
-- ===========================================================================

SELECT pg_temp.accepts(
    'an autocompensation of {HDG} is accepted (ADR 0005)',
    $sql$
    INSERT INTO calibration_events (artifact_id, occurred_on, type, channels, note, created_by)
    SELECT a.id, DATE '2026-07-04', 'autocompensation', ARRAY['HDG']::calibration_channel[],
           'swung the compass off Navy Pier', 'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.refuses(
    'an autocompensation naming any other channel is refused: it is a compass operation',
    $sql$
    INSERT INTO calibration_events (artifact_id, occurred_on, type, channels, note, created_by)
    SELECT a.id, DATE '2026-07-05', 'autocompensation',
           ARRAY['HDG', 'AWA']::calibration_channel[], 'swung it and tweaked the vane',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.refuses(
    'an event naming no channel at all is refused (channels_non_empty)',
    $sql$
    INSERT INTO calibration_events (artifact_id, occurred_on, type, channels, note, created_by)
    SELECT a.id, DATE '2026-07-06', 'other', ARRAY[]::calibration_channel[],
           'cleaned the paddlewheel', 'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.refuses(
    'an event with no account of itself is refused (note_non_empty)',
    $sql$
    INSERT INTO calibration_events (artifact_id, occurred_on, type, channels, note, created_by)
    SELECT a.id, DATE '2026-07-07', 'other', ARRAY['STW']::calibration_channel[], '   ',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration'
    $sql$
);

SELECT pg_temp.refuses(
    'a calibration event cannot hang off another artifact',
    $sql$
    INSERT INTO calibration_events (artifact_id, occurred_on, type, channels, note, created_by)
    SELECT a.id, DATE '2026-07-08', 'other', ARRAY['STW']::calibration_channel[], 'wrong parent',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boat_setup_artifacts a WHERE a.kind = 'polar'
    $sql$
);

-- ===========================================================================
-- Recordings and the Transcription
-- ===========================================================================

SELECT pg_temp.accepts(
    'a Recording is accepted with a caller-supplied id and the header as recorded',
    $sql$
    INSERT INTO recordings
        (id, filename, content_sha256, source_columns, row_count,
         first_row_time, last_row_time, uploaded_by)
    VALUES ('50000000-0000-4000-8000-000000000001', '07-22-26-beer-can.csv', repeat('d', 64),
            ARRAY['DATE', 'LONGITUDE', 'LATITUDE', 'TWA (calc)', 'AWS (calc)'], 3,
            TIMESTAMP '2026-07-22 18:00:00', TIMESTAMP '2026-07-22 18:02:00',
            'aaaaaaa1-0000-4000-8000-000000000001')
    $sql$
);

SELECT pg_temp.refuses(
    'a Recording with no rows is refused (row_count_positive)',
    $sql$
    INSERT INTO recordings
        (id, filename, content_sha256, source_columns, row_count,
         first_row_time, last_row_time, uploaded_by)
    VALUES (gen_random_uuid(), 'empty.csv', repeat('e', 64), ARRAY['DATE'], 0,
            TIMESTAMP '2026-07-22 18:00:00', TIMESTAMP '2026-07-22 18:00:00',
            'aaaaaaa1-0000-4000-8000-000000000001')
    $sql$
);

SELECT pg_temp.refuses(
    'a Recording with an empty header is refused (source_columns_non_empty)',
    $sql$
    INSERT INTO recordings
        (id, filename, content_sha256, source_columns, row_count,
         first_row_time, last_row_time, uploaded_by)
    VALUES (gen_random_uuid(), 'headerless.csv', repeat('e', 64), ARRAY[]::TEXT[], 1,
            TIMESTAMP '2026-07-22 18:00:00', TIMESTAMP '2026-07-22 18:00:00',
            'aaaaaaa1-0000-4000-8000-000000000001')
    $sql$
);

SELECT pg_temp.refuses(
    'a Recording whose last row precedes its first is refused (row_times_ordered)',
    $sql$
    INSERT INTO recordings
        (id, filename, content_sha256, source_columns, row_count,
         first_row_time, last_row_time, uploaded_by)
    VALUES (gen_random_uuid(), 'backwards.csv', repeat('e', 64), ARRAY['DATE'], 2,
            TIMESTAMP '2026-07-22 18:02:00', TIMESTAMP '2026-07-22 18:00:00',
            'aaaaaaa1-0000-4000-8000-000000000001')
    $sql$
);

SELECT pg_temp.accepts(
    'three Recording Rows are accepted, empty fields left empty',
    $sql$
    INSERT INTO recording_rows
        (recording_id, row_index, date_verbatim, row_time, longitude, latitude, sog, tws,
         ctw, stw, gwd, gws, alarm)
    VALUES
    ('50000000-0000-4000-8000-000000000001', 1, '07/22/2026 18:00:00',
     TIMESTAMP '2026-07-22 18:00:00', -87.5568333333, 41.8528333333, 5.4, 11.2,
     182.0, 5.1, NULL, NULL, 'None'),
    ('50000000-0000-4000-8000-000000000001', 2, '07/22/2026 18:01:00',
     TIMESTAMP '2026-07-22 18:01:00', -87.5570000000, 41.8530000000, 5.6, 11.0,
     NULL, NULL, 190.0, 10.0, 'None'),
    ('50000000-0000-4000-8000-000000000001', 3, '07/22/2026 18:02:00',
     TIMESTAMP '2026-07-22 18:02:00', -87.5572000000, 41.8532000000, 0.0, 10.8,
     181.0, 4.9, 190.0, 10.0, 'None')
    $sql$
);

DO $$
DECLARE
    v_water   BOOLEAN[];
    v_zero    TEXT;
    v_lon     TEXT;
BEGIN
    SELECT array_agg(water_referenced ORDER BY row_index) INTO v_water
    FROM recording_rows WHERE recording_id = '50000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'water_referenced is computed from the row''s own stw and ctw, and only from those',
        v_water = ARRAY[TRUE, FALSE, TRUE],
        v_water::TEXT
    );

    SELECT sog::TEXT INTO v_zero FROM recording_rows
    WHERE recording_id = '50000000-0000-4000-8000-000000000001' AND row_index = 3;
    SELECT longitude::TEXT INTO v_lon FROM recording_rows
    WHERE recording_id = '50000000-0000-4000-8000-000000000001' AND row_index = 1;

    PERFORM pg_temp.chk(
        'bare numeric preserves the scale it was given: 0.0 stays 0.0 and 10 dp stays 10 dp',
        v_zero = '0.0' AND v_lon = '-87.5568333333',
        format('sog=%s longitude=%s', v_zero, v_lon)
    );
END;
$$;

SELECT pg_temp.refuses(
    'a Recording Row cannot be written for a Recording that does not exist',
    $sql$
    INSERT INTO recording_rows (recording_id, row_index, date_verbatim, row_time)
    VALUES (gen_random_uuid(), 1, '07/22/2026 18:00:00', TIMESTAMP '2026-07-22 18:00:00')
    $sql$
);

SELECT pg_temp.refuses(
    'water_referenced cannot be written by hand',
    $sql$
    INSERT INTO recording_rows
        (recording_id, row_index, date_verbatim, row_time, water_referenced)
    VALUES ('50000000-0000-4000-8000-000000000001', 4, '07/22/2026 18:03:00',
            TIMESTAMP '2026-07-22 18:03:00', TRUE)
    $sql$
);

-- ===========================================================================
-- Races
-- ===========================================================================

SELECT pg_temp.accepts(
    'a Race over a window containing rows is accepted, with its Rig Tune band and its chart',
    $sql$
    INSERT INTO races
        (id, boat_id, recording_id, title, window_start, window_finish,
         polar_version_id, crossover_chart_version_id, rig_tune_version_id, rig_tune_band_id,
         created_by)
    SELECT '60000000-0000-4000-8000-000000000001', b.id,
           '50000000-0000-4000-8000-000000000001', 'Beer can',
           TIMESTAMP '2026-07-22 18:00:30', TIMESTAMP '2026-07-22 18:01:30',
           '10000000-0000-4000-8000-000000000001',
           '11000000-0000-4000-8000-000000000001',
           '30000000-0000-4000-8000-000000000001',
           '40000000-0000-4000-8000-000000000002',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

SELECT pg_temp.refuses(
    'a Race window with finish <= start is refused (race_window_ordered)',
    $sql$
    INSERT INTO races (boat_id, recording_id, window_start, window_finish, created_by)
    SELECT b.id, '50000000-0000-4000-8000-000000000001',
           TIMESTAMP '2026-07-22 18:01:00', TIMESTAMP '2026-07-22 18:01:00',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

-- A second Recording, with its single row a month later. It stands unraced for the next two
-- checks, because a window that misses the data has to be attempted against a Recording that
-- has no Race yet: attempted against the first one, the UNIQUE on recording_id would refuse
-- it first and the check would pass without ever reaching the trigger.
SELECT pg_temp.accepts(
    'a second Recording and its single row are accepted',
    $sql$
    WITH r AS (
        INSERT INTO recordings
            (id, filename, content_sha256, source_columns, row_count,
             first_row_time, last_row_time, uploaded_by)
        VALUES ('50000000-0000-4000-8000-000000000002', '08-22-26-glr.csv', repeat('f', 64),
                ARRAY['DATE', 'LONGITUDE', 'LATITUDE'], 1,
                TIMESTAMP '2026-08-22 11:00:00', TIMESTAMP '2026-08-22 11:00:00',
                'aaaaaaa1-0000-4000-8000-000000000001')
        RETURNING id
    )
    INSERT INTO recording_rows (recording_id, row_index, date_verbatim, row_time)
    SELECT r.id, 1, '08/22/2026 11:00:00', TIMESTAMP '2026-08-22 11:00:00' FROM r
    $sql$
);

SELECT pg_temp.refuses(
    'a Race window containing no Recording Rows is refused (ADR 0009)',
    $sql$
    INSERT INTO races (boat_id, recording_id, window_start, window_finish, created_by)
    SELECT b.id, '50000000-0000-4000-8000-000000000002',
           TIMESTAMP '2026-07-23 09:00:00', TIMESTAMP '2026-07-23 10:00:00',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

SELECT pg_temp.refuses(
    'and one that ends the instant before the only row is refused too: the bound is inclusive',
    $sql$
    INSERT INTO races (boat_id, recording_id, window_start, window_finish, created_by)
    SELECT b.id, '50000000-0000-4000-8000-000000000002',
           TIMESTAMP '2026-08-22 10:00:00', TIMESTAMP '2026-08-22 10:59:59',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

SELECT pg_temp.refuses(
    'and an amendment cannot walk the window off the data either',
    $sql$
    UPDATE races SET window_start = TIMESTAMP '2026-07-23 09:00:00',
                     window_finish = TIMESTAMP '2026-07-23 10:00:00'
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.accepts(
    'a window reaching past the last row is legal: the recording dropped out, the race did not',
    $sql$
    UPDATE races SET window_finish = TIMESTAMP '2026-07-22 18:21:15'
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'a Wind Band cannot be recorded without its Rig Tune Version (band_requires_rig_tune)',
    $sql$
    UPDATE races SET rig_tune_version_id = NULL
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'a Wind Band belonging to another Rig Tune Version is refused',
    $sql$
    UPDATE races SET rig_tune_band_id = '40000000-0000-4000-8000-000000000009'
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

-- The same refusal at the insert, which is the form LAY-113 asks to see: a Race is filed naming
-- Rig Tune Version 1 and Version 2's only band, and never lands. It is not the amendment path that
-- has to be watertight, it is the pair itself -- the composite key is what makes a band unable to
-- migrate across Versions, and nothing in the wizard is trusted to have checked.
SELECT pg_temp.refuses(
    'and a Race cannot be filed with a foreign band in the first place',
    $sql$
    INSERT INTO races
        (boat_id, recording_id, window_start, window_finish,
         rig_tune_version_id, rig_tune_band_id, created_by)
    SELECT b.id, '50000000-0000-4000-8000-000000000002',
           TIMESTAMP '2026-08-22 10:59:00', TIMESTAMP '2026-08-22 11:01:00',
           '30000000-0000-4000-8000-000000000001',
           '40000000-0000-4000-8000-000000000009',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

SELECT pg_temp.refuses(
    'a Version pointer of the wrong kind is refused (the constant tag columns)',
    $sql$
    UPDATE races SET polar_version_id = '30000000-0000-4000-8000-000000000001'
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'a second Race over the same Recording is refused, which is what makes the delete safe',
    $sql$
    INSERT INTO races (boat_id, recording_id, window_start, window_finish, created_by)
    SELECT b.id, '50000000-0000-4000-8000-000000000001',
           TIMESTAMP '2026-07-22 18:00:00', TIMESTAMP '2026-07-22 18:02:00',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

-- Now race the second Recording, so the touch triggers can be shown to touch the right Race.
-- Its window opens a minute before the only row and closes 30 min after it, which is the
-- 08-22-26-glr shape: the recording dropped out well before the finish.
SELECT pg_temp.accepts(
    'a second Race over the second Recording is accepted',
    $sql$
    INSERT INTO races (id, boat_id, recording_id, window_start, window_finish, created_by)
    SELECT '60000000-0000-4000-8000-000000000002', b.id,
           '50000000-0000-4000-8000-000000000002',
           TIMESTAMP '2026-08-22 10:59:00', TIMESTAMP '2026-08-22 11:30:00',
           'aaaaaaa1-0000-4000-8000-000000000001'
    FROM boats b
    $sql$
);

-- ===========================================================================
-- Annotations, and the touch triggers that carry an Amendment's provenance
-- ===========================================================================

-- A Sail Configuration names a Sail Definition of the Crossover Chart Version its own Race
-- points at (ADR 0023). Race 1 points at crossover v1, which numbers 1, 2 and 3; v2 numbers 1
-- and 4. Race 2 records no chart Version at all, which is the state that makes "no Configuration
-- without a Version" worth attacking.

SELECT pg_temp.refuses(
    'a Sail Configuration that says nothing is refused (sail_entry_says_something)',
    $sql$
    INSERT INTO race_sail_entries (race_id, crossover_chart_version_id, at)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 17:55:00')
    $sql$
);

SELECT pg_temp.accepts(
    'a Sail Configuration set before the start is accepted: `at` is unbounded by the window',
    $sql$
    INSERT INTO race_sail_entries
        (id, race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('70000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001',
            TIMESTAMP '2026-07-22 17:55:00', 1)
    $sql$
);

SELECT pg_temp.accepts(
    'and so is one the sailor could only put in words: a note is Testimony, not a gap',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number, note)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001',
            TIMESTAMP '2026-07-22 18:00:45', NULL, 'jib change, nobody wrote down which')
    $sql$
);

SELECT pg_temp.refuses(
    'a note of nothing but spaces is not a note (sail_entry_note_non_empty)',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number, note)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001',
            TIMESTAMP '2026-07-22 18:01:00', NULL, '   ')
    $sql$
);

SELECT pg_temp.refuses(
    'a Definition number belonging to another Version is refused: sail 4 is v2''s, not v1''s',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 18:02:00', 4)
    $sql$
);

SELECT pg_temp.refuses(
    'and an entry whose Version disagrees with its Race''s own pointer is refused',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000002', TIMESTAMP '2026-07-22 18:03:00', 1)
    $sql$
);

-- Race 2 records no Crossover Chart Version, so there is no vocabulary to name a sail in. Both
-- ways of trying are refused: a Version its Race does not record fails the composite key, and
-- naming no Version at all fails NOT NULL.
SELECT pg_temp.refuses(
    'a Race with no chart Version can hold no Sail Configurations',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('60000000-0000-4000-8000-000000000002',
            '11000000-0000-4000-8000-000000000001', TIMESTAMP '2026-08-22 11:00:00', 1)
    $sql$
);

SELECT pg_temp.refuses(
    'and not by leaving the Version off either',
    $sql$
    INSERT INTO race_sail_entries (race_id, at, definition_number)
    VALUES ('60000000-0000-4000-8000-000000000002', TIMESTAMP '2026-08-22 11:00:00', 1)
    $sql$
);

SELECT pg_temp.refuses(
    'two Configurations at the same instant are refused',
    $sql$
    INSERT INTO race_sail_entries
        (race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 17:55:00', 2)
    $sql$
);

SELECT pg_temp.refuses(
    'a Sail Definition that has been flown cannot be deleted out from under it',
    $sql$
    DELETE FROM crossover_sail_definitions
    WHERE version_id = '11000000-0000-4000-8000-000000000001' AND number = 1
    $sql$
);

DO $$
DECLARE
    v_before_1 TID;
    v_after_1  TID;
    v_before_2 TID;
    v_after_2  TID;
BEGIN
    -- NOW() is frozen for the transaction, so a touched updated_at cannot be seen by its
    -- value. The row's ctid changes when and only when the row is rewritten, which is the
    -- thing being asserted: an Amendment that never writes to `races` still moves it.
    SELECT ctid INTO v_before_1 FROM races WHERE id = '60000000-0000-4000-8000-000000000001';
    SELECT ctid INTO v_before_2 FROM races WHERE id = '60000000-0000-4000-8000-000000000002';

    UPDATE race_sail_entries SET note = 'kite up late, the halyard was fouled'
    WHERE id = '70000000-0000-4000-8000-000000000001';

    SELECT ctid INTO v_after_1 FROM races WHERE id = '60000000-0000-4000-8000-000000000001';
    SELECT ctid INTO v_after_2 FROM races WHERE id = '60000000-0000-4000-8000-000000000002';

    PERFORM pg_temp.chk(
        'amending a Sail Configuration touches the Race it belongs to',
        v_after_1 <> v_before_1,
        format('%s -> %s', v_before_1, v_after_1)
    );
    PERFORM pg_temp.chk(
        'and touches no other Race',
        v_after_2 = v_before_2,
        format('%s -> %s', v_before_2, v_after_2)
    );
END;
$$;

DO $$
DECLARE
    v_before TID;
    v_after  TID;
BEGIN
    SELECT ctid INTO v_before FROM races WHERE id = '60000000-0000-4000-8000-000000000001';

    INSERT INTO race_sea_state_entries (race_id, at, sea_state)
    VALUES ('60000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 18:00:00', 'moderate');

    SELECT ctid INTO v_after FROM races WHERE id = '60000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'recording a sea state touches its Race',
        v_after <> v_before,
        format('%s -> %s', v_before, v_after)
    );
END;
$$;

DO $$
DECLARE
    v_before TID;
    v_after  TID;
BEGIN
    SELECT ctid INTO v_before FROM races WHERE id = '60000000-0000-4000-8000-000000000001';

    DELETE FROM race_sea_state_entries
    WHERE race_id = '60000000-0000-4000-8000-000000000001';

    SELECT ctid INTO v_after FROM races WHERE id = '60000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'and so does taking one back',
        v_after <> v_before,
        format('%s -> %s', v_before, v_after)
    );
END;
$$;

-- ===========================================================================
-- Repointing a Race at another Crossover Chart Version
-- ===========================================================================
-- The pointer stays changeable (ADR 0012), but Definition numbers do not span Versions, so the
-- Configurations named against the old one cannot come along. ON UPDATE RESTRICT is what makes
-- that unavoidable rather than remembered, and repoint_race_crossover_chart is the way through:
-- it refuses unless the caller states the number of Configurations actually standing, so the
-- sailor is told what will go before it goes.

SELECT pg_temp.refuses(
    'a Race cannot be repointed at another chart Version while its Configurations stand',
    $sql$
    UPDATE races SET crossover_chart_version_id = '11000000-0000-4000-8000-000000000002'
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

SELECT pg_temp.refuses(
    'and its chart Version cannot simply be cleared either',
    $sql$
    UPDATE races SET crossover_chart_version_id = NULL
    WHERE id = '60000000-0000-4000-8000-000000000001'
    $sql$
);

DO $$
DECLARE
    v_standing BIGINT;
    v_err      TEXT;
    v_cleared  TEXT;
    v_pointer  UUID;
    v_left     BIGINT;
BEGIN
    SELECT count(*) INTO v_standing FROM race_sail_entries
     WHERE race_id = '60000000-0000-4000-8000-000000000001';

    -- A count nobody was told is a count nobody agreed to. The Testimony this would delete is
    -- not recoverable from anything, so a disagreement is a refusal.
    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        format($q$SELECT public.repoint_race_crossover_chart(
                      '60000000-0000-4000-8000-000000000001'::UUID,
                      '11000000-0000-4000-8000-000000000002'::UUID, %s)$q$, v_standing + 1)
    );

    SELECT crossover_chart_version_id INTO v_pointer FROM races
     WHERE id = '60000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO v_left FROM race_sail_entries
     WHERE race_id = '60000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'a repoint agreed for the wrong number of Configurations is refused, and clears none',
        COALESCE(
            v_err IS NOT NULL
            AND v_pointer = '11000000-0000-4000-8000-000000000001'
            AND v_left = v_standing,
            FALSE
        ),
        format('err=%s pointer=%s standing=%s left=%s', COALESCE(v_err, '-'),
               COALESCE(v_pointer::TEXT, '-'), v_standing, v_left)
    );

    SELECT val, err INTO v_cleared, v_err FROM pg_temp.value_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        format($q$SELECT public.repoint_race_crossover_chart(
                      '60000000-0000-4000-8000-000000000001'::UUID,
                      '11000000-0000-4000-8000-000000000002'::UUID, %s)$q$, v_standing)
    );

    SELECT crossover_chart_version_id INTO v_pointer FROM races
     WHERE id = '60000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO v_left FROM race_sail_entries
     WHERE race_id = '60000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'the agreed repoint clears exactly those Configurations and moves the pointer, in one act',
        COALESCE(
            v_err IS NULL AND v_cleared = v_standing::TEXT
            AND v_pointer = '11000000-0000-4000-8000-000000000002'
            AND v_left = 0,
            FALSE
        ),
        format('err=%s cleared=%s expected=%s pointer=%s left=%s', COALESCE(v_err, '-'),
               COALESCE(v_cleared, '-'), v_standing,
               COALESCE(v_pointer::TEXT, '-'), v_left)
    );
END;
$$;

DO $$
DECLARE v_err TEXT;
BEGIN
    v_err := pg_temp.exec_as(
        'cccccccc-0000-4000-8000-000000000002',
        $q$SELECT public.repoint_race_crossover_chart(
               '60000000-0000-4000-8000-000000000001'::UUID, NULL, 0)$q$
    );

    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot repoint a Race at all',
        COALESCE(
            v_err IS NOT NULL
            AND (SELECT crossover_chart_version_id FROM races
                  WHERE id = '60000000-0000-4000-8000-000000000001')
                = '11000000-0000-4000-8000-000000000002',
            FALSE
        ),
        COALESCE(v_err, 'expected a refusal; the call was accepted')
    );
END;
$$;

-- Named in the new vocabulary, which is the only one this Race now has. It also leaves a
-- Configuration standing for the cascade check at the end of the suite.
SELECT pg_temp.accepts(
    'and a Configuration in the new Version''s numbering is accepted afterwards',
    $sql$
    INSERT INTO race_sail_entries
        (id, race_id, crossover_chart_version_id, at, definition_number)
    VALUES ('70000000-0000-4000-8000-000000000002',
            '60000000-0000-4000-8000-000000000001',
            '11000000-0000-4000-8000-000000000002',
            TIMESTAMP '2026-07-22 18:00:30', 4)
    $sql$
);

-- ===========================================================================
-- Read tiers
-- ===========================================================================

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries'
    ];
    t          TEXT;
    v_n        BIGINT;
    v_err      TEXT;
    v_leaked   TEXT[];
    v_errored  TEXT[];
    v_hidden   TEXT[];
    v_true     BIGINT;
BEGIN
    FOREACH t IN ARRAY v_tables LOOP
        SELECT n, err INTO v_n, v_err FROM pg_temp.count_as(NULL, t);
        IF v_err IS NOT NULL THEN
            v_errored := array_append(v_errored, t || ': ' || v_err);
        ELSIF v_n <> 0 THEN
            v_leaked := array_append(v_leaked, t || '=' || v_n);
        END IF;
    END LOOP;

    PERFORM pg_temp.chk(
        'a guest request returns zero rows rather than an error, on every table',
        v_errored IS NULL AND v_leaked IS NULL,
        format('errors: %s leaked: %s', COALESCE(v_errored::TEXT, '-'),
               COALESCE(v_leaked::TEXT, '-'))
    );

    FOREACH t IN ARRAY v_tables LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_true;
        SELECT n, err INTO v_n, v_err FROM pg_temp.count_as(
            'cccccccc-0000-4000-8000-000000000002', t);
        IF v_err IS NOT NULL OR v_n <> v_true THEN
            v_hidden := array_append(
                v_hidden, format('%s: saw %s of %s %s', t, v_n, v_true, COALESCE(v_err, '')));
        END IF;
    END LOOP;

    PERFORM pg_temp.chk(
        'a viewer reads every table in full: Role governs writes only (ADR 0019, LAY-95 q5)',
        v_hidden IS NULL,
        COALESCE(v_hidden::TEXT, '-')
    );
END;
$$;

DO $$
DECLARE
    v_crew  TEXT;
    v_admin TEXT;
BEGIN
    v_crew := pg_temp.exec_as('cccccccc-0000-4000-8000-000000000002',
        $q$UPDATE races SET title = 'crew was here' WHERE id = '60000000-0000-4000-8000-000000000001'$q$);
    -- An UPDATE filtered out by a policy is not an error: it matches no rows. Both forms
    -- count as a refusal, so the check is on the effect.
    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot amend a Race',
        NOT EXISTS (SELECT 1 FROM races WHERE title = 'crew was here'),
        COALESCE(v_crew, 'no error raised; the UPDATE matched no rows')
    );

    v_crew := pg_temp.exec_as('cccccccc-0000-4000-8000-000000000002',
        $q$INSERT INTO race_sea_state_entries (race_id, at, sea_state)
           VALUES ('60000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 18:05:00', 'calm')$q$);
    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot annotate a Race',
        v_crew IS NOT NULL,
        COALESCE(v_crew, 'the INSERT was accepted')
    );

    v_crew := pg_temp.exec_as('cccccccc-0000-4000-8000-000000000002',
        $q$INSERT INTO recording_rows (recording_id, row_index, date_verbatim, row_time)
           VALUES ('50000000-0000-4000-8000-000000000001', 9, '07/22/2026 18:09:00',
                   TIMESTAMP '2026-07-22 18:09:00')$q$);
    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot add to a Transcription',
        v_crew IS NOT NULL,
        COALESCE(v_crew, 'the INSERT was accepted')
    );

    v_admin := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$UPDATE races SET title = 'Beer can, race 3' WHERE id = '60000000-0000-4000-8000-000000000001'$q$);
    PERFORM pg_temp.chk(
        'an admin can amend a Race',
        v_admin IS NULL
            AND EXISTS (SELECT 1 FROM races WHERE title = 'Beer can, race 3'),
        COALESCE(v_admin, 'accepted')
    );

    v_admin := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$INSERT INTO race_sea_state_entries (race_id, at, sea_state)
           VALUES ('60000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 18:06:00', 'slight')$q$);
    PERFORM pg_temp.chk(
        'an admin can annotate a Race',
        v_admin IS NULL,
        COALESCE(v_admin, 'accepted')
    );
END;
$$;

DO $$
DECLARE
    v_err TEXT;
BEGIN
    v_err := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$UPDATE recording_rows SET tws = 99 WHERE recording_id = '50000000-0000-4000-8000-000000000001'$q$);
    PERFORM pg_temp.chk(
        'not even an admin can rewrite a Recording Row: there is no UPDATE policy',
        NOT EXISTS (SELECT 1 FROM recording_rows WHERE tws = 99),
        COALESCE(v_err, 'no error raised; the UPDATE matched no rows')
    );

    v_err := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$DELETE FROM recording_rows WHERE recording_id = '50000000-0000-4000-8000-000000000001'$q$);
    PERFORM pg_temp.chk(
        'nor delete one: there is no DELETE policy either',
        (SELECT count(*) FROM recording_rows
         WHERE recording_id = '50000000-0000-4000-8000-000000000001') = 3,
        COALESCE(v_err, 'no error raised; the DELETE matched no rows')
    );

    v_err := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$DELETE FROM boat_setup_versions WHERE id = '10000000-0000-4000-8000-000000000001'$q$);
    PERFORM pg_temp.chk(
        'nor delete a Boat Setup Version: it is superseded, never removed',
        EXISTS (SELECT 1 FROM boat_setup_versions
                WHERE id = '10000000-0000-4000-8000-000000000001'),
        COALESCE(v_err, 'no error raised; the DELETE matched no rows')
    );
END;
$$;

-- ===========================================================================
-- The policies themselves
-- ===========================================================================

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'crossover_sail_definitions', 'calibration_events', 'recordings', 'recording_rows',
        'races', 'race_sail_entries', 'race_sea_state_entries'
    ];
    v_bad TEXT[];
BEGIN
    SELECT array_agg(tablename || ' / ' || policyname || ' -> ' || roles::TEXT) INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (v_tables)
      AND roles <> ARRAY['authenticated']::NAME[];

    PERFORM pg_temp.chk(
        'every policy is TO authenticated, so the planner never evaluates it for a guest',
        v_bad IS NULL,
        COALESCE(v_bad::TEXT, '-')
    );

    SELECT array_agg(tablename || ' / ' || policyname) INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (v_tables)
      AND cmd <> 'SELECT'
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%SELECT is_admin()%';

    PERFORM pg_temp.chk(
        'every write policy wraps the admin test as (SELECT public.is_admin())',
        v_bad IS NULL,
        COALESCE(v_bad::TEXT, '-')
    );

    SELECT array_agg(tablename || ' / ' || policyname) INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (v_tables)
      AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%profiles%';

    PERFORM pg_temp.chk(
        'and none re-derives it as an inline subquery on profiles',
        v_bad IS NULL,
        COALESCE(v_bad::TEXT, '-')
    );

    SELECT array_agg(policyname || ' (' || cmd || ')') INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recording_rows'
      AND cmd IN ('UPDATE', 'DELETE', 'ALL');

    PERFORM pg_temp.chk(
        'recording_rows has no UPDATE, DELETE or FOR ALL policy at all',
        v_bad IS NULL,
        COALESCE(v_bad::TEXT, '-')
    );

    SELECT array_agg(policyname || ' (' || cmd || ')') INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'boat_setup_versions'
      AND cmd IN ('DELETE', 'ALL');

    PERFORM pg_temp.chk(
        'boat_setup_versions has no DELETE or FOR ALL policy',
        v_bad IS NULL,
        COALESCE(v_bad::TEXT, '-')
    );
END;
$$;

-- ===========================================================================
-- Minting a Version through public.mint_boat_setup_version
-- ===========================================================================
-- The insert and the pointer move are one function call because supabase-js has no way to open
-- a transaction; 20260915210000_mint_boat_setup_version.sql says why at length. Every check
-- here goes through a request, because the function is SECURITY INVOKER and so the request is
-- the whole of its authority.
--
-- The polar artifact arrives here with Versions on it and the pointer on the newest, and the
-- crossover_chart artifact with none at all — which is the other case worth having: the first
-- Version of an artifact, whose pointer moves from NULL.
--
-- What the next number should be is read off the table rather than written in, so that adding a
-- fixture Version above does not turn these into failures about the fixtures.

DO $$
DECLARE
    v_number  TEXT;
    v_err     TEXT;
    v_row     RECORD;
    v_next    INT;
BEGIN
    SELECT COALESCE(max(v.version_number), 0) + 1 INTO v_next
      FROM boat_setup_versions v
      JOIN boat_setup_artifacts a ON a.id = v.artifact_id
     WHERE a.kind = 'polar';

    SELECT val, err INTO v_number, v_err FROM pg_temp.value_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_boat_setup_version(
               '10000000-0000-4000-8000-000000000003'::UUID,
               'polar',
               DATE '2026-07-01',
               '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.4]]}'::JSONB,
               '   ',
               'Beneteau10R-v3.pol',
               repeat('d', 64)
           )$q$
    );

    PERFORM pg_temp.chk(
        'an admin mints the next Version through the function, and is told its number',
        COALESCE(v_err IS NULL AND v_number = v_next::TEXT, FALSE),
        format('number=%s expected=%s err=%s',
               COALESCE(v_number, '-'), v_next, COALESCE(v_err, '-'))
    );

    SELECT v.version_number, v.created_by, v.note, v.filename, v.content_sha256,
           a.current_version_id
      INTO v_row
      FROM boat_setup_versions v
      JOIN boat_setup_artifacts a ON a.id = v.artifact_id
     WHERE v.id = '10000000-0000-4000-8000-000000000003';

    PERFORM pg_temp.chk(
        'the number it reports is the number it wrote, and the pointer is on that Version',
        -- COALESCE because a missing row makes every comparison NULL, and the verdict column
        -- is NOT NULL: a FAIL is wanted here, not an error that abandons the rest of the suite.
        COALESCE(
            v_row.version_number = v_next
            AND v_row.current_version_id = '10000000-0000-4000-8000-000000000003',
            FALSE
        ),
        format('number=%s pointer=%s',
               COALESCE(v_row.version_number::TEXT, '-'),
               COALESCE(v_row.current_version_id::TEXT, '-'))
    );

    PERFORM pg_temp.chk(
        'the author is the session''s, which is not one of the arguments (ADR 0018)',
        COALESCE(v_row.created_by = 'aaaaaaa1-0000-4000-8000-000000000001', FALSE),
        COALESCE(v_row.created_by::TEXT, '-')
    );

    PERFORM pg_temp.chk(
        'a note of nothing but spaces is stored as no note',
        v_row.note IS NULL,
        format('note=%s', COALESCE(quote_literal(v_row.note), 'NULL'))
    );

    PERFORM pg_temp.chk(
        'the filename and the hash are carried through verbatim',
        COALESCE(
            v_row.filename = 'Beneteau10R-v3.pol' AND v_row.content_sha256 = repeat('d', 64),
            FALSE
        ),
        format('filename=%s hash=%s',
               COALESCE(v_row.filename, '-'), COALESCE(v_row.content_sha256, '-'))
    );
END;
$$;

DO $$
DECLARE
    v_number TEXT;
    v_err    TEXT;
    v_ptr    UUID;
    v_next   INT;
BEGIN
    SELECT COALESCE(max(v.version_number), 0) + 1 INTO v_next
      FROM boat_setup_versions v
      JOIN boat_setup_artifacts a ON a.id = v.artifact_id
     WHERE a.kind = 'polar';

    SELECT val, err INTO v_number, v_err FROM pg_temp.value_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_boat_setup_version(
               '10000000-0000-4000-8000-000000000004'::UUID,
               'polar',
               DATE '2026-08-01',
               '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.5]]}'::JSONB,
               'measured on the delivery',
               'Beneteau10R-v4.pol',
               repeat('e', 64)
           )$q$
    );

    SELECT current_version_id INTO v_ptr FROM boat_setup_artifacts WHERE kind = 'polar';

    PERFORM pg_temp.chk(
        'a second upload mints the next number and carries the pointer forward again',
        COALESCE(
            v_err IS NULL AND v_number = v_next::TEXT
            AND v_ptr = '10000000-0000-4000-8000-000000000004',
            FALSE
        ),
        format('number=%s expected=%s pointer=%s err=%s',
               COALESCE(v_number, '-'), v_next,
               COALESCE(v_ptr::TEXT, '-'), COALESCE(v_err, '-'))
    );

    PERFORM pg_temp.chk(
        'and the superseded Version is still there, its own grid and file intact',
        EXISTS (
            SELECT 1 FROM boat_setup_versions
            WHERE id = '10000000-0000-4000-8000-000000000003'
              AND filename = 'Beneteau10R-v3.pol'
              AND payload = '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[3.4]]}'::JSONB
        ),
        NULL
    );
END;
$$;

-- Backwards is refused by boat_setup_artifacts_forward_only_current, which the pointer section
-- above already exercises. The function does not re-implement that check, so there is nothing
-- new to assert here: any backwards move it could make would be refused by that trigger.

DO $$
DECLARE
    v_number TEXT;
    v_err    TEXT;
    v_ptr    UUID;
    v_next   INT;
    v_defs   TEXT;
    v_kept   JSONB;
BEGIN
    -- The crossover_chart artifact reaches here with two fixture Versions on it and its pointer
    -- still on nothing, which is the case worth having beside the polar one: a pointer moving
    -- from NULL.
    SELECT COALESCE(max(v.version_number), 0) + 1 INTO v_next
      FROM boat_setup_versions v
      JOIN boat_setup_artifacts a ON a.id = v.artifact_id
     WHERE a.kind = 'crossover_chart';

    PERFORM pg_temp.chk(
        'the crossover_chart artifact starts this section pointing at nothing',
        (SELECT current_version_id FROM boat_setup_artifacts WHERE kind = 'crossover_chart')
            IS NULL,
        NULL
    );

    SELECT val, err INTO v_number, v_err FROM pg_temp.value_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_boat_setup_version(
               '11000000-0000-4000-8000-000000000003'::UUID,
               'crossover_chart',
               DATE '2026-07-01',
               '{"twa_axis": [40], "tws_axis": [6], "cells": [[5]],
                 "sail_definitions": [{"number": 5, "label": "Main + Code 0"},
                                      {"number": 6, "label": "Main reefed alone"}]}'::JSONB,
               NULL,
               'Handsome_Pete_crossover_v3.csv',
               repeat('f', 64)
           )$q$
    );

    SELECT current_version_id INTO v_ptr
    FROM boat_setup_artifacts WHERE kind = 'crossover_chart';

    PERFORM pg_temp.chk(
        'the same function mints the next Version of another artifact, and moves its pointer off NULL',
        COALESCE(
            v_err IS NULL AND v_number = v_next::TEXT
            AND v_ptr = '11000000-0000-4000-8000-000000000003',
            FALSE
        ),
        format('number=%s expected=%s pointer=%s err=%s', COALESCE(v_number, '-'), v_next,
               COALESCE(v_ptr::TEXT, '-'), COALESCE(v_err, '-'))
    );

    -- The projection, out of the same parse and inside the same transaction as the payload: the
    -- rows a Sail Configuration points at cannot be written apart from the payload they came
    -- from (ADR 0023).
    SELECT string_agg(number || '=' || label, ', ' ORDER BY number) INTO v_defs
      FROM crossover_sail_definitions
     WHERE version_id = '11000000-0000-4000-8000-000000000003';

    PERFORM pg_temp.chk(
        'and it projects that Version''s Sail Definitions into rows as it goes',
        COALESCE(v_defs = '5=Main + Code 0, 6=Main reefed alone', FALSE),
        format('definitions: %s', COALESCE(v_defs, '-'))
    );

    SELECT payload->'sail_definitions' INTO v_kept
      FROM boat_setup_versions WHERE id = '11000000-0000-4000-8000-000000000003';

    PERFORM pg_temp.chk(
        'while the payload keeps its own copy untouched: the file said this',
        COALESCE(
            v_kept = '[{"number": 5, "label": "Main + Code 0"},
                       {"number": 6, "label": "Main reefed alone"}]'::JSONB,
            FALSE
        ),
        format('payload sail_definitions: %s', COALESCE(v_kept::TEXT, '-'))
    );
END;
$$;

DO $$
DECLARE v_err TEXT;
BEGIN
    -- A chart whose cells resolve against nothing is not a chart. payload_keys_present cannot see
    -- this -- the key is there -- so the minting function is where it is caught, and it is caught
    -- before the Version row lands rather than after.
    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_boat_setup_version(
               '11000000-0000-4000-8000-000000000009'::UUID,
               'crossover_chart', DATE '2026-07-02',
               '{"twa_axis": [40], "tws_axis": [6], "cells": [[5]], "sail_definitions": []}'::JSONB,
               NULL, 'no_sails.csv', repeat('8', 64)
           )$q$
    );

    PERFORM pg_temp.chk(
        'a Crossover Chart Version defining no sails at all is refused',
        COALESCE(
            v_err IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM boat_setup_versions
                WHERE id = '11000000-0000-4000-8000-000000000009'
            ),
            FALSE
        ),
        COALESCE(v_err, 'expected a refusal; the call was accepted')
    );
END;
$$;

DO $$
DECLARE
    v_err TEXT;
BEGIN
    -- The function validates no payload of its own: the CHECK on the table is the floor under
    -- the Zod schema, and being SECURITY INVOKER means the function cannot get out from under it.
    v_err := pg_temp.exec_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        $q$SELECT public.mint_boat_setup_version(
               '10000000-0000-4000-8000-000000000009'::UUID,
               'polar', DATE '2026-09-01', '{}'::JSONB, NULL, 'empty.pol', repeat('9', 64)
           )$q$
    );

    PERFORM pg_temp.chk(
        'a payload with no axes is refused through the function exactly as it is directly',
        v_err IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM boat_setup_versions WHERE id = '10000000-0000-4000-8000-000000000009'
        ),
        COALESCE(v_err, 'expected a refusal; the call was accepted')
    );
END;
$$;

DO $$
DECLARE
    v_err   TEXT;
    v_ptr   UUID;
    v_guest INTEGER;   -- never read: see the guest check at the end of this block
BEGIN
    v_err := pg_temp.exec_as(
        'cccccccc-0000-4000-8000-000000000002',
        $q$SELECT public.mint_boat_setup_version(
               '10000000-0000-4000-8000-00000000000a'::UUID,
               'polar', DATE '2026-09-01',
               '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[9.9]]}'::JSONB,
               NULL, 'crew.pol', repeat('1', 64)
           )$q$
    );

    SELECT current_version_id INTO v_ptr FROM boat_setup_artifacts WHERE kind = 'polar';

    PERFORM pg_temp.chk(
        'a signed-in non-admin is refused, and leaves the pointer where it was',
        COALESCE(
            v_err IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM boat_setup_versions
                WHERE id = '10000000-0000-4000-8000-00000000000a'
            )
            AND v_ptr = '10000000-0000-4000-8000-000000000004',
            FALSE
        ),
        COALESCE(v_err, 'expected a refusal; the call was accepted')
    );

    -- A guest has no EXECUTE at all, so the refusal comes from the grant rather than from the
    -- policies: the function is not a way around `TO authenticated`.
    --
    -- Written out here rather than through `pg_temp.exec_as`, and it has to be. That helper runs
    -- its statement with `EXECUTE`, and PostgreSQL 17.6 **terminates the backend** on a dynamic
    -- call to a function the caller may not execute -- so routing this check through the helper
    -- kills the database instead of failing it, and the check can never pass. Assigning the
    -- return value raises a catchable `permission denied for function` instead. `PERFORM` is not
    -- a substitute: it crashes exactly as `EXECUTE` does, so the result has to be assigned
    -- somewhere even though nothing reads it.
    -- docs/testing/race-upload-transaction.md records the reduction to an empty function body;
    -- scripts/verify-race-upload-rpc.sql's section 1 is the same check written the same way.
    PERFORM pg_temp.act_as(NULL);
    v_err := NULL;
    BEGIN
        v_guest := public.mint_boat_setup_version(
            '10000000-0000-4000-8000-00000000000b'::UUID,
            'polar', DATE '2026-09-01',
            '{"twa_axis": [30], "tws_axis": [4], "boat_speed": [[9.9]]}'::JSONB,
            NULL, 'guest.pol', repeat('2', 64)
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk(
        'a guest cannot execute it at all',
        COALESCE(v_err LIKE '%permission denied for function%', FALSE),
        COALESCE(v_err, 'expected a refusal; the call was accepted')
    );
END;
$$;

-- ===========================================================================
-- Deleting a Race, which is expressed against its Recording
-- ===========================================================================
-- Last, because it takes the fixtures with it.

DO $$
DECLARE
    v_err   TEXT;
    v_rows  BIGINT;
    v_races BIGINT;
    v_ann   BIGINT;
BEGIN
    v_err := pg_temp.exec_as('cccccccc-0000-4000-8000-000000000002',
        $q$DELETE FROM recordings WHERE id = '50000000-0000-4000-8000-000000000001'$q$);
    PERFORM pg_temp.chk(
        'a signed-in non-admin cannot delete a Recording',
        EXISTS (SELECT 1 FROM recordings WHERE id = '50000000-0000-4000-8000-000000000001'),
        COALESCE(v_err, 'no error raised; the DELETE matched no rows')
    );

    v_err := pg_temp.exec_as('aaaaaaa1-0000-4000-8000-000000000001',
        $q$DELETE FROM recordings WHERE id = '50000000-0000-4000-8000-000000000001'$q$);

    SELECT count(*) INTO v_rows FROM recording_rows
    WHERE recording_id = '50000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO v_races FROM races
    WHERE recording_id = '50000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO v_ann FROM race_sail_entries
    WHERE race_id = '60000000-0000-4000-8000-000000000001';
    PERFORM pg_temp.chk(
        'an admin deleting the Recording takes its Race, its annotations and its Transcription',
        v_err IS NULL AND v_rows = 0 AND v_races = 0 AND v_ann = 0,
        format('err=%s rows=%s races=%s entries=%s',
               COALESCE(v_err, '-'), v_rows, v_races, v_ann)
    );

    PERFORM pg_temp.chk(
        'so immutability by absent policy does not block the one delete that is allowed',
        v_rows = 0,
        'referential actions are not subject to RLS'
    );

    PERFORM pg_temp.chk(
        'and the other Race is untouched',
        EXISTS (SELECT 1 FROM races WHERE id = '60000000-0000-4000-8000-000000000002'),
        NULL
    );
END;
$$;

SELECT pg_temp.refuses(
    'the boat cannot be deleted while its artifacts and races stand',
    $sql$DELETE FROM boats WHERE name = 'Handsome Pete'$sql$
);

SELECT pg_temp.refuses(
    'and the author of a Version cannot be deleted either',
    $sql$DELETE FROM auth.users WHERE id = 'aaaaaaa1-0000-4000-8000-000000000001'$sql$
);

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== race archive and Boat Setup schema ==='

SELECT n,
       CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result,
       name,
       left(regexp_replace(COALESCE(detail, ''), '\s+', ' ', 'g'), 78) AS detail
FROM _results
ORDER BY n;

SELECT count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) AS total
FROM _results;

DO $$
DECLARE v_failed BIGINT;
BEGIN
    SELECT count(*) INTO v_failed FROM _results WHERE NOT ok;
    IF v_failed > 0 THEN
        RAISE EXCEPTION '% check(s) failed', v_failed;
    END IF;
END;
$$;

ROLLBACK;

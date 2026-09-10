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

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- Fixed UUIDs so a failure message points at something nameable.
--
--   admin  aaaaaaa1  an admin profile
--   crew   cccccccc  a signed-in user whose profile.role is NULL -- the tier LAY-95 settled
--   P1/P2  polar Versions 1 and 2
--   R1/R2  rig_tune Versions 1 and 2, with bands
--   C1     instrument_calibration Version 1
--   REC1   a Recording with three rows; REC2 a second Recording with one

INSERT INTO auth.users (id, email) VALUES
    ('aaaaaaa1-0000-4000-8000-000000000001', 'admin@layline.test'),
    ('cccccccc-0000-4000-8000-000000000002', 'crew@layline.test');

INSERT INTO profiles (id, user_id, role) VALUES
    ('aaaaaaa1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001', 'admin'),
    ('cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', NULL);

-- ===========================================================================
-- Shape: what the migration is, before anything is written to it
-- ===========================================================================

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries'
    ];
    v_missing TEXT[];
    v_unprotected TEXT[];
BEGIN
    SELECT array_agg(t) INTO v_missing
    FROM unnest(v_tables) AS t
    WHERE to_regclass('public.' || t) IS NULL;

    PERFORM pg_temp.chk(
        'all twelve archive and Boat Setup tables exist',
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
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries')
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
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries');

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
    v_sails   BIGINT;
    v_arts    BIGINT;
    v_pointed BIGINT;
    v_other   BIGINT;
BEGIN
    SELECT count(*) INTO v_boats FROM boats WHERE name = 'Handsome Pete' AND model = 'Beneteau 10R';
    SELECT count(*) INTO v_sails FROM sails;
    SELECT count(*) INTO v_arts FROM boat_setup_artifacts;
    SELECT count(*) INTO v_pointed FROM boat_setup_artifacts WHERE current_version_id IS NOT NULL;
    SELECT (SELECT count(*) FROM boat_setup_versions) + (SELECT count(*) FROM rig_tune_bands)
         + (SELECT count(*) FROM calibration_events) + (SELECT count(*) FROM recordings)
         + (SELECT count(*) FROM races)
      INTO v_other;

    PERFORM pg_temp.chk(
        'the migration seeds one boat, six sails and four unpointed artifacts',
        v_boats = 1 AND v_sails = 6 AND v_arts = 4 AND v_pointed = 0,
        format('boat=%s sails=%s artifacts=%s pointed=%s', v_boats, v_sails, v_arts, v_pointed)
    );

    PERFORM pg_temp.chk(
        'and seeds no race data at all: the archive is entered by hand through the UI',
        v_other = 0,
        format('rows in versions/bands/events/recordings/races: %s', v_other)
    );
END;
$$;

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries'
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
    'a Race over a window containing rows is accepted, with its Rig Tune band',
    $sql$
    INSERT INTO races
        (id, boat_id, recording_id, title, window_start, window_finish,
         polar_version_id, rig_tune_version_id, rig_tune_band_id, created_by)
    SELECT '60000000-0000-4000-8000-000000000001', b.id,
           '50000000-0000-4000-8000-000000000001', 'Beer can',
           TIMESTAMP '2026-07-22 18:00:30', TIMESTAMP '2026-07-22 18:01:30',
           '10000000-0000-4000-8000-000000000001',
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

SELECT pg_temp.refuses(
    'a Sail Configuration naming no sails is refused: bare poles is a bug',
    $sql$
    INSERT INTO race_sail_entries (race_id, at, reef)
    VALUES ('60000000-0000-4000-8000-000000000001', TIMESTAMP '2026-07-22 17:55:00', 'full')
    $sql$
);

SELECT pg_temp.accepts(
    'a Sail Configuration set before the start is accepted: `at` is unbounded by the window',
    $sql$
    WITH e AS (
        INSERT INTO race_sail_entries (id, race_id, at, reef)
        VALUES ('70000000-0000-4000-8000-000000000001',
                '60000000-0000-4000-8000-000000000001',
                TIMESTAMP '2026-07-22 17:55:00', 'full')
        RETURNING id
    )
    INSERT INTO race_sail_entry_sails (entry_id, sail_id)
    SELECT e.id, s.id FROM e, sails s WHERE s.key IN ('main', 'jib-1')
    $sql$
);

SELECT pg_temp.refuses(
    'the same sail cannot appear twice in one configuration: it is a set',
    $sql$
    INSERT INTO race_sail_entry_sails (entry_id, sail_id)
    SELECT '70000000-0000-4000-8000-000000000001', s.id FROM sails s WHERE s.key = 'main'
    $sql$
);

SELECT pg_temp.refuses(
    'two entries at the same instant are refused',
    $sql$
    WITH e AS (
        INSERT INTO race_sail_entries (race_id, at, reef)
        VALUES ('60000000-0000-4000-8000-000000000001',
                TIMESTAMP '2026-07-22 17:55:00', 'reef-1')
        RETURNING id
    )
    INSERT INTO race_sail_entry_sails (entry_id, sail_id)
    SELECT e.id, s.id FROM e, sails s WHERE s.key = 'main'
    $sql$
);

SELECT pg_temp.refuses(
    'a sail that has been flown cannot be deleted, only retired',
    $sql$DELETE FROM sails WHERE key = 'main'$sql$
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

    INSERT INTO race_sail_entry_sails (entry_id, sail_id)
    SELECT '70000000-0000-4000-8000-000000000001', s.id FROM sails s WHERE s.key = 'A2';

    SELECT ctid INTO v_after_1 FROM races WHERE id = '60000000-0000-4000-8000-000000000001';
    SELECT ctid INTO v_after_2 FROM races WHERE id = '60000000-0000-4000-8000-000000000002';

    PERFORM pg_temp.chk(
        'adding a sail through the join table touches the Race it belongs to',
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
-- Read tiers
-- ===========================================================================

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries'
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
        'a signed-in user whose profile.role is NULL reads every table in full (LAY-95 q5)',
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
        'boats', 'sails', 'boat_setup_artifacts', 'boat_setup_versions', 'rig_tune_bands',
        'calibration_events', 'recordings', 'recording_rows', 'races', 'race_sail_entries',
        'race_sail_entry_sails', 'race_sea_state_entries'
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
-- Deleting a Race, which is expressed against its Recording
-- ===========================================================================
-- Last, because it takes the fixtures with it.

DO $$
DECLARE
    v_err   TEXT;
    v_rows  BIGINT;
    v_races BIGINT;
    v_ann   BIGINT;
    v_join  BIGINT;
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
    SELECT count(*) INTO v_join FROM race_sail_entry_sails
    WHERE entry_id = '70000000-0000-4000-8000-000000000001';

    PERFORM pg_temp.chk(
        'an admin deleting the Recording takes its Race, its annotations and its Transcription',
        v_err IS NULL AND v_rows = 0 AND v_races = 0 AND v_ann = 0 AND v_join = 0,
        format('err=%s rows=%s races=%s entries=%s join=%s',
               COALESCE(v_err, '-'), v_rows, v_races, v_ann, v_join)
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

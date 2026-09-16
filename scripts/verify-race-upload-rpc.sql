-- Verification suite for public.create_race_from_upload -- LAY-110's one transaction.
--
-- The ticket's ninth acceptance criterion is a claim no Jest test can reach: "the Recording,
-- its Transcription and the Race are written in one transaction, after the bytes have moved;
-- a failure leaves bytes and no row, never a row and no bytes". The bytes half is
-- scripts/verify-boat-storage.mjs. This is the row half: that the three inserts are one
-- transaction, that the two Race Window refusals still fire through the function, that a
-- viewer is refused by RLS rather than by a check restated inside it, and -- the quiet one --
-- that a Transcription's text values survive the NUMERIC round trip byte for byte, because
-- the function is where they are cast.
--
-- Run it with scripts/verify-race-upload-rpc.sh, which points psql at either the local stack
-- or a hosted project.
--
-- SAFE AGAINST A LIVE PROJECT. Everything happens inside one transaction that ends in
-- ROLLBACK. The Recordings, Races and two auth users it creates exist only for the length of
-- the run, and a crash aborts the transaction, which has the same effect.
--
-- Two mechanics, both inherited from scripts/verify-race-archive-schema.sql, which this suite
-- deliberately mirrors so the two read as one body of work:
--
--   * The suite never commits, so a deferred constraint trigger would never fire and every
--     deferred refusal would look like a pass. The helpers call SET CONSTRAINTS ALL IMMEDIATE
--     to make them fire at the statement instead. races_window_intersects_rows is deferred,
--     so this is what makes section 6, the window with no rows inside it, mean anything.
--   * The RLS tiers are exercised with SET LOCAL ROLE plus a request.jwt.claims setting, which
--     is what auth.uid() reads -- and therefore also what the function writes into
--     recordings.uploaded_by and races.created_by.

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

-- Become a request: `anon` for a guest, `authenticated` with a sub claim for a signed-in user.
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

-- Call the function as somebody. Returns the new race id, or NULL with the message in `err`.
--
-- Every call goes through a subtransaction, which is what lets one suite watch both the
-- successes and the all-or-nothing rollbacks: a failed call unwinds to the savepoint and
-- leaves the fixtures standing, exactly as a failed RPC leaves the archive standing.
--
-- The two annotation arrays default to empty, because most of what this suite asserts is about
-- the Recording and the Race and an empty list is the ordinary case: it means that kind was not
-- recorded (ADR 0010). Section 9 is where they carry something.
CREATE FUNCTION pg_temp.upload_as(
    p_uid       UUID,
    p_recording JSONB,
    p_rows      JSONB,
    p_race      JSONB,
    p_sails     JSONB DEFAULT '[]'::JSONB,
    p_sea_state JSONB DEFAULT '[]'::JSONB,
    OUT race_id UUID,
    OUT err     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        race_id := public.create_race_from_upload(
            p_recording, p_rows, p_race, p_sails, p_sea_state);
        -- The window-intersects-rows trigger is deferred to COMMIT and this suite never
        -- commits, so it is made to fire here instead.
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
        err := SQLERRM;
        race_id := NULL;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
    IF err IS NULL THEN
        SET CONSTRAINTS ALL DEFERRED;
    END IF;
END;
$$;

-- Amend a Race's five Boat Setup answers as somebody. Returns the number of Sail Configurations
-- cleared, or NULL with the message in `err`.
--
-- Same subtransaction shape as `upload_as`, and for the same reason: an amendment that is refused
-- has to leave the Race exactly as it stood, and this suite watches both outcomes in one run.
CREATE FUNCTION pg_temp.amend_as(
    p_uid      UUID,
    p_race_id  UUID,
    p_setup    JSONB,
    p_clearing INTEGER DEFAULT 0,
    OUT cleared INTEGER,
    OUT err     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        cleared := public.amend_race_boat_setup(p_race_id, p_setup, p_clearing);
        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION WHEN OTHERS THEN
        err := SQLERRM;
        cleared := NULL;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
    IF err IS NULL THEN
        SET CONSTRAINTS ALL DEFERRED;
    END IF;
END;
$$;

-- The five keys, as a payload with every pointer unrecorded. Amendments below build on this with
-- `||`, which is also how the function's own "all five keys or nothing" rule is easiest to respect:
-- an absent key reads as NULL and would clear a pointer nobody meant to clear.
CREATE FUNCTION pg_temp.nothing_recorded()
RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
    SELECT jsonb_build_object(
        'polar_version_id', NULL,
        'crossover_chart_version_id', NULL,
        'rig_tune_version_id', NULL,
        'instrument_calibration_version_id', NULL,
        'rig_tune_band_id', NULL
    )
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- The Profile trigger (20260911213000) makes a Profile per auth user, defaulting to viewer, so
-- these two inserts are all it takes to get both tiers.

INSERT INTO auth.users (id, email) VALUES
    ('aaaaaaa1-0000-4000-8000-000000000001', 'admin@layline.test'),
    ('cccccccc-0000-4000-8000-000000000002', 'crew@layline.test');

UPDATE profiles SET role = 'admin'
 WHERE id = 'aaaaaaa1-0000-4000-8000-000000000001';

-- A five-row Transcription at the archive's own 30-second cadence and its own value shapes.
--
-- The values are chosen to be the ones a round trip loses: `0.0` is not `0`, `20.10` is not
-- `20.1`, `-1` is an angle and not a missing value, and an empty channel is NULL and not zero.
-- Every one of them is text on the way in, because that is how Layline transcribes a recording
-- (types/index.ts), and the function is where they are cast.
--
-- `-0.0` is deliberately not among them. NUMERIC has one zero and it is positive, so `-0.0`
-- reads back as `0.0` and no cast can save it -- which is why the parser refuses a file
-- containing one outright (qtvlm.ts, NEGATIVE_ZERO) rather than storing a value it could not
-- reproduce. That refusal is the reason this suite can assert byte-for-byte equality at all,
-- and it is checked below rather than assumed.
CREATE TEMP VIEW _fixture AS
SELECT
    'ffffffff-0000-4000-8000-00000000f001'::UUID AS recording_id,
    jsonb_build_object(
        'id', 'ffffffff-0000-4000-8000-00000000f001',
        'filename', '06-03-26-beer-can.csv',
        'content_sha256', repeat('a', 64),
        'source_columns', jsonb_build_array(
            'Date', 'Longitude', 'Latitude', 'COG', 'SOG', 'TWD', 'TWS', 'TWA',
            'TWA (calc)', 'AWA (calc)', 'AWS (calc)', 'STW', 'CTW', 'ALARM'
        ),
        'date_order', 'MDY',
        'trailing_newline', TRUE,
        'row_count', 5,
        'first_row_time', '2026-06-03T19:00:00',
        'last_row_time', '2026-06-03T19:02:00'
    ) AS recording,
    jsonb_build_array(
        jsonb_build_object(
            'row_index', 1, 'date_verbatim', '06/03/2026 19:00:00',
            'row_time', '2026-06-03T19:00:00',
            'longitude', '-87.5568333300', 'latitude', '41.8528333300',
            'cog', '0.0', 'sog', '20.10', 'twa', '-45.5', 'tws', '11.4',
            'stw', '6.0', 'ctw', '12.0', 'awa_calc', '38.0', 'alarm', 'None'
        ),
        jsonb_build_object(
            'row_index', 2, 'date_verbatim', '06/03/2026 19:00:30',
            'row_time', '2026-06-03T19:00:30',
            'longitude', '-87.5568400000', 'latitude', '41.8528400000',
            'cog', '0', 'sog', '0.0', 'twa', '0.0', 'tws', '11.5',
            'stw', NULL, 'ctw', NULL, 'awa_calc', '40.0', 'alarm', 'None'
        ),
        jsonb_build_object(
            'row_index', 3, 'date_verbatim', '06/03/2026 19:01:00',
            'row_time', '2026-06-03T19:01:00',
            'longitude', '-87.5568500000', 'latitude', '41.8528500000',
            'cog', '10.5', 'sog', '6.2', 'twa', '-1', 'tws', NULL,
            'stw', '6.1', 'ctw', '13.0', 'awa_calc', NULL, 'alarm', 'None'
        ),
        jsonb_build_object(
            'row_index', 4, 'date_verbatim', '06/03/2026 19:01:30',
            'row_time', '2026-06-03T19:01:30',
            'longitude', '-87.5568600000', 'latitude', '41.8528600000',
            'cog', '11.0', 'sog', '6.3', 'twa', '45.0', 'tws', '11.9',
            'stw', '6.2', 'ctw', '14.0', 'awa_calc', '41.0', 'alarm', 'None'
        ),
        jsonb_build_object(
            'row_index', 5, 'date_verbatim', '06/03/2026 19:02:00',
            'row_time', '2026-06-03T19:02:00',
            'longitude', '-87.5568700000', 'latitude', '41.8528700000',
            'cog', '11.5', 'sog', '6.4', 'twa', '46.0', 'tws', '12.0',
            'stw', '6.3', 'ctw', '15.0', 'awa_calc', '42.0', 'alarm', 'None'
        )
    ) AS rows,
    jsonb_build_object(
        'title', '  Wednesday beer can  ',
        'window_start', '2026-06-03T19:00:00',
        'window_finish', '2026-06-03T19:02:00'
    ) AS race;

-- Two Crossover Chart Versions, because a Sail Configuration names a Sail Definition of one of
-- them and of no other (ADR 0023). The fixture race above carries no chart pointer at all, which
-- is the ordinary state for every section but the ninth: NULL means not recorded (ADR 0012), and
-- a Race like that can hold no Configurations.
--
-- The numbering across the pair is deliberately not shared: v1 numbers 1, 2 and 3, v2 numbers 1
-- and 4. So "sail 4" is a real sail of the boat and still a thing a Race pointing at v1 must not
-- be able to record, which is the refusal section 9 goes after.
--
-- Inserted directly rather than through mint_boat_setup_version -- that function has its own
-- suite (scripts/verify-race-archive-schema.sql) and what is under test here is the upload.
INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by,
     filename, content_sha256, payload)
SELECT '11000000-0000-4000-8000-00000000c001', a.id, 'crossover_chart', 1,
       DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'Handsome_Pete_crossover.csv', repeat('1', 64),
       '{"twa_axis": [40], "tws_axis": [6], "cells": [[1]],
         "sail_definitions": [{"number": 1, "label": "Main + Jib 1"},
                              {"number": 2, "label": "Main reefed + Jib 3"},
                              {"number": 3, "label": "Main + A2"}]}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'crossover_chart';

INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by,
     filename, content_sha256, payload)
SELECT '11000000-0000-4000-8000-00000000c002', a.id, 'crossover_chart', 2,
       DATE '2026-06-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'Handsome_Pete_crossover_v2.csv', repeat('2', 64),
       '{"twa_axis": [40], "tws_axis": [6], "cells": [[1]],
         "sail_definitions": [{"number": 1, "label": "Main + Jib 1"},
                              {"number": 4, "label": "Main + A3"}]}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'crossover_chart';

INSERT INTO crossover_sail_definitions (version_id, number, label) VALUES
    ('11000000-0000-4000-8000-00000000c001', 1, 'Main + Jib 1'),
    ('11000000-0000-4000-8000-00000000c001', 2, 'Main reefed + Jib 3'),
    ('11000000-0000-4000-8000-00000000c001', 3, 'Main + A2'),
    ('11000000-0000-4000-8000-00000000c002', 1, 'Main + Jib 1'),
    ('11000000-0000-4000-8000-00000000c002', 4, 'Main + A3');

-- The other three kinds, for the three pointers LAY-113 taught the function to write. One Polar
-- and one Instrument Calibration are enough -- what matters about them is that the pointer lands
-- and that the wrong kind is refused -- but there are *two* Rig Tunes, because everything
-- interesting about the Wind Band is about a band belonging to one Version and not the other.
INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by,
     filename, content_sha256, payload)
SELECT '12000000-0000-4000-8000-0000000000a1', a.id, 'polar', 1,
       DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'Handsome_Pete.pol', repeat('3', 64),
       '{"twa_axis": [40], "tws_axis": [6], "boat_speed": [[5.1]]}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'polar';

-- No filename on either of the next two: file_backed_kinds_only says exactly the two file-backed
-- kinds carry one, and a Rig Tune has never been a file for this boat (ADR 0007).
INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by, note, payload)
SELECT '13000000-0000-4000-8000-0000000000d1', a.id, 'rig_tune', 1,
       DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'base tune off the North guide, headstay is not adjustable', '{}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune';

INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by, note, payload)
SELECT '13000000-0000-4000-8000-0000000000d2', a.id, 'rig_tune', 2,
       DATE '2026-06-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'retuned after the shrouds were reset', '{}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'rig_tune';

INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by, payload)
SELECT '14000000-0000-4000-8000-0000000000c1', a.id, 'instrument_calibration', 1,
       DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       '{"AWA": 0, "AWS": 1.0, "STW": 1.0, "HDG": 0}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'instrument_calibration';

-- Three bands on Rig Tune v1 and one on v2. `...b2` is the 8-15 kt band the sections below record,
-- and `...e1` is v2's -- a real band of this boat, and still one a Race pointing at v1 must not be
-- able to record. That pair is what `(rig_tune_version_id, rig_tune_band_id)` exists for.
INSERT INTO rig_tune_bands (id, version_id, low_kt, high_kt, is_base, label, shrouds) VALUES
    ('15000000-0000-4000-8000-0000000000b1', '13000000-0000-4000-8000-0000000000d1',
     0, 8, FALSE, 'light', '{"V1": {}, "D1": {}, "D2": {}}'::JSONB),
    ('15000000-0000-4000-8000-0000000000b2', '13000000-0000-4000-8000-0000000000d1',
     8, 15, TRUE, 'medium', '{"V1": {}, "D1": {}, "D2": {}}'::JSONB),
    ('15000000-0000-4000-8000-0000000000b3', '13000000-0000-4000-8000-0000000000d1',
     15, NULL, FALSE, 'heavy', '{"V1": {}, "D1": {}, "D2": {}}'::JSONB),
    ('15000000-0000-4000-8000-0000000000e1', '13000000-0000-4000-8000-0000000000d2',
     0, NULL, TRUE, 'one band, retuned', '{"V1": {}, "D1": {}, "D2": {}}'::JSONB);

-- ===========================================================================
-- 1. The door: a guest cannot call it at all
-- ===========================================================================
-- The guest's call is written out here rather than made through pg_temp.upload_as, and written
-- as a plain call rather than an EXECUTE, and both departures are deliberate. Reductions for
-- the two observations behind them are in docs/testing/race-upload-transaction.md:
--
--   * EXECUTE on a function is checked when a statement is planned, and plpgsql caches a
--     statement's plan for the session -- so pg_temp.upload_as, once it has planned that call
--     as somebody who may make it, lets a guest straight past the door on every later call.
--     Observed: the guest reached the body and came back with the function's own complaint
--     about a missing boat. A DO block is planned afresh every time it runs, so the door is
--     really tried here.
--   * The call is not dynamic, because on PostgreSQL 17.6 an `EXECUTE 'SELECT f(...)'` by a
--     role without EXECUTE on f terminates the backend, where the same call written plainly
--     raises `permission denied for function f`. It reduces to two lines against a function
--     with an empty body, so it is the server's, not this schema's -- and nothing the running
--     application does goes near it: Layline never calls this function dynamically, and `anon`
--     never calls it at all.
--
-- The two catalog checks beside it say the same thing without calling anything, so the claim
-- does not rest on either subtlety.

DO $$
DECLARE
    f     RECORD;
    v_err TEXT;
    v_id  UUID;
BEGIN
    PERFORM pg_temp.chk(
        'a guest holds no EXECUTE on the function',
        NOT has_function_privilege('anon',
            'public.create_race_from_upload(jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'),
        NULL
    );
    PERFORM pg_temp.chk(
        'and any signed-in user does, RLS being what decides the rest',
        has_function_privilege('authenticated',
            'public.create_race_from_upload(jsonb,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'),
        NULL
    );

    SELECT * INTO f FROM _fixture;
    PERFORM pg_temp.act_as(NULL);
    BEGIN
        v_id := public.create_race_from_upload(
            jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f003"'),
            f.rows, f.race, '[]'::JSONB, '[]'::JSONB
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk('a guest cannot even call it', v_id IS NULL AND v_err IS NOT NULL, v_err);
    -- Postgres grants EXECUTE to PUBLIC on a new function and Supabase's defaults grant it to
    -- `anon` by name, so without the REVOKE in the migration naming both, a guest reaches the
    -- body and is refused by something internal instead.
    PERFORM pg_temp.chk('and is refused at the door rather than inside the body',
        v_err ILIKE '%permission denied%', v_err);
END;
$$;

-- ===========================================================================
-- 2. An admin's upload writes all three, and writes them as recorded
-- ===========================================================================

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_rows    BIGINT;
    v_title   TEXT;
    v_by      UUID;
BEGIN
    SELECT * INTO f FROM _fixture;
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as('aaaaaaa1-0000-4000-8000-000000000001', f.recording, f.rows, f.race);

    PERFORM pg_temp.chk('an admin''s upload is accepted and returns the new race id',
        v_race_id IS NOT NULL, COALESCE(v_err, v_race_id::TEXT));

    SELECT count(*) INTO v_rows FROM recording_rows WHERE recording_id = f.recording_id;
    PERFORM pg_temp.chk('the whole Transcription is there -- five rows, one statement',
        v_rows = 5, format('%s rows', v_rows));

    SELECT title INTO v_title FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('the title is trimmed, and an empty one would be NULL rather than ''''',
        v_title = 'Wednesday beer can', format('%L', v_title));

    SELECT uploaded_by INTO v_by FROM recordings WHERE id = f.recording_id;
    PERFORM pg_temp.chk('uploaded_by is the caller, not a value the client supplied',
        v_by = 'aaaaaaa1-0000-4000-8000-000000000001', v_by::TEXT);

    SELECT created_by INTO v_by FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('created_by likewise',
        v_by = 'aaaaaaa1-0000-4000-8000-000000000001', v_by::TEXT);

    PERFORM pg_temp.chk('the race hangs off the one boat, read from the singleton rather than passed in',
        (SELECT boat_id FROM races WHERE id = v_race_id) = (SELECT id FROM boats LIMIT 1));
END;
$$;

-- ===========================================================================
-- 3. The values survive the NUMERIC round trip byte for byte
-- ===========================================================================
-- This is the check the function exists to be worth: Layline transcribes every channel as text
-- precisely because 0.0, -0.0 and 20.10 are one JavaScript number, and NUMERIC is the only
-- Postgres type that gives back the scale it was handed. If a cast in the function ever became
-- ::FLOAT or ::REAL, every assertion below breaks and the archive quietly stops round-tripping.

DO $$
DECLARE
    f RECORD;
    v_bad TEXT[];
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT array_agg(format('row %s %s: wrote %L, read %L', row_index, channel, wrote, read))
      INTO v_bad
      FROM (
        SELECT r.row_index, x.channel, x.wrote, x.read
          FROM recording_rows r
          CROSS JOIN LATERAL (VALUES
              ('longitude', (f.rows -> (r.row_index - 1) ->> 'longitude'), r.longitude::TEXT),
              ('latitude',  (f.rows -> (r.row_index - 1) ->> 'latitude'),  r.latitude::TEXT),
              ('cog',       (f.rows -> (r.row_index - 1) ->> 'cog'),       r.cog::TEXT),
              ('sog',       (f.rows -> (r.row_index - 1) ->> 'sog'),       r.sog::TEXT),
              ('tws',       (f.rows -> (r.row_index - 1) ->> 'tws'),       r.tws::TEXT),
              ('twa',       (f.rows -> (r.row_index - 1) ->> 'twa'),       r.twa::TEXT),
              ('stw',       (f.rows -> (r.row_index - 1) ->> 'stw'),       r.stw::TEXT),
              ('ctw',       (f.rows -> (r.row_index - 1) ->> 'ctw'),       r.ctw::TEXT),
              ('awa_calc',  (f.rows -> (r.row_index - 1) ->> 'awa_calc'),  r.awa_calc::TEXT)
          ) AS x(channel, wrote, read)
         WHERE r.recording_id = f.recording_id
           AND x.wrote IS DISTINCT FROM x.read
      ) AS mismatched;

    PERFORM pg_temp.chk(
        'every channel reads back exactly as it was written -- 0, 0.0, 20.10 and -1 included',
        v_bad IS NULL,
        COALESCE(array_to_string(v_bad, '; '), 'every value identical')
    );

    -- The one form that cannot survive, and the reason the parser refuses a file containing it
    -- instead of leaving this suite to discover it after the bytes had moved.
    PERFORM pg_temp.chk(
        'NUMERIC has one zero and it is positive, which is why qtvlm.ts refuses -0.0 upstream',
        ('-0.0'::NUMERIC)::TEXT = '0.0',
        format('%L', ('-0.0'::NUMERIC)::TEXT)
    );

    PERFORM pg_temp.chk('a blank channel is NULL and not zero',
        (SELECT stw IS NULL AND ctw IS NULL AND tws IS NOT NULL
           FROM recording_rows WHERE recording_id = f.recording_id AND row_index = 2));

    PERFORM pg_temp.chk('water_referenced is generated from the row''s own values',
        (SELECT array_agg(water_referenced ORDER BY row_index)
           FROM recording_rows WHERE recording_id = f.recording_id)
        = ARRAY[TRUE, FALSE, TRUE, TRUE, TRUE]);

    PERFORM pg_temp.chk('the window is stored in the recording''s own naive frame, unconverted',
        (SELECT window_start::TEXT FROM races WHERE recording_id = f.recording_id)
        = '2026-06-03 19:00:00');
END;
$$;

-- ===========================================================================
-- 4. A viewer is refused, and refused by RLS
-- ===========================================================================

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_left    BIGINT;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'cccccccc-0000-4000-8000-000000000002',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f002"'),
        f.rows, f.race
      );

    PERFORM pg_temp.chk('a signed-in non-admin cannot upload a race', v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk(
        'and it is the row-level policy that says so, not a check restated in the function',
        v_err ILIKE '%row-level security%', v_err
    );

    SELECT count(*) INTO v_left FROM recordings
     WHERE id = 'ffffffff-0000-4000-8000-00000000f002';
    PERFORM pg_temp.chk('the refused upload left no Recording behind', v_left = 0,
        format('%s recordings', v_left));
END;
$$;

-- ===========================================================================
-- 5. The first Race Window refusal, through the function
-- ===========================================================================

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_left    BIGINT;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f004"'),
        f.rows,
        f.race || jsonb_build_object(
            'window_start', '2026-06-03T19:02:00', 'window_finish', '2026-06-03T19:00:00')
      );

    PERFORM pg_temp.chk('a finish before the start is refused', v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('by race_window_ordered, the CHECK that has always said so',
        v_err ILIKE '%race_window_ordered%', v_err);

    SELECT count(*) INTO v_left FROM recording_rows
     WHERE recording_id = 'ffffffff-0000-4000-8000-00000000f004';
    PERFORM pg_temp.chk(
        'and the Transcription it had already inserted went with it -- one transaction, not three',
        v_left = 0, format('%s rows survived', v_left));
END;
$$;

DO $$
DECLARE
    f RECORD;
    v_err TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;
    SELECT err INTO v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f005"'),
        f.rows,
        f.race || jsonb_build_object(
            'window_start', '2026-06-03T19:01:00', 'window_finish', '2026-06-03T19:01:00')
      );

    PERFORM pg_temp.chk('a zero-length window is refused too -- the CHECK is strictly greater',
        v_err ILIKE '%race_window_ordered%', v_err);
END;
$$;

-- ===========================================================================
-- 6. The second Race Window refusal, and the legal case beside it
-- ===========================================================================

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_left    BIGINT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- Ordered, an hour long, and nothing recorded inside it.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f006"'),
        f.rows,
        f.race || jsonb_build_object(
            'window_start', '2026-06-03T21:00:00', 'window_finish', '2026-06-03T22:00:00')
      );

    PERFORM pg_temp.chk('a window with no Recording Rows in it is refused', v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('by the deferred trigger, in the words the trigger uses',
        v_err = 'the Race Window contains no Recording Rows', v_err);

    SELECT count(*) INTO v_left FROM recordings
     WHERE id = 'ffffffff-0000-4000-8000-00000000f006';
    PERFORM pg_temp.chk('and nothing of that upload survived either', v_left = 0,
        format('%s recordings', v_left));
END;
$$;

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- 08-22-26-glr's shape: the logger stopped 19.25 minutes before the race was over.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f007"'),
        f.rows,
        f.race || jsonb_build_object(
            'window_start', '2026-06-03T19:00:00', 'window_finish', '2026-06-03T19:21:15')
      );

    PERFORM pg_temp.chk(
        'a window reaching past the last row is accepted -- the recording dropped out, the race did not',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));
END;
$$;

-- ===========================================================================
-- 7. A truncated payload is refused rather than stored short
-- ===========================================================================
-- The Transcription is immutable: there is no UPDATE policy on recording_rows and no way to
-- add the missing rows later. So a payload that lost rows in transit has to be refused at the
-- door, and row_count -- a fact about the file, written from the same parse -- is what catches it.

DO $$
DECLARE
    f RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f008"'),
        -- Three of the five rows arrive.
        jsonb_build_array(f.rows -> 0, f.rows -> 1, f.rows -> 2),
        f.race
      );

    PERFORM pg_temp.chk('a Transcription short of its own row_count is refused',
        v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('and the refusal says how short', v_err LIKE '%3 rows%5%', v_err);
END;
$$;

-- ===========================================================================
-- 8. One Recording, one Race
-- ===========================================================================

DO $$
DECLARE
    f RECORD;
    v_err TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- The same recording id again: the id is client-generated, so this is the collision a
    -- retry after a partial failure would cause.
    SELECT err INTO v_err
      FROM pg_temp.upload_as('aaaaaaa1-0000-4000-8000-000000000001', f.recording, f.rows, f.race);

    PERFORM pg_temp.chk('the same recording id cannot be uploaded twice', v_err IS NOT NULL, v_err);

    PERFORM pg_temp.chk('the first upload''s race is untouched by the failed retry',
        (SELECT count(*) FROM races WHERE recording_id = f.recording_id) = 1);
END;
$$;

DO $$
DECLARE
    f RECORD;
    v_err TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A second file with the same bytes. ADR 0009 makes a duplicate hash a confirmation and
    -- never a refusal, so the database must not have an opinion about it.
    SELECT err INTO v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f009"'),
        f.rows, f.race
      );

    PERFORM pg_temp.chk(
        'a duplicate content hash is accepted -- it is a confirmation in the UI, not a refusal here',
        v_err IS NULL, COALESCE(v_err, 'accepted'));
END;
$$;

-- ===========================================================================
-- 9. The sailor's Testimony, in the same transaction
-- ===========================================================================
-- LAY-111's half of the function, as LAY-130 left it. An Annotation is Testimony (ADR 0008): the
-- sailor's answer and nobody else's, so what matters here is that all of it is written or none of
-- it is, that the refusals are the database's own, and that an empty list is not a failure.
--
-- A Sail Configuration now names one Sail Definition of the Crossover Chart Version its Race
-- points at (ADR 0023), so the chart pointer travels on `p_race` and every entry is written
-- against it. There is no inventory left to draw an id from, and no Reef State: what the boat was
-- flying is whatever the Version's own words say it was.

DO $$
DECLARE
    f          RECORD;
    v_race_id  UUID;
    v_err      TEXT;
    v_entries  BIGINT;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00a"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            -- Before the window's start, deliberately: the sails were set on the way out.
            jsonb_build_object('at', '2026-06-03 18:40:00', 'definition_number', 1),
            jsonb_build_object('at', '2026-06-03 19:01:00', 'definition_number', 3,
                'note', 'jib was blown out')
        ),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'sea_state', 'moderate')
        )
      );

    PERFORM pg_temp.chk('an upload carrying Testimony is accepted',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));

    PERFORM pg_temp.chk('the Race records the Crossover Chart Version its sails are named in',
        (SELECT crossover_chart_version_id FROM races WHERE id = v_race_id)
            = '11000000-0000-4000-8000-00000000c001');

    SELECT count(*) INTO v_entries FROM race_sail_entries WHERE race_id = v_race_id;
    PERFORM pg_temp.chk('both Sail Configurations are written -- one ordered list, no initial value apart',
        v_entries = 2, format('%s entries', v_entries));

    PERFORM pg_temp.chk('an entry before the Race Window is accepted -- the sails were set before the start',
        (SELECT count(*) FROM race_sail_entries
          WHERE race_id = v_race_id AND at < '2026-06-03 19:00:00') = 1);

    PERFORM pg_temp.chk('a Sail Configuration is stored as the Definition number the sailor named',
        (SELECT definition_number FROM race_sail_entries
          WHERE race_id = v_race_id AND at = '2026-06-03 19:01:00') = 3);

    -- The Version on the entry is the Race's own, put there by the function. No caller states it
    -- per entry, so there is no shape of call that could name a sail in another vocabulary.
    PERFORM pg_temp.chk('and in the Version the Race records, which no entry stated',
        (SELECT count(*) FROM race_sail_entries
          WHERE race_id = v_race_id
            AND crossover_chart_version_id = '11000000-0000-4000-8000-00000000c001') = 2);

    PERFORM pg_temp.chk('a note is stored beside the Definition, verbatim and not instead of it',
        (SELECT note FROM race_sail_entries
          WHERE race_id = v_race_id AND at = '2026-06-03 19:01:00') = 'jib was blown out');

    PERFORM pg_temp.chk('an entry with nothing to add carries no note rather than an empty one',
        (SELECT note FROM race_sail_entries
          WHERE race_id = v_race_id AND at = '2026-06-03 18:40:00') IS NULL);

    PERFORM pg_temp.chk('the Sea State reading is written too',
        (SELECT sea_state FROM race_sea_state_entries WHERE race_id = v_race_id) = 'moderate');
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- Sail 4 is a real sail of this boat and belongs to v2. This Race points at v1, which never
    -- numbered one, so race_sail_entries_definition_fkey is what refuses it -- and that is the
    -- whole reason a Definition number is stored beside a Version and never alone.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00f"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 4)
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('a Definition of another Version is refused -- sail 4 is v2''s',
        v_race_id IS NULL, v_err);

    -- And the same number against the Version that does define it is fine, which is what makes the
    -- refusal above about the pair rather than about the number.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f010"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c002'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 4)
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('and accepted against the Version that numbered it',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A note and no Definition: the chart does not name everything the boat has ever flown, and
    -- "delivery main, no headsail" is testimony rather than a gap. Its NULL definition_number is
    -- what keeps it out of any comparison against the chart, by construction.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f011"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'note', 'delivery main, no headsail')
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('a note-only Configuration is accepted', v_race_id IS NOT NULL,
        COALESCE(v_err, 'accepted'));
    PERFORM pg_temp.chk('and names no Definition rather than the nearest one',
        (SELECT definition_number FROM race_sail_entries WHERE race_id = v_race_id) IS NULL);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_left    BIGINT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A Sail Configuration that says nothing at all: a timestamp with no testimony on it. This was
    -- a deferred trigger while the sails lived in a join table; it is sail_entry_says_something
    -- now, immediate and one row at a time.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00b"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 1),
            jsonb_build_object('at', '2026-06-03 19:01:00')
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('a Sail Configuration that says nothing is refused', v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('by the CHECK, named so the message says which rule',
        v_err LIKE '%sail_entry_says_something%', v_err);

    -- The whole point of doing this in one transaction: the good entry, the race, the Recording and
    -- its Transcription all went with it.
    SELECT count(*) INTO v_left FROM recordings
     WHERE id = 'ffffffff-0000-4000-8000-00000000f00b';
    PERFORM pg_temp.chk('and nothing of that upload survived -- not the entry that was fine either',
        v_left = 0, format('%s recordings', v_left));

    -- A note the sailor left blank says nothing in a way that is not NULL, and would slip past the
    -- CHECK above if it were stored as it arrived. The function's NULLIF is what makes it NULL, and
    -- sail_entry_says_something is then what refuses the row.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f012"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(jsonb_build_object('at', '2026-06-03 19:00:00', 'note', '   ')),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('a Configuration whose only content is a blank note is refused too',
        v_race_id IS NULL, v_err);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- Two entries at one instant. The wizard steps a taken time forward one row precisely so this
    -- cannot be built by hand (ADR 0014); the constraint is what makes that a rule rather than a
    -- courtesy.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00c"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 1),
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 2)
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('two Sail Configurations at the same time are refused',
        v_race_id IS NULL, v_err);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A sail named against a Race that records no Crossover Chart Version. NOT NULL refuses it
    -- either way, so the function says so first: the constraint's message names a column, and what
    -- went wrong is naming sails in a vocabulary this Race does not have (ADR 0023). It is also why
    -- the Server Action reads the Version's Definitions before the bytes move.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00d"'),
        f.rows, f.race,
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 1)
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('a Sail Configuration on a Race that records no chart Version is refused',
        v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('in words that name the Race rather than a column',
        v_err LIKE '%this Race records none%', v_err);

    -- A Version that exists but is not the one this Race points at cannot be smuggled in per entry
    -- either: the function writes the Race's own on every row, so this is refused for the same
    -- reason as above rather than accepted against the wrong chart.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f013"'),
        f.rows, f.race,
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 19:00:00', 'definition_number', 1,
                'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c001')
        ),
        '[]'::JSONB
      );

    PERFORM pg_temp.chk('and an entry cannot bring a Version of its own',
        v_race_id IS NULL, v_err);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- Two empty lists: a race whose sails and water were not recorded. Legal, ordinary, and the
    -- state every other section of this suite has been uploading in.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f00e"'),
        f.rows, f.race, '[]'::JSONB, '[]'::JSONB
      );

    PERFORM pg_temp.chk('a race with nothing annotated is saved', v_race_id IS NOT NULL,
        COALESCE(v_err, 'accepted'));
    PERFORM pg_temp.chk('and holds no annotations rather than a stand-in for one',
        (SELECT count(*) FROM race_sail_entries WHERE race_id = v_race_id) = 0
        AND (SELECT count(*) FROM race_sea_state_entries WHERE race_id = v_race_id) = 0);
    -- And no chart Version either. Nothing resolves one at write time and nothing will at read
    -- time: NULL means the sailor did not record which chart this race's sails were named in
    -- (ADR 0012), which is a different fact from every other race's.
    PERFORM pg_temp.chk('and records no Crossover Chart Version, because nobody named one',
        (SELECT crossover_chart_version_id FROM races WHERE id = v_race_id) IS NULL);
END;
$$;

-- ===========================================================================
-- 10. All five Boat Setup answers, written at upload
-- ===========================================================================
-- LAY-113. The Race carries four Version pointers and the Wind Band the rig was set to, chosen on
-- the wizard's Review step and frozen here (ADR 0012). Pointers, not copies: what is asserted is
-- that each one lands where the sailor put it, that NULL survives as NULL, and that every refusal
-- belongs to a constraint rather than to this function.

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    r         RECORD;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f020"'),
        f.rows,
        f.race || jsonb_build_object(
            'polar_version_id', '12000000-0000-4000-8000-0000000000a1',
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c001',
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d1',
            'instrument_calibration_version_id', '14000000-0000-4000-8000-0000000000c1',
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000b2')
      );

    PERFORM pg_temp.chk('an upload naming all five Boat Setup answers is accepted',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));

    SELECT * INTO r FROM races WHERE id = v_race_id;

    PERFORM pg_temp.chk('the Polar pointer is the one the sailor named',
        r.polar_version_id = '12000000-0000-4000-8000-0000000000a1');
    PERFORM pg_temp.chk('the Rig Tune pointer likewise',
        r.rig_tune_version_id = '13000000-0000-4000-8000-0000000000d1');
    PERFORM pg_temp.chk('the Instrument Calibration pointer likewise',
        r.instrument_calibration_version_id = '14000000-0000-4000-8000-0000000000c1');
    PERFORM pg_temp.chk('and the Wind Band the rig was set to',
        r.rig_tune_band_id = '15000000-0000-4000-8000-0000000000b2');

    -- The four constant tag columns, which are half of each composite key. They are what make a
    -- pointer of the wrong kind impossible rather than merely unlikely (ADR 0011).
    PERFORM pg_temp.chk('each pointer carries the constant kind tag its key checks against',
        r.polar_kind = 'polar' AND r.crossover_kind = 'crossover_chart'
        AND r.rig_tune_kind = 'rig_tune' AND r.calibration_kind = 'instrument_calibration');
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- The failing insert LAY-113 asks the suite for. Band `...e1` is Rig Tune v2's, and this Race
    -- names v1 -- so the composite key `(rig_tune_version_id, rig_tune_band_id)` is what refuses it,
    -- at the insert, and no form or Server Action had to be trusted to notice. Bands never migrate
    -- across Versions: a re-tune means new rows (ADR 0007).
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f021"'),
        f.rows,
        f.race || jsonb_build_object(
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d1',
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000e1')
      );

    PERFORM pg_temp.chk('a Wind Band of another Rig Tune Version is refused at the insert',
        v_race_id IS NULL, v_err);
    PERFORM pg_temp.chk('by the composite key over (rig_tune_version_id, rig_tune_band_id)',
        v_err LIKE '%rig_tune_band%' OR v_err LIKE '%rig_tune_bands%', v_err);

    -- And the same band against the Version it belongs to is fine, which is what makes the refusal
    -- above about the pair rather than about the band.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f022"'),
        f.rows,
        f.race || jsonb_build_object(
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d2',
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000e1')
      );

    PERFORM pg_temp.chk('and accepted against the Version whose band it is',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A band with no Rig Tune Version beside it is a range nobody can look up.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f023"'),
        f.rows,
        f.race || jsonb_build_object(
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000b2')
      );

    PERFORM pg_temp.chk('a Wind Band recorded without its Rig Tune Version is refused',
        v_race_id IS NULL, v_err);

    -- A Rig Tune Version in the Polar's pointer. The tag column is what catches it: `polar_kind` is
    -- a constant 'polar', and the key is over (polar_version_id, polar_kind).
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f024"'),
        f.rows,
        f.race || jsonb_build_object(
            'polar_version_id', '13000000-0000-4000-8000-0000000000d1')
      );

    PERFORM pg_temp.chk('a Version of the wrong kind in a pointer is refused',
        v_race_id IS NULL, v_err);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    r         RECORD;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- The nine archive races that predate every Boat Setup artifact. All five NULL, which is the
    -- state `f.race` has carried through every section above, and it saves cleanly.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f025"'),
        f.rows, f.race
      );

    PERFORM pg_temp.chk('a race with no Boat Setup recorded at all is saved',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));

    SELECT * INTO r FROM races WHERE id = v_race_id;

    -- Not backdated to v1, and not resolved to the newest. Nothing in this function looks a Version
    -- up by date at all (ADR 0008, ADR 0012).
    PERFORM pg_temp.chk('and every one of the five stays NULL, which reads as not recorded',
        r.polar_version_id IS NULL AND r.crossover_chart_version_id IS NULL
        AND r.rig_tune_version_id IS NULL AND r.instrument_calibration_version_id IS NULL
        AND r.rig_tune_band_id IS NULL);
END;
$$;

-- ===========================================================================
-- 11. Amending the five afterwards
-- ===========================================================================
-- Every pointer stays changeable, in place, with no change reason (ADR 0012, ADR 0010). The archive
-- is hand-entered backwards, so most of these will be filled in long after the race was filed.
--
-- `amend_race_boat_setup` is one call because three of the five are coupled to other rows: the chart
-- pointer drags the Sail Configurations, and the Rig Tune pointer and the Wind Band are one answer
-- in two columns.

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_cleared INTEGER;
    r         RECORD;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A race filed with nothing recorded, as an archive race is.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f030"'),
        f.rows, f.race
      );
    PERFORM pg_temp.chk('a race to amend is filed with nothing recorded',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));

    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object(
            'polar_version_id', '12000000-0000-4000-8000-0000000000a1',
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d1',
            'instrument_calibration_version_id', '14000000-0000-4000-8000-0000000000c1',
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000b2')
      );

    PERFORM pg_temp.chk('an amendment fills in three pointers and a band after the fact',
        v_err IS NULL, COALESCE(v_err, 'accepted'));

    SELECT * INTO r FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('and all four landed',
        r.polar_version_id = '12000000-0000-4000-8000-0000000000a1'
        AND r.rig_tune_version_id = '13000000-0000-4000-8000-0000000000d1'
        AND r.instrument_calibration_version_id = '14000000-0000-4000-8000-0000000000c1'
        AND r.rig_tune_band_id = '15000000-0000-4000-8000-0000000000b2');

    PERFORM pg_temp.chk('with nothing cleared, because the chart pointer did not move',
        v_cleared = 0, format('%s cleared', v_cleared));

    -- Moving the Rig Tune Version and letting go of the band, in one statement. Set apart, whichever
    -- went first would leave a pair the composite key refuses -- which is why there is one function.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object(
            'polar_version_id', '12000000-0000-4000-8000-0000000000a1',
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d2',
            'instrument_calibration_version_id', '14000000-0000-4000-8000-0000000000c1',
            'rig_tune_band_id', NULL)
      );

    PERFORM pg_temp.chk('the Rig Tune pointer moves and the band goes with it, in one call',
        v_err IS NULL, COALESCE(v_err, 'accepted'));

    SELECT * INTO r FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('the new Version is recorded and no band is',
        r.rig_tune_version_id = '13000000-0000-4000-8000-0000000000d2'
        AND r.rig_tune_band_id IS NULL);

    -- The band the old Version had, against the new one. Refused, and this is the refusal a form
    -- must never be able to reach: it is why the panel drops a band the new Version does not define.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object(
            'rig_tune_version_id', '13000000-0000-4000-8000-0000000000d2',
            'rig_tune_band_id', '15000000-0000-4000-8000-0000000000b2')
      );

    PERFORM pg_temp.chk('an amendment keeping a band of the Version it replaced is refused',
        v_err IS NOT NULL, v_err);

    SELECT * INTO r FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('and the refused amendment left the Race exactly as it stood',
        r.rig_tune_version_id = '13000000-0000-4000-8000-0000000000d2'
        AND r.rig_tune_band_id IS NULL
        AND r.polar_version_id = '12000000-0000-4000-8000-0000000000a1');

    -- Back to nothing recorded, which has to be as reachable as filling one in: a pointer entered by
    -- mistake is corrected by clearing it, and NULL is a legitimate answer (ADR 0012).
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id, pg_temp.nothing_recorded());

    PERFORM pg_temp.chk('every pointer can be cleared back to not recorded',
        v_err IS NULL, COALESCE(v_err, 'accepted'));

    SELECT * INTO r FROM races WHERE id = v_race_id;
    PERFORM pg_temp.chk('and the Race records no Boat Setup again',
        r.polar_version_id IS NULL AND r.rig_tune_version_id IS NULL
        AND r.instrument_calibration_version_id IS NULL AND r.rig_tune_band_id IS NULL);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_cleared INTEGER;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f031"'),
        f.rows,
        f.race || jsonb_build_object('polar_version_id',
            '12000000-0000-4000-8000-0000000000a1')
      );

    -- A payload short of a key. `->>` on an absent key answers NULL, so read rather than refused
    -- this would erase the Polar pointer -- and an erased pointer looks exactly like a race that
    -- predates the Polar (ADR 0012). Refused with the key named.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object(
            'crossover_chart_version_id', NULL,
            'rig_tune_version_id', NULL,
            'instrument_calibration_version_id', NULL,
            'rig_tune_band_id', NULL)
      );

    PERFORM pg_temp.chk('an amendment short of one of the five keys is refused',
        v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('and says which key was missing, rather than clearing it',
        v_err LIKE '%polar_version_id%', v_err);
    PERFORM pg_temp.chk('the Polar pointer it would have erased still stands',
        (SELECT polar_version_id FROM races WHERE id = v_race_id)
            = '12000000-0000-4000-8000-0000000000a1');

    -- A key present and explicitly null is the sailor clearing it, and is a different act.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id, pg_temp.nothing_recorded());

    PERFORM pg_temp.chk('a key stated as null is a clearance, and is accepted',
        v_err IS NULL, COALESCE(v_err, 'accepted'));
    PERFORM pg_temp.chk('and the pointer is gone',
        (SELECT polar_version_id FROM races WHERE id = v_race_id) IS NULL);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_cleared INTEGER;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A race with two Sail Configurations named in v1's vocabulary.
    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f032"'),
        f.rows,
        f.race || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c001'),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03 18:40:00', 'definition_number', 1),
            jsonb_build_object('at', '2026-06-03 19:01:00', 'definition_number', 3)
        )
      );
    PERFORM pg_temp.chk('a race with two Sail Configurations is filed',
        v_race_id IS NOT NULL, COALESCE(v_err, 'accepted'));

    -- p_clearing disagreeing with what stands is refused. Deleted Testimony is not recoverable from
    -- anything, so the sailor is told what will go before it goes or nothing goes.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c002'),
        1
      );

    PERFORM pg_temp.chk('a chart repoint agreed for the wrong number of Configurations is refused',
        v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('and both Configurations are still there',
        (SELECT count(*) FROM race_sail_entries WHERE race_id = v_race_id) = 2);

    -- Agreed for two, which is what stands. The pointer moves and the Configurations go with it, in
    -- one transaction, because sail 3 of v1 is not sail 3 of v2 (ADR 0023).
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c002'),
        2
      );

    PERFORM pg_temp.chk('a chart repoint agreed for what stands is accepted',
        v_err IS NULL, COALESCE(v_err, 'accepted'));
    PERFORM pg_temp.chk('it says how many Configurations it cleared',
        v_cleared = 2, format('%s cleared', v_cleared));
    PERFORM pg_temp.chk('the pointer moved',
        (SELECT crossover_chart_version_id FROM races WHERE id = v_race_id)
            = '11000000-0000-4000-8000-00000000c002');
    PERFORM pg_temp.chk('and the Configurations named in the old vocabulary are gone',
        (SELECT count(*) FROM race_sail_entries WHERE race_id = v_race_id) = 0);

    -- An amendment that leaves the chart pointer alone and claims to be clearing something means the
    -- panel and the database disagree about what this amendment is.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object('crossover_chart_version_id',
            '11000000-0000-4000-8000-00000000c002'),
        3
      );

    PERFORM pg_temp.chk('an amendment that moves no chart pointer cannot claim to clear anything',
        v_err IS NOT NULL, v_err);
END;
$$;

DO $$
DECLARE
    f         RECORD;
    v_race_id UUID;
    v_err     TEXT;
    v_cleared INTEGER;
BEGIN
    SELECT * INTO f FROM _fixture;

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f033"'),
        f.rows, f.race
      );

    -- Role governs writes, and an amendment is a write (ADR 0019). SECURITY INVOKER means the Race's
    -- own admin-only policy is what refuses this, applied by the SELECT ... FOR UPDATE before
    -- anything is written -- so a viewer reaching the function directly finds no row.
    SELECT cleared, err INTO v_cleared, v_err
      FROM pg_temp.amend_as(
        'cccccccc-0000-4000-8000-000000000002', v_race_id,
        pg_temp.nothing_recorded() || jsonb_build_object('polar_version_id',
            '12000000-0000-4000-8000-0000000000a1')
      );

    PERFORM pg_temp.chk('a signed-in non-admin cannot amend a Race''s Boat Setup',
        v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('turned away as "no such Race", which is what RLS makes it',
        v_err LIKE '%no such Race%', v_err);
    PERFORM pg_temp.chk('and nothing was written',
        (SELECT polar_version_id FROM races WHERE id = v_race_id) IS NULL);

END;
$$;

-- And a guest cannot reach the body at all: a REVOKE names a signature, so this new function got its
-- own rather than inheriting the one `create_race_from_upload` was given.
--
-- Same shape as section 1, including the reason the call is written plainly and inside a DO block
-- rather than through a helper: EXECUTE is checked when a statement is planned, and a plpgsql wrapper
-- that has already planned this call as somebody who may make it waves a guest straight past the
-- door. The two catalog checks say the same thing without calling anything.
--
-- And the return value is assigned even though nothing reads it, which is the third departure and
-- the one that looks like a mistake. `PERFORM public.amend_race_boat_setup(...)` here terminates the
-- backend: on PostgreSQL 17.6 a call whose result is discarded, by a role holding no EXECUTE on the
-- function, is on the same crashing side of the line as `EXECUTE 'SELECT f(...)'`, while assigning
-- the result raises the catchable `permission denied for function`. It reduces to a function with an
-- empty body, so it is the server's and not this schema's, and it is written up in
-- docs/testing/race-upload-transaction.md.
DO $$
DECLARE
    v_err     TEXT;
    v_race_id UUID;
    v_cleared INTEGER;
BEGIN
    PERFORM pg_temp.chk(
        'a guest holds no EXECUTE on amend_race_boat_setup',
        NOT has_function_privilege('anon',
            'public.amend_race_boat_setup(uuid,jsonb,integer)', 'EXECUTE'));
    PERFORM pg_temp.chk(
        'and any signed-in user does, RLS being what decides the rest',
        has_function_privilege('authenticated',
            'public.amend_race_boat_setup(uuid,jsonb,integer)', 'EXECUTE'));

    SELECT id INTO v_race_id FROM races ORDER BY created_at LIMIT 1;

    PERFORM pg_temp.act_as(NULL);
    BEGIN
        v_cleared := public.amend_race_boat_setup(
            v_race_id,
            '{"polar_version_id": null, "crossover_chart_version_id": null,
              "rig_tune_version_id": null, "instrument_calibration_version_id": null,
              "rig_tune_band_id": null}'::JSONB,
            0
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk('a guest cannot even call it',
        v_cleared IS NULL AND v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('and is refused at the door rather than inside the body',
        v_err ILIKE '%permission denied%', v_err);
END;
$$;

-- ===========================================================================
-- 12. Amending a whole Race: public.amend_race, LAY-114's one transaction
-- ===========================================================================
-- The amend surface is the upload flow with its File step removed (ADR 0010 Amendment 1), and the
-- claim this section exists to prove is the half no Jest test can reach: that the five steps really
-- do run in one transaction against a real schema, in the one order that works, and that every
-- refusal a sailor might meet is still raised by the constraint that owns it rather than by a copy.
--
-- Four properties, and each is a way this could be quietly wrong:
--
--   * `races.updated_at` is the whole history the ticket allows, so it has to move for an amendment
--     that touched only an annotation table -- which is the touch triggers' job, not this function's.
--   * An annotation's `at` is Testimony about when something happened and the window is a claim about
--     which stretch was the race. Moving the second must not rewrite the first, and an entry left
--     outside the new window has to survive.
--   * The Crossover Chart pointer can only move because both annotation lists went first:
--     race_sail_entries_race_chart_fkey is ON UPDATE RESTRICT. A re-ordering of the steps still runs
--     and still commits, and refuses exactly the ordinary amendment that repoints a chart.
--   * Nothing about the Recording moves. That is asserted here as a before-and-after over
--     recording_rows and recordings, which is the strongest form of it available anywhere.

-- Amend a whole Race as somebody. Same subtransaction shape as `upload_as` and `amend_as`, and for
-- the same reason: a refused amendment must leave the Race exactly as it stood, and this suite
-- watches both outcomes in one run.
CREATE FUNCTION pg_temp.amend_race_as(
    p_uid       UUID,
    p_race_id   UUID,
    p_race      JSONB,
    p_setup     JSONB,
    p_sails     JSONB DEFAULT '[]'::JSONB,
    p_sea_state JSONB DEFAULT '[]'::JSONB,
    OUT err     TEXT
)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        PERFORM public.amend_race(p_race_id, p_race, p_setup, p_sails, p_sea_state);
        -- races_window_intersects_rows is deferred to COMMIT and this suite never commits, so it is
        -- made to fire here instead. Which is also the ordering claim: it re-checks after step 5, over
        -- rows that never moved.
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

DO $$
DECLARE
    f            RECORD;
    v_race_id    UUID;
    v_err        TEXT;
    v_tuple      TEXT;
    v_rows_before TEXT;
    v_rows_after  TEXT;
    v_setup      JSONB;
BEGIN
    SELECT * INTO f FROM _fixture;

    -- A race filed with the whole vocabulary in place: chart v1, whose Definitions are 1, 2 and 3.
    v_setup := pg_temp.nothing_recorded() || jsonb_build_object(
        'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c001',
        'polar_version_id',           '12000000-0000-4000-8000-0000000000a1',
        'rig_tune_version_id',        '13000000-0000-4000-8000-0000000000d1',
        'rig_tune_band_id',           '15000000-0000-4000-8000-0000000000b2');

    SELECT race_id, err INTO v_race_id, v_err
      FROM pg_temp.upload_as(
        'aaaaaaa1-0000-4000-8000-000000000001',
        jsonb_set(f.recording, '{id}', '"ffffffff-0000-4000-8000-00000000f120"'),
        f.rows,
        f.race || v_setup,
        jsonb_build_array(jsonb_build_object(
            'at', '2026-06-03T19:00:30', 'definition_number', 2, 'note', 'reefed early')),
        jsonb_build_array(jsonb_build_object('at', '2026-06-03T19:00:30', 'sea_state', 'slight'))
      );

    PERFORM pg_temp.chk('a race to amend was filed', v_race_id IS NOT NULL, v_err);

    SELECT string_agg(format('%s|%s|%s|%s', row_index, row_time, sog::TEXT, tws::TEXT), ',' ORDER BY row_index)
      INTO v_rows_before FROM recording_rows WHERE recording_id = 'ffffffff-0000-4000-8000-00000000f120';

    -- One call: a later start, a new title, the chart moved to v2, a sail named in v2's vocabulary,
    -- and the sea state restated. This is the ordinary amendment, and the one a re-ordering breaks.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object(
            'title', '  Wednesday beer can, actually  ',
            'window_start', '2026-06-03T19:01:00',
            'window_finish', '2026-06-03T19:02:00'),
        v_setup || jsonb_build_object(
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c002'),
        -- 4 is a Definition of v2 and of no other Version, so this entry is only insertable because
        -- the pointer moved first. The stamp is *before* the new window, deliberately (AC 7).
        jsonb_build_array(jsonb_build_object(
            'at', '2026-06-03T19:00:30', 'definition_number', 4, 'note', 'kite up on the way out')),
        jsonb_build_array(
            jsonb_build_object('at', '2026-06-03T19:01:00', 'sea_state', 'moderate'),
            jsonb_build_object('at', '2026-06-03T19:02:00', 'sea_state', 'rough'))
      );

    PERFORM pg_temp.chk('an admin amends the window, the title, the chart and both lists in one call',
        v_err IS NULL, v_err);

    PERFORM pg_temp.chk('the window is the one sent',
        (SELECT window_start = '2026-06-03T19:01:00'::TIMESTAMP
                AND window_finish = '2026-06-03T19:02:00'::TIMESTAMP FROM races WHERE id = v_race_id));
    -- Trimmed and blank-to-NULL exactly as the upload does it, because it is the same statement's job.
    PERFORM pg_temp.chk('the title is trimmed, not stored with the sailor''s spaces',
        (SELECT title = 'Wednesday beer can, actually' FROM races WHERE id = v_race_id));
    PERFORM pg_temp.chk('the Crossover Chart pointer moved, which the DELETE before it is what allows',
        (SELECT crossover_chart_version_id = '11000000-0000-4000-8000-00000000c002'
           FROM races WHERE id = v_race_id));
    PERFORM pg_temp.chk('and the other four answers are still the ones the Race records',
        (SELECT polar_version_id = '12000000-0000-4000-8000-0000000000a1'
                AND rig_tune_version_id = '13000000-0000-4000-8000-0000000000d1'
                AND rig_tune_band_id = '15000000-0000-4000-8000-0000000000b2'
                AND instrument_calibration_version_id IS NULL
           FROM races WHERE id = v_race_id));

    -- AC 7. The entry was said at 19:00:30 and the race now starts at 19:01: it stays where it was
    -- said to be, in the vocabulary the Race now records, and nothing clamped it into the window.
    PERFORM pg_temp.chk('the sail entry outside the new window is retained, at the time it was given',
        (SELECT count(*) = 1 FROM race_sail_entries
          WHERE race_id = v_race_id
            AND at = '2026-06-03T19:00:30'::TIMESTAMP
            AND definition_number = 4
            AND crossover_chart_version_id = '11000000-0000-4000-8000-00000000c002'));
    PERFORM pg_temp.chk('both lists were replaced whole rather than added to',
        (SELECT count(*) = 1 FROM race_sail_entries WHERE race_id = v_race_id)
        AND (SELECT count(*) = 2 FROM race_sea_state_entries WHERE race_id = v_race_id));

    -- AC 5. `updated_at` is the whole history an amendment leaves, set by `races_updated_at` on the
    -- UPDATE and by the touch triggers on both annotation tables. It is `NOW()`, which is *transaction*
    -- time and fixed for the length of one -- so a suite that never commits cannot watch the clock move,
    -- and asserting it advanced here would only ever be asserting that two reads of the same constant
    -- differ. What it stands to is that the stamp is this transaction's own.
    PERFORM pg_temp.chk('updated_at is the amendment''s own clock, not the upload''s',
        (SELECT updated_at = transaction_timestamp() FROM races WHERE id = v_race_id));

    -- AC 8. The Transcription is what the file said, and no path in Layline writes one after upload.
    SELECT string_agg(format('%s|%s|%s|%s', row_index, row_time, sog::TEXT, tws::TEXT), ',' ORDER BY row_index)
      INTO v_rows_after FROM recording_rows WHERE recording_id = 'ffffffff-0000-4000-8000-00000000f120';
    PERFORM pg_temp.chk('not one recorded row changed', v_rows_after = v_rows_before);
    PERFORM pg_temp.chk('and the Recording still says what it said about the file',
        (SELECT row_count = 5 AND filename = '06-03-26-beer-can.csv'
                AND first_row_time = '2026-06-03T19:00:00'::TIMESTAMP
           FROM recordings WHERE id = 'ffffffff-0000-4000-8000-00000000f120'));

    -- AC 5's other half: an edit that reaches the Race through an annotation table *alone*. Written as
    -- direct DML rather than through the function, because that is the only way to isolate the claim --
    -- `amend_race`'s step 4 updates the races row on every call, so an amendment can never show that the
    -- touch triggers do anything.
    --
    -- And what it stands to is the tuple rather than the stamp, for the reason above: `NOW()` cannot
    -- move inside one transaction, but an UPDATE writes a new row version either way, so `ctid` moving
    -- is the trigger having reached the Race.
    SELECT ctid::TEXT INTO v_tuple FROM races WHERE id = v_race_id;
    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');
    INSERT INTO race_sea_state_entries (race_id, at, sea_state)
        VALUES (v_race_id, '2026-06-03T19:01:30', 'calm');
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk('a sea state entry on its own reaches the Race, by race_sea_state_entries_touch_race',
        (SELECT ctid::TEXT FROM races WHERE id = v_race_id) <> v_tuple);

    SELECT ctid::TEXT INTO v_tuple FROM races WHERE id = v_race_id;
    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');
    DELETE FROM race_sail_entries WHERE race_id = v_race_id;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk('and so does a sail entry, by race_sail_entries_touch_race',
        (SELECT ctid::TEXT FROM races WHERE id = v_race_id) <> v_tuple);

    -- Put the Race back as the amendment left it, so the refusals below are asked of a whole race.
    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');
    DELETE FROM race_sea_state_entries WHERE race_id = v_race_id AND at = '2026-06-03T19:01:30';
    INSERT INTO race_sail_entries (race_id, crossover_chart_version_id, at, definition_number, note)
        VALUES (v_race_id, '11000000-0000-4000-8000-00000000c002', '2026-06-03T19:00:30', 4,
                'kite up on the way out');
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    -- AC 6, the database half of both refusals. Neither is restated in the function, and the second
    -- is deferred -- so it fires at the SET CONSTRAINTS inside the helper, after step 5.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('window_start', '2026-06-03T19:02:00',
                           'window_finish', '2026-06-03T19:01:00'),
        v_setup || jsonb_build_object(
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c002')
      );
    PERFORM pg_temp.chk('a finish before its start is refused through the function',
        v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('by race_window_ordered, and not by a copy of it inside the body',
        v_err ILIKE '%race_window_ordered%', v_err);

    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('window_start', '2026-06-03T21:00:00',
                           'window_finish', '2026-06-03T22:00:00'),
        v_setup || jsonb_build_object(
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c002')
      );
    PERFORM pg_temp.chk('a window with no recorded row inside it is refused too',
        v_err IS NOT NULL, v_err);
    PERFORM pg_temp.chk('by the deferred trigger, firing after the entries went back in',
        v_err ILIKE '%row%' OR v_err ILIKE '%intersect%', v_err);

    -- And the Race is untouched by either refusal: one transaction, so a refused amendment is a
    -- race that stands exactly as it stood.
    PERFORM pg_temp.chk('and the refused amendments left the Race as it stood',
        (SELECT window_start = '2026-06-03T19:01:00'::TIMESTAMP
                AND title = 'Wednesday beer can, actually' FROM races WHERE id = v_race_id));
    PERFORM pg_temp.chk('with its Testimony still there, both kinds',
        (SELECT count(*) = 1 FROM race_sail_entries WHERE race_id = v_race_id)
        AND (SELECT count(*) = 2 FROM race_sea_state_entries WHERE race_id = v_race_id));

    -- A window bound the caller did not state. NULL is a real answer for a Version pointer and not
    -- for a window (ADR 0008), and the message says which key rather than which column.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('window_start', '2026-06-03T19:01:00'),
        v_setup
      );
    PERFORM pg_temp.chk('a payload short of a window bound is refused as a bad request',
        v_err ILIKE '%window_finish is missing%', v_err);

    -- A sail named against a Race that would record no chart Version. Refused by the function, in
    -- the sailor's terms, because the constraint's own message names a column (ADR 0023).
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('window_start', '2026-06-03T19:01:00',
                           'window_finish', '2026-06-03T19:02:00'),
        pg_temp.nothing_recorded(),
        jsonb_build_array(jsonb_build_object('at', '2026-06-03T19:01:00', 'definition_number', 1))
      );
    PERFORM pg_temp.chk('sails against a Race recording no Crossover Chart Version are refused',
        v_err ILIKE '%this Race records none%', v_err);

    -- A Definition the newly-chosen Version does not define: 3 is chart v1's and not v2's.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('window_start', '2026-06-03T19:01:00',
                           'window_finish', '2026-06-03T19:02:00'),
        v_setup || jsonb_build_object(
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c002'),
        jsonb_build_array(jsonb_build_object('at', '2026-06-03T19:01:00', 'definition_number', 3))
      );
    PERFORM pg_temp.chk('a sail the chosen Version does not name is refused by the foreign key',
        v_err IS NOT NULL, v_err);

    -- Role governs writes (ADR 0019). The lock is the authorization, so a viewer is refused before
    -- anything is deleted -- and "no such Race" is deliberately the same answer as a race that is
    -- not there, because RLS cannot tell the sailor apart from the row.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'cccccccc-0000-4000-8000-000000000002', v_race_id,
        jsonb_build_object('title', 'not yours to retitle',
                           'window_start', '2026-06-03T19:01:00',
                           'window_finish', '2026-06-03T19:02:00'),
        v_setup
      );
    PERFORM pg_temp.chk('a signed-in non-admin cannot amend a Race at all',
        v_err ILIKE '%no such Race%', v_err);
    PERFORM pg_temp.chk('and nothing of theirs reached the Race, Testimony included',
        (SELECT title = 'Wednesday beer can, actually' FROM races WHERE id = v_race_id)
        AND (SELECT count(*) = 1 FROM race_sail_entries WHERE race_id = v_race_id));

    -- AC 4's fourth pointer in its fourth state, and the one the flow could not reach until the chart
    -- picker was given the "Not recorded" chip its three siblings always had: a Race that records no
    -- Crossover Chart Version at all. NULL is a legitimate answer for every one of the four (ADR 0012),
    -- and this is the only one that costs anything -- a Race with no Version can hold no Sail
    -- Configurations, so the sails go with the pointer. Last in the section because it is the one
    -- accepted amendment that leaves the Race in a state the checks above would not recognise.
    SELECT err INTO v_err
      FROM pg_temp.amend_race_as(
        'aaaaaaa1-0000-4000-8000-000000000001', v_race_id,
        jsonb_build_object('title', 'Wednesday beer can, actually',
                           'window_start', '2026-06-03T19:01:00',
                           'window_finish', '2026-06-03T19:02:00'),
        pg_temp.nothing_recorded(),
        '[]'::JSONB,
        jsonb_build_array(jsonb_build_object('at', '2026-06-03T19:01:00', 'sea_state', 'moderate'))
      );
    PERFORM pg_temp.chk('the Crossover Chart pointer can be cleared back to not recorded',
        v_err IS NULL, v_err);
    PERFORM pg_temp.chk('and the Sail Configurations named in the old Version''s words went with it',
        (SELECT crossover_chart_version_id IS NULL FROM races WHERE id = v_race_id)
        AND (SELECT count(*) = 0 FROM race_sail_entries WHERE race_id = v_race_id));
    -- The Sea State is named in nobody's vocabulary, so it has no stake in the chart pointer at all.
    PERFORM pg_temp.chk('while the Sea State, which no Version words, is exactly what was sent',
        (SELECT count(*) = 1 FROM race_sea_state_entries WHERE race_id = v_race_id
            AND at = '2026-06-03T19:01:00'::TIMESTAMP AND sea_state = 'moderate'));
END;
$$;

-- The door on this signature. A REVOKE names a signature, so this function got its own rather than
-- inheriting anything revoked from the other two -- and a guest has no race screens at all (ADR 0015).
--
-- The catalog checks say it without calling anything, for the reason section 1 and section 11 both
-- give: EXECUTE is checked when a statement is planned, and a plpgsql wrapper that has already planned
-- this call as somebody who may make it waves a guest straight past the door.
DO $$
BEGIN
    PERFORM pg_temp.chk(
        'a guest holds no EXECUTE on amend_race',
        NOT has_function_privilege('anon',
            'public.amend_race(uuid,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'));
    PERFORM pg_temp.chk(
        'and any signed-in user does, RLS being what decides the rest',
        has_function_privilege('authenticated',
            'public.amend_race(uuid,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE'));
    PERFORM pg_temp.chk(
        'it is SECURITY INVOKER, so the lock inside it is the authorization',
        NOT (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'amend_race'));
END;
$$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== create_race_from_upload and amend_race: one transaction each, and the refusals through them ==='

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

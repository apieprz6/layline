-- Verification suite for deleting a race -- LAY-112's one statement.
--
-- The ticket's third acceptance criterion is a claim no Jest test can reach: "the transaction is
-- expressed as a delete of the Recording and takes the Race, both annotation tables, the sail join
-- rows and every Recording Row in one statement". A mocked Supabase client can only show that the
-- application sends `DELETE FROM recordings WHERE id = $1`; whether that one statement actually
-- empties the tables below it is a question for the database. So is the eighth criterion, that a
-- signed-in non-admin "is refused by RLS if they try".
--
-- The criterion is quoted as it was written, and one clause of it has since stopped being true of the
-- schema: ADR 0023 collapsed the Sail Inventory into the Crossover Chart, so there are no sail join
-- rows to take. A Sail Configuration names a Sail Definition on the entry itself, which makes the
-- tree one level shallower -- four tables under `recordings` rather than five -- and takes the
-- deferred check that used to make this fixture awkward with it.
--
-- The other half of the delete -- commit first, remove the object second, and a failure at the
-- second step leaves bytes and no row -- is app/(app)/boat-performance/races/[raceId]/__tests__,
-- where the ordering is observable. Nothing about Storage is checked here.
--
-- Run it with scripts/verify-race-delete-cascade.sh, which points psql at either the local stack
-- or a hosted project.
--
-- SAFE AGAINST A LIVE PROJECT. Everything happens inside one transaction that ends in ROLLBACK.
-- The Recordings, Races, annotations and two auth users it creates exist only for the length of the
-- run, and a crash aborts the transaction, which has the same effect. Every race it deletes is one
-- it created in the same transaction.
--
-- Two mechanics, both inherited from scripts/verify-race-upload-rpc.sql, which this suite is the
-- companion to -- that one builds a race in one statement, this one takes it apart in one:
--
--   * The suite never commits, so a deferred constraint trigger would never fire. The fixture
--     helper calls SET CONSTRAINTS ALL IMMEDIATE so races_window_intersects_rows fires at the
--     statement and a fixture that was never really legal cannot pass for one.
--   * The RLS tiers are exercised with SET LOCAL ROLE plus a request.jwt.claims setting, which is
--     what auth.uid() reads and therefore what public.is_admin() decides from.

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

-- One Crossover Chart Version, because a Sail Configuration is named in one Version's vocabulary and
-- in no other (ADR 0023). Every race this suite builds points at it, so the cascade is exercised on
-- an entry that carries both a chart pointer and a Definition number.
--
-- Inserted directly rather than through mint_boat_setup_version -- that function has its own suite
-- (scripts/verify-race-archive-schema.sql), and what is under test here is the delete.
INSERT INTO boat_setup_versions
    (id, artifact_id, kind, version_number, effective_from, created_by,
     filename, content_sha256, payload)
SELECT '11000000-0000-4000-8000-00000000c001', a.id, 'crossover_chart', 1,
       DATE '2026-05-01', 'aaaaaaa1-0000-4000-8000-000000000001',
       'Handsome_Pete_crossover.csv', repeat('1', 64),
       '{"twa_axis": [40], "tws_axis": [6], "cells": [[1]],
         "sail_definitions": [{"number": 1, "label": "Main + Jib 1"},
                              {"number": 2, "label": "Main + Jib 2"}]}'::JSONB
FROM boat_setup_artifacts a WHERE a.kind = 'crossover_chart';

INSERT INTO crossover_sail_definitions (version_id, number, label) VALUES
    ('11000000-0000-4000-8000-00000000c001', 1, 'Main + Jib 1'),
    ('11000000-0000-4000-8000-00000000c001', 2, 'Main + Jib 2');

/*
 * A whole race, built the way the application builds one, and then annotated.
 *
 * The fixture goes in through public.create_race_from_upload rather than by hand-written INSERTs,
 * for the same reason the delete goes out as one statement: a fixture assembled by a different
 * route than the real one can be complete in ways a real race never is, and then the cascade this
 * suite is checking would be checked against a shape that does not occur.
 *
 * It gets two Sail Configurations and one Sea State entry, so every table the cascade has to reach
 * has something in it. Both go in through the same call: with the sail named on the entry itself
 * there is no child table left to write, so the annotations are arguments rather than a second pass.
 */
CREATE FUNCTION pg_temp.make_race(p_recording_id UUID, OUT race_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');

    race_id := public.create_race_from_upload(
        jsonb_build_object(
            'id', p_recording_id,
            'filename', '08-22-26-glr.csv',
            'content_sha256', repeat('b', 64),
            'source_columns', jsonb_build_array('Date', 'Longitude', 'Latitude', 'COG', 'SOG'),
            'date_order', 'MDY',
            'trailing_newline', TRUE,
            'row_count', 3,
            'first_row_time', '2026-08-22T18:30:00',
            'last_row_time', '2026-08-22T18:31:00'
        ),
        jsonb_build_array(
            jsonb_build_object('row_index', 1, 'date_verbatim', '08/22/2026 18:30:00',
                'row_time', '2026-08-22T18:30:00', 'longitude', '-87.5568333300',
                'latitude', '41.8528333300', 'cog', '10.5', 'sog', '6.2'),
            jsonb_build_object('row_index', 2, 'date_verbatim', '08/22/2026 18:30:30',
                'row_time', '2026-08-22T18:30:30', 'longitude', '-87.5568400000',
                'latitude', '41.8528400000', 'cog', '11.0', 'sog', '6.3'),
            jsonb_build_object('row_index', 3, 'date_verbatim', '08/22/2026 18:31:00',
                'row_time', '2026-08-22T18:31:00', 'longitude', '-87.5568500000',
                'latitude', '41.8528500000', 'cog', '11.5', 'sog', '6.4')
        ),
        jsonb_build_object(
            'title', 'Verve Cup, race 2',
            'window_start', '2026-08-22T18:30:00',
            'window_finish', '2026-08-22T18:31:00',
            -- The vocabulary the two Configurations below are named in, and the pointer the
            -- cascade's composite key runs through.
            'crossover_chart_version_id', '11000000-0000-4000-8000-00000000c001'
        ),
        -- Main and Jib 1 up at the start, and a change of headsail partway through, so there is more
        -- than one Configuration to lose. The second carries a note beside its Definition, because a
        -- note is a column on the entry now and a cascade that missed it would still read as clean.
        jsonb_build_array(
            jsonb_build_object('at', '2026-08-22T18:30:00', 'definition_number', 1),
            jsonb_build_object('at', '2026-08-22T18:30:30', 'definition_number', 2,
                'note', 'jib went up wet')
        ),
        jsonb_build_array(
            jsonb_build_object('at', '2026-08-22T18:30:00', 'sea_state', 'moderate')
        )
    );

    -- The deferred window trigger, made to fire now rather than at a COMMIT that never comes, so a
    -- fixture that was never really legal cannot pass for one.
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$;

/*
 * The application's delete, run as somebody: one statement against `recordings`.
 *
 * `deleted` is what the application reads. RLS filters a DELETE rather than raising on it, so a
 * refusal and a race that was already gone are both zero rows and nothing else -- which is why the
 * Server Action asks for `.select('id')` and treats an empty answer as the refusal.
 */
CREATE FUNCTION pg_temp.delete_recording_as(
    p_uid          UUID,
    p_recording_id UUID,
    OUT deleted    BIGINT,
    OUT err        TEXT
)
RETURNS RECORD LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.act_as(p_uid);
    BEGIN
        WITH gone AS (
            DELETE FROM public.recordings WHERE id = p_recording_id RETURNING id
        )
        SELECT count(*) INTO deleted FROM gone;
    EXCEPTION WHEN OTHERS THEN
        err := SQLERRM;
        deleted := NULL;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);
END;
$$;

-- What is left of one race, by table. Every count is taken through the recording or the race id,
-- so nothing here can be satisfied by a row belonging to a different fixture.
CREATE FUNCTION pg_temp.remains(p_recording_id UUID, p_race_id UUID)
RETURNS TEXT LANGUAGE sql AS $$
    SELECT format(
        'recordings=%s rows=%s races=%s sail_entries=%s sea_state=%s',
        (SELECT count(*) FROM recordings WHERE id = p_recording_id),
        (SELECT count(*) FROM recording_rows WHERE recording_id = p_recording_id),
        (SELECT count(*) FROM races WHERE id = p_race_id),
        (SELECT count(*) FROM race_sail_entries WHERE race_id = p_race_id),
        (SELECT count(*) FROM race_sea_state_entries WHERE race_id = p_race_id)
    );
$$;

-- ===========================================================================
-- 1. The cascade is in the schema, not in the application
-- ===========================================================================
-- Checked in the catalog as well as observed below, because the observation cannot tell a cascade
-- from five deletes the client sent in a row. If any of these ever became NO ACTION, the delete
-- would start failing on a race with annotations -- and the fix somebody would reach for is a
-- multi-statement delete that can half-happen.
--
-- `race_sail_entries.race_id -> races` is a *composite* key since ADR 0023 -- (race_id,
-- crossover_chart_version_id) against races (id, crossover_chart_version_id), so an entry cannot
-- disagree with its own Race about the vocabulary. It is matched here on its first column rather
-- than on being single-column, which is what the loop used to require.

DO $$
DECLARE
    v_expected TEXT[][] := ARRAY[
        ARRAY['recording_rows', 'recording_id', 'recordings'],
        ARRAY['races', 'recording_id', 'recordings'],
        ARRAY['race_sail_entries', 'race_id', 'races'],
        ARRAY['race_sea_state_entries', 'race_id', 'races']
    ];
    v_row      TEXT[];
    v_action   TEXT;
BEGIN
    FOREACH v_row SLICE 1 IN ARRAY v_expected LOOP
        SELECT c.confdeltype INTO v_action
          FROM pg_constraint c
          JOIN pg_class child  ON child.oid = c.conrelid
          JOIN pg_class parent ON parent.oid = c.confrelid
          JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND child.relname = v_row[1]
           AND parent.relname = v_row[3]
           AND a.attname = v_row[2];

        PERFORM pg_temp.chk(
            format('%s.%s -> %s cascades', v_row[1], v_row[2], v_row[3]),
            v_action = 'c',
            COALESCE(v_action, 'no such foreign key')
        );
    END LOOP;

    -- The other direction, and the reason the statement names the Recording rather than the Race:
    -- recordings.id has no default and no parent to cascade from, so deleting a Recording is the
    -- root of the tree and there is nothing above it to reach.
    --
    -- Sideways is now the chart's vocabulary rather than the inventory. A Definition that has been
    -- flown cannot be deleted by deleting the race that flew it: the entry's key to
    -- crossover_sail_definitions is RESTRICT, and the Version it belongs to is older than the race
    -- and outlives it (ADR 0012).
    PERFORM pg_temp.chk(
        'a Sail Definition that has been flown still cannot be deleted -- the cascade goes down, not sideways',
        (SELECT c.confdeltype FROM pg_constraint c
           JOIN pg_class child ON child.oid = c.conrelid
           JOIN pg_class parent ON parent.oid = c.confrelid
          WHERE c.contype = 'f' AND child.relname = 'race_sail_entries'
            AND parent.relname = 'crossover_sail_definitions') = 'r'
    );
END;
$$;

-- ===========================================================================
-- 2. An admin's one statement takes all five tables
-- ===========================================================================

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d001';
    v_race      UUID;
    v_before    TEXT;
    v_deleted   BIGINT;
    v_err       TEXT;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);
    v_before := pg_temp.remains(v_recording, v_race);

    PERFORM pg_temp.chk('the fixture is a whole race, annotations and all',
        v_before = 'recordings=1 rows=3 races=1 sail_entries=2 sea_state=1', v_before);

    SELECT deleted, err INTO v_deleted, v_err
      FROM pg_temp.delete_recording_as('aaaaaaa1-0000-4000-8000-000000000001', v_recording);

    PERFORM pg_temp.chk('an admin''s delete removes the one Recording row it named',
        v_deleted = 1, COALESCE(v_err, format('%s row(s)', v_deleted)));

    PERFORM pg_temp.chk(
        'and everything that hung off it went with it -- one statement, five tables',
        pg_temp.remains(v_recording, v_race)
            = 'recordings=0 rows=0 races=0 sail_entries=0 sea_state=0',
        pg_temp.remains(v_recording, v_race)
    );

    -- The archive is a list of races and this one is off it. Checked separately from the counts
    -- above because this is the thing the sailor actually observes.
    PERFORM pg_temp.chk('the race is off the archive list',
        NOT EXISTS (SELECT 1 FROM races WHERE recording_id = v_recording));
END;
$$;

-- ===========================================================================
-- 3. What the delete must not touch
-- ===========================================================================
-- A race is deleted far more often than a boat is re-rigged, so the delete has to be shallow in
-- exactly one direction. The chart's vocabulary, the boat and the frozen Setup Versions a race
-- pointed at are all older than the race and outlive it.

DO $$
DECLARE
    v_recording  UUID := 'dddddddd-0000-4000-8000-00000000d002';
    v_race       UUID;
    v_definitions BIGINT;
    v_deleted    BIGINT;
BEGIN
    SELECT count(*) INTO v_definitions FROM crossover_sail_definitions;
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);

    SELECT deleted INTO v_deleted
      FROM pg_temp.delete_recording_as('aaaaaaa1-0000-4000-8000-000000000001', v_recording);

    PERFORM pg_temp.chk(
        'the chart''s Sail Definitions are untouched by deleting a race that named sails in them',
        (SELECT count(*) FROM crossover_sail_definitions) = v_definitions,
        format('%s definitions', (SELECT count(*) FROM crossover_sail_definitions)));

    -- And the Version itself, which is what a Configuration's label is resolved against at read: a
    -- deleted race must not take the words another race is still stated in.
    PERFORM pg_temp.chk('so is the Crossover Chart Version they belong to',
        EXISTS (SELECT 1 FROM boat_setup_versions
                 WHERE id = '11000000-0000-4000-8000-00000000c001'));

    PERFORM pg_temp.chk('so is the boat', EXISTS (SELECT 1 FROM boats));

    PERFORM pg_temp.chk('and the two auth users are still there -- ON DELETE RESTRICT, both ways',
        (SELECT count(*) FROM auth.users
          WHERE id IN ('aaaaaaa1-0000-4000-8000-000000000001',
                       'cccccccc-0000-4000-8000-000000000002')) = 2);
END;
$$;

-- ===========================================================================
-- 4. A signed-in non-admin is refused, and refused by RLS
-- ===========================================================================
-- The screen does not draw the button for them (components/race/RaceDetailView.tsx) and the Server
-- Action refuses them before it opens a client. This is the third answer, and the only one that
-- holds if somebody calls the endpoint directly.

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d003';
    v_race      UUID;
    v_deleted   BIGINT;
    v_err       TEXT;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);

    SELECT deleted, err INTO v_deleted, v_err
      FROM pg_temp.delete_recording_as('cccccccc-0000-4000-8000-000000000002', v_recording);

    -- Zero rows and no error: a DELETE policy is a filter, so RLS does not raise here the way it
    -- raises on an INSERT. The Server Action reads exactly this and calls it a refusal.
    PERFORM pg_temp.chk('a viewer''s delete removes nothing', v_deleted = 0,
        COALESCE(v_err, format('%s row(s)', v_deleted)));
    PERFORM pg_temp.chk('and says nothing -- a filtered DELETE is silent, which is why the action
        asks the statement what it deleted', v_err IS NULL, v_err);

    PERFORM pg_temp.chk('the whole race is still there afterwards',
        pg_temp.remains(v_recording, v_race)
            = 'recordings=1 rows=3 races=1 sail_entries=2 sea_state=1',
        pg_temp.remains(v_recording, v_race));

    -- The other way a viewer might try: take the Race and leave the Recording. Same answer.
    PERFORM pg_temp.act_as('cccccccc-0000-4000-8000-000000000002');
    DELETE FROM races WHERE id = v_race;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk('nor can a viewer delete the Race directly',
        EXISTS (SELECT 1 FROM races WHERE id = v_race));
END;
$$;

-- ===========================================================================
-- 5. A guest gets nowhere at all
-- ===========================================================================

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d004';
    v_race      UUID;
    v_deleted   BIGINT;
    v_err       TEXT;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);

    SELECT deleted, err INTO v_deleted, v_err
      FROM pg_temp.delete_recording_as(NULL, v_recording);

    PERFORM pg_temp.chk('a guest deletes nothing', COALESCE(v_deleted, 0) = 0,
        COALESCE(v_err, format('%s row(s)', v_deleted)));
    PERFORM pg_temp.chk('and the race is untouched',
        pg_temp.remains(v_recording, v_race)
            = 'recordings=1 rows=3 races=1 sail_entries=2 sea_state=1',
        pg_temp.remains(v_recording, v_race));
END;
$$;

-- ===========================================================================
-- 6. Deleting the Race is not deleting the race
-- ===========================================================================
-- Why the statement names the Recording. An admin deleting the `races` row takes the annotations
-- and leaves the Transcription standing: 6,337 rows of instrument data nothing points at, invisible
-- to every screen. That is the shape ADR 0010's split makes possible, and it is the reason the
-- delete is expressed the other way round.
--
-- This is also what keeps the annotation flow safe. Editing sail entries deletes `race_sail_entries`
-- rows, and nothing in that direction can reach a Recording: the cascade only ever runs downhill.

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d005';
    v_race      UUID;
    v_entry     UUID;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);

    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');
    DELETE FROM races WHERE id = v_race;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk(
        'deleting the Race leaves the Transcription behind, which is why the delete names the Recording',
        pg_temp.remains(v_recording, v_race)
            = 'recordings=1 rows=3 races=0 sail_entries=0 sea_state=0',
        pg_temp.remains(v_recording, v_race));
END;
$$;

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d006';
    v_race      UUID;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);

    -- One annotation edited away, as the annotation flow does it.
    PERFORM pg_temp.act_as('aaaaaaa1-0000-4000-8000-000000000001');
    DELETE FROM race_sail_entries WHERE race_id = v_race AND at = '2026-08-22T18:30:30';
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk(
        'an annotation deleted takes itself and nothing else -- no annotation can destroy a Transcription',
        pg_temp.remains(v_recording, v_race)
            = 'recordings=1 rows=3 races=1 sail_entries=1 sea_state=1',
        pg_temp.remains(v_recording, v_race));
END;
$$;

-- ===========================================================================
-- 7. The sweeper's side of the bargain
-- ===========================================================================
-- The sweeper decides what to remove by anti-joining Storage against `recordings`, so what it needs
-- from the database is the one thing this delete is designed to give it: no row for the bytes it
-- just orphaned. Nothing keeps a tombstone, which is exactly why "the row is gone" is a safe signal
-- for "the bytes may go".

DO $$
DECLARE
    v_recording UUID := 'dddddddd-0000-4000-8000-00000000d007';
    v_race      UUID;
    v_seen      BOOLEAN;
BEGIN
    SELECT race_id INTO v_race FROM pg_temp.make_race(v_recording);
    PERFORM pg_temp.delete_recording_as('aaaaaaa1-0000-4000-8000-000000000001', v_recording);

    -- What services/storage/runSweep.ts reads, and read the way it reads it: through RLS, as the
    -- signed-in caller. A row hidden from the reader is a row the sweeper would count as absent, so
    -- the SELECT policy on `recordings` matters here as much as the DELETE policy does above.
    PERFORM pg_temp.act_as('cccccccc-0000-4000-8000-000000000002');
    SELECT EXISTS (SELECT 1 FROM recordings WHERE id = v_recording) INTO v_seen;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', TRUE);

    PERFORM pg_temp.chk(
        'the deleted Recording''s id is absent from the set the sweeper anti-joins against',
        NOT v_seen);
END;
$$;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

\echo ''
\echo '=== deleting a race: one statement, five tables, and the refusals ==='

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

-- ===========================================================================
-- A Race records all five Boat Setup answers, and they stay changeable
-- ===========================================================================
-- Related: docs/adr/0012-frozen-config-snapshots-per-race.md
--          docs/adr/0011-one-versions-table-with-jsonb-payloads.md
--          docs/adr/0007-what-a-rig-tune-records.md
--          docs/adr/0008-provenance-not-rawness-for-instrument-data.md
--          docs/adr/0023-one-sail-vocabulary-owned-by-the-crossover-chart.md
--
-- No new columns. `races` has carried all five since 20260910183000 — the four Version pointers, the
-- Wind Band, the four constant `kind` tag columns that make each pointer's composite key check the
-- artifact's kind, the `(rig_tune_version_id, rig_tune_band_id)` key into `rig_tune_bands` and
-- `band_requires_rig_tune`. What has been missing is any way to write four of them: LAY-130 taught
-- `create_race_from_upload` the Crossover Chart pointer and nothing else, so a Race filed through the
-- wizard recorded no Polar, no Rig Tune, no Instrument Calibration and no Wind Band, and there was no
-- path at all to amend one afterwards.
--
-- Two functions, and between them every write a pointer needs:
--
--   * `create_race_from_upload` gains the other four values off `p_race`. Values, not lookups: the
--     wizard resolves the Version in force at the recording's start on the client, where the sailor
--     can see the default and change it, and this function resolves nothing (ADR 0012). NULL stays
--     NULL — nine races in the archive predate every Boat Setup artifact, and backdating v1 onto them
--     would assert a Polar the boat did not have yet (ADR 0008).
--
--   * `amend_race_boat_setup` is new, and is how all five change afterwards. One function rather than
--     five UPDATEs because two of the five are coupled to other rows: moving the Crossover Chart
--     pointer clears the Sail Configurations named in the old vocabulary, and moving the Rig Tune
--     pointer has to let go of a Wind Band that belonged to the Version being replaced. Both have to
--     happen in the same transaction as the pointer move, and supabase-js cannot open one.
--
-- Nothing here restates a constraint. The band/Version pair is the composite key's business, a band
-- without a Version is `band_requires_rig_tune`'s, and a pointer of the wrong kind is caught by the
-- tag column in each key — all four of which are proved against a live database by
-- scripts/verify-race-archive-schema.sql.
--
-- No change reason, anywhere. A pointer is the sailor's own answer about their own boat; ADR 0010
-- reserves a reason for a new Version of an artifact, not for correcting which one a race names.

-- ---------------------------------------------------------------------------
-- create_race_from_upload, writing all five
-- ---------------------------------------------------------------------------
-- Same five JSONB arguments, so this replaces rather than overloads: there is no shape of call that
-- could still reach the LAY-130 body and file a race whose Polar was silently not recorded.

CREATE OR REPLACE FUNCTION public.create_race_from_upload(
    p_recording JSONB,
    p_rows      JSONB,
    p_race      JSONB,
    p_sails     JSONB,
    p_sea_state JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_recording_id UUID := (p_recording->>'id')::UUID;
    v_boat_id      UUID;
    v_race_id      UUID;
    -- The five Boat Setup answers, exactly as the sailor left them on the Review step. Any of them
    -- may be NULL, which means not recorded and is a legitimate answer for every one (ADR 0012).
    v_polar_id     UUID := (p_race->>'polar_version_id')::UUID;
    -- The vocabulary the sails were named in. NULL means the Race records no Crossover Chart
    -- Version, which is the reason this one is read before the inserts.
    v_chart_id     UUID := (p_race->>'crossover_chart_version_id')::UUID;
    v_rig_tune_id  UUID := (p_race->>'rig_tune_version_id')::UUID;
    v_calib_id     UUID := (p_race->>'instrument_calibration_version_id')::UUID;
    -- A band of v_rig_tune_id and of no other Version. The composite key says so.
    v_band_id      UUID := (p_race->>'rig_tune_band_id')::UUID;
    -- An absent array and an empty one are the same thing said two ways, and both mean "not
    -- recorded". Normalised once here so the two inserts below do not each have to decide.
    v_sails        JSONB := COALESCE(p_sails, '[]'::JSONB);
    v_sea_state    JSONB := COALESCE(p_sea_state, '[]'::JSONB);
BEGIN
    -- The one boat, by boats_singleton. Read here rather than passed in so a caller cannot
    -- file a race against a boat that does not exist, and so the day a second boat is real
    -- this is the line that fails loudly instead of picking one.
    SELECT id INTO v_boat_id FROM public.boats LIMIT 1;
    IF v_boat_id IS NULL THEN
        RAISE EXCEPTION 'no boat exists to file this race against';
    END IF;

    -- A JSON object where an array belongs would otherwise reach `jsonb_array_elements` and raise
    -- "cannot extract elements from an object", which says nothing about which argument was wrong.
    IF jsonb_typeof(v_sails) <> 'array' THEN
        RAISE EXCEPTION 'p_sails must be an array of Sail Configurations, not %',
            jsonb_typeof(v_sails);
    END IF;
    IF jsonb_typeof(v_sea_state) <> 'array' THEN
        RAISE EXCEPTION 'p_sea_state must be an array of Sea State readings, not %',
            jsonb_typeof(v_sea_state);
    END IF;

    -- race_sail_entries.crossover_chart_version_id is NOT NULL, so this is refused either way.
    -- Said here because the constraint's own message names a column, and what went wrong is a
    -- sailor naming sails against a Race that records no chart Version (ADR 0023).
    IF v_chart_id IS NULL AND jsonb_array_length(v_sails) > 0 THEN
        RAISE EXCEPTION
            'a Sail Configuration is named in a Crossover Chart Version''s vocabulary, and this Race records none'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.recordings (
        id, filename, content_sha256, source_columns, date_order,
        trailing_newline, row_count, first_row_time, last_row_time, uploaded_by
    )
    VALUES (
        v_recording_id,
        p_recording->>'filename',
        p_recording->>'content_sha256',
        -- A TEXT[] out of a JSON array, in order. The header is verbatim: 'TWA (calc)', not
        -- the SQL name.
        ARRAY(SELECT jsonb_array_elements_text(p_recording->'source_columns')),
        (p_recording->>'date_order')::public.recording_date_order,
        (p_recording->>'trailing_newline')::BOOLEAN,
        (p_recording->>'row_count')::INTEGER,
        (p_recording->>'first_row_time')::TIMESTAMP,
        (p_recording->>'last_row_time')::TIMESTAMP,
        -- The uploader is whoever is calling, never a value the client supplies.
        auth.uid()
    );

    INSERT INTO public.recording_rows (
        recording_id, row_index, date_verbatim, row_time,
        longitude, latitude, cog, sog, twd, tws, twa, gwd, gws, ctw, stw,
        pol, pre, xte, rpm, twa_calc, awa_calc, aws_calc, alarm, observations, extras
    )
    SELECT
        v_recording_id, r.row_index, r.date_verbatim, r.row_time::TIMESTAMP,
        r.longitude::NUMERIC, r.latitude::NUMERIC, r.cog::NUMERIC, r.sog::NUMERIC,
        r.twd::NUMERIC, r.tws::NUMERIC, r.twa::NUMERIC, r.gwd::NUMERIC, r.gws::NUMERIC,
        r.ctw::NUMERIC, r.stw::NUMERIC, r.pol::NUMERIC, r.pre::NUMERIC, r.xte::NUMERIC,
        r.rpm::NUMERIC, r.twa_calc::NUMERIC, r.awa_calc::NUMERIC, r.aws_calc::NUMERIC,
        r.alarm, r.observations, r.extras
    FROM jsonb_to_recordset(p_rows) AS r(
        row_index     INTEGER,
        date_verbatim TEXT,
        row_time      TEXT,
        longitude     TEXT,
        latitude      TEXT,
        cog           TEXT,
        sog           TEXT,
        twd           TEXT,
        tws           TEXT,
        twa           TEXT,
        gwd           TEXT,
        gws           TEXT,
        ctw           TEXT,
        stw           TEXT,
        pol           TEXT,
        pre           TEXT,
        xte           TEXT,
        rpm           TEXT,
        twa_calc      TEXT,
        awa_calc      TEXT,
        aws_calc      TEXT,
        alarm         TEXT,
        observations  TEXT,
        extras        JSONB
    );

    -- row_count is a fact about the file and the rows are what was actually written, so a
    -- disagreement between them means the payload was truncated in transit. Checked here
    -- because the alternative is a Transcription that is permanently short and immutable.
    IF (SELECT COUNT(*) FROM public.recording_rows WHERE recording_id = v_recording_id)
        <> (p_recording->>'row_count')::INTEGER
    THEN
        RAISE EXCEPTION 'the Transcription is % rows and the Recording claims %',
            (SELECT COUNT(*) FROM public.recording_rows WHERE recording_id = v_recording_id),
            (p_recording->>'row_count')::INTEGER;
    END IF;

    -- The window's two refusals are the database's own: race_window_ordered fires here, and
    -- races_window_intersects_rows at commit. Nothing restates them. Each Version pointer's kind is
    -- its composite key's to check, and so is its existence; the Wind Band belonging to the Rig Tune
    -- Version is the `(rig_tune_version_id, rig_tune_band_id)` key's, and a band recorded with no
    -- Version at all is band_requires_rig_tune's.
    INSERT INTO public.races (
        recording_id, boat_id, title, window_start, window_finish,
        polar_version_id, crossover_chart_version_id, rig_tune_version_id,
        instrument_calibration_version_id, rig_tune_band_id, created_by
    )
    VALUES (
        v_recording_id,
        v_boat_id,
        -- An untitled race is normal, and '' is not a title.
        NULLIF(TRIM(COALESCE(p_race->>'title', '')), ''),
        (p_race->>'window_start')::TIMESTAMP,
        (p_race->>'window_finish')::TIMESTAMP,
        v_polar_id,
        v_chart_id,
        v_rig_tune_id,
        v_calib_id,
        v_band_id,
        auth.uid()
    )
    RETURNING id INTO v_race_id;

    -- One statement, because a Sail Configuration is one row now: the Definition it names lives
    -- on the entry itself (ADR 0023). Order within the array is irrelevant -- the entries are
    -- timestamped and read back ordered by `at` -- so nothing here preserves it.
    --
    -- The Version written on every entry is the Race's own, not a per-entry value: the sailor
    -- names sails in one vocabulary. race_sail_entries_race_chart_fkey would refuse anything
    -- else, race_sail_entries_definition_fkey refuses a number that Version never defined,
    -- sail_entry_says_something refuses an entry that says neither, and UNIQUE (race_id, at)
    -- refuses two Configurations at one moment. None of it is restated here.
    INSERT INTO public.race_sail_entries (
        race_id, crossover_chart_version_id, at, definition_number, note
    )
    SELECT
        v_race_id,
        v_chart_id,
        (entry->>'at')::TIMESTAMP,
        (entry->>'definition_number')::INTEGER,
        -- A note the sailor left blank is no note, and sail_entry_note_non_empty would refuse
        -- the empty string outright.
        NULLIF(BTRIM(COALESCE(entry->>'note', '')), '')
    FROM jsonb_array_elements(v_sails) AS entries(entry);

    -- `UNIQUE (race_id, at)` refuses two readings of the same moment, and the enum refuses
    -- anything that is not one of the four Sea States.
    INSERT INTO public.race_sea_state_entries (race_id, at, sea_state)
    SELECT
        v_race_id,
        (entry->>'at')::TIMESTAMP,
        (entry->>'sea_state')::public.sea_state
    FROM jsonb_array_elements(v_sea_state) AS entries(entry);

    RETURN v_race_id;
END;
$$;

COMMENT ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) IS
    'Writes a Recording, its Transcription, its Race -- including all five Boat Setup answers the sailor gave on the Review step: the Polar, Crossover Chart, Rig Tune and Instrument Calibration Version pointers and the Wind Band the rig was set to -- and the sailor''s Testimony, in one transaction, so a failure leaves the moved bytes orphaned rather than leaving a row with no bytes or Testimony that is half of what was said (ADR 0013, ADR 0010, ADR 0012, ADR 0023). Every pointer may be NULL, which means not recorded and is never backdated. Nothing here resolves a Version by date: the wizard defaults each pointer from the recording''s start where the sailor can see and change it. Both annotation arrays may be empty, which means that kind was not recorded. A Sail Configuration names a Sail Definition number of the chart Version, a note, or both. SECURITY INVOKER: the admin-only write policies on all five tables are what refuse a viewer. Returns the new race id. Every refusal stays where it lives -- races_window_ordered, the deferred races_window_intersects_rows trigger, the four kind-tagged Version keys, the (rig_tune_version_id, rig_tune_band_id) key, band_requires_rig_tune, the two composite keys and the CHECK on race_sail_entries, and UNIQUE (race_id, at) per annotation kind.';

-- A guest must not reach the body at all, and two separate defaults would let one: Postgres
-- grants EXECUTE on a new function to PUBLIC, and Supabase's own default privileges for schema
-- `public` grant it to `anon` by name. Either way the GRANT below would be decoration. Re-issued
-- here rather than assumed: CREATE OR REPLACE keeps the existing ACL, and a migration that is
-- also the file somebody reads to learn who may call this should say so.
REVOKE ALL ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
-- Callable by any signed-in user; RLS is what decides whether the inserts inside it succeed.
GRANT EXECUTE ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- Amending the five afterwards
-- ---------------------------------------------------------------------------
-- Every pointer stays changeable (ADR 0012): filling one in later, or correcting one, is an
-- Amendment under ADR 0010, and the archive is hand-entered backwards so most of these will be
-- filled in long after the race was filed.
--
-- All five in one call, because three of them cannot move alone:
--
--   * The Crossover Chart pointer drags the Sail Configurations with it. Definition numbers do not
--     span Versions -- sail 7 of v2 is not sail 7 of v1 -- and `race_sail_entries_race_chart_fkey`
--     is ON UPDATE RESTRICT, so the repoint is refused outright while any Configuration stands.
--     `repoint_race_crossover_chart` already knows how to do this, including refusing unless the
--     count the sailor was shown is the count actually standing, so this delegates rather than
--     writing that decision a second time.
--
--   * The Rig Tune pointer and the Wind Band are one answer in two columns. Bands do not migrate
--     between Versions -- a re-tune means new rows with new ids (ADR 0007) -- so a Version moving
--     has to let the band go, and the two columns are set in the same UPDATE. That is what makes it
--     possible at all: set apart, whichever went first would leave a pair the composite key refuses.
--
-- p_clearing is the number of Sail Configurations the caller told the sailor would go, and is 0 on
-- an amendment that does not move the chart pointer. Deleted Testimony is not recoverable from
-- anything, so a disagreement is a refusal rather than a clearance nobody agreed to.

CREATE OR REPLACE FUNCTION public.amend_race_boat_setup(
    p_race_id  UUID,
    p_setup    JSONB,
    p_clearing INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current_chart UUID;
    v_locked        BOOLEAN;
    v_cleared       INTEGER := 0;
    v_chart_id      UUID := (p_setup->>'crossover_chart_version_id')::UUID;
    v_key           TEXT;
BEGIN
    -- `->>` on an absent key answers NULL, which is indistinguishable from the sailor clearing a
    -- pointer to "not recorded". So a payload short of a key is refused rather than read: a caller
    -- that sent four of the five would silently erase the fifth, and an erased pointer looks exactly
    -- like a race that predates the artifact (ADR 0012).
    FOREACH v_key IN ARRAY ARRAY[
        'polar_version_id',
        'crossover_chart_version_id',
        'rig_tune_version_id',
        'instrument_calibration_version_id',
        'rig_tune_band_id'
    ] LOOP
        IF NOT (p_setup ? v_key) THEN
            RAISE EXCEPTION
                'p_setup must state all five Boat Setup answers, and % is missing; an absent key would clear a pointer nobody meant to clear',
                v_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    -- The lock is also the authorization: SECURITY INVOKER means the Race's admin-only write policy
    -- applies to this SELECT ... FOR UPDATE, so a viewer reaching the function directly finds no row
    -- and is refused before anything is written. It also pins the chart pointer read below against a
    -- concurrent amendment, which is what keeps the clearing count agreed rather than merely recent.
    SELECT TRUE, crossover_chart_version_id INTO v_locked, v_current_chart
      FROM public.races
     WHERE id = p_race_id
       FOR UPDATE;

    IF NOT COALESCE(v_locked, FALSE) THEN
        RAISE EXCEPTION 'no such Race, or it is not writable by this account'
            USING ERRCODE = '42501';
    END IF;

    IF v_chart_id IS DISTINCT FROM v_current_chart THEN
        -- Clears the Configurations and moves the pointer, in this transaction, and refuses unless
        -- p_clearing is what is actually standing.
        v_cleared := public.repoint_race_crossover_chart(p_race_id, v_chart_id, p_clearing);
    ELSIF p_clearing <> 0 THEN
        -- The caller warned the sailor about Testimony that is not going anywhere, which means the
        -- panel and the database disagree about what this amendment is. Refused rather than
        -- half-applied.
        RAISE EXCEPTION
            'this amendment leaves the Crossover Chart Version alone and was agreed to clear % Sail Configuration(s)',
            p_clearing
            USING ERRCODE = '22023';
    END IF;

    -- The Rig Tune Version and its Wind Band in one statement, which is the only way a band can be
    -- let go of as the Version moves. A band that does not belong to the named Version is refused by
    -- the composite key, and a band with no Version by band_requires_rig_tune; neither is restated.
    UPDATE public.races
       SET polar_version_id                  = (p_setup->>'polar_version_id')::UUID,
           rig_tune_version_id               = (p_setup->>'rig_tune_version_id')::UUID,
           instrument_calibration_version_id = (p_setup->>'instrument_calibration_version_id')::UUID,
           rig_tune_band_id                  = (p_setup->>'rig_tune_band_id')::UUID
     WHERE id = p_race_id;

    RETURN v_cleared;
END;
$$;

COMMENT ON FUNCTION public.amend_race_boat_setup(UUID, JSONB, INTEGER) IS
    'Amend all five of a Race''s Boat Setup answers -- the Polar, Crossover Chart, Rig Tune and Instrument Calibration Version pointers and the Wind Band -- in one transaction (ADR 0012). One function because three of them cannot move alone: repointing the Crossover Chart clears the Sail Configurations named in the old vocabulary (delegated to repoint_race_crossover_chart, which refuses unless p_clearing is the count actually standing), and the Rig Tune Version and its Wind Band are set together so a band can be let go of as the Version moves. p_setup must carry all five keys, because an absent key reads as NULL and would clear a pointer nobody meant to clear. NULL means not recorded, and is a legitimate answer for every one. No change reason: a pointer is the sailor''s own answer about their own boat. Returns the number of Sail Configurations cleared, which is 0 unless the chart pointer moved. SECURITY INVOKER: the admin-only write policy on races is what refuses a viewer, applied by the SELECT ... FOR UPDATE before anything is written.';

-- A guest has no race screens at all (ADR 0015), and a REVOKE names a signature -- so this new one
-- starts out with Postgres's grant to PUBLIC and Supabase's default grant to `anon` by name,
-- regardless of what was revoked from any other function here.
REVOKE ALL ON FUNCTION public.amend_race_boat_setup(UUID, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_race_boat_setup(UUID, JSONB, INTEGER) TO authenticated;

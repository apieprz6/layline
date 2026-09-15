-- ===========================================================================
-- create_race_from_upload -- now with the sailor's Testimony in the same transaction
-- ===========================================================================
-- LAY-111 adds two annotation steps to the upload wizard, so an upload now writes five tables
-- instead of three: the Recording, its Transcription, the Race, its Sail Configurations and its
-- Sea State readings. All five in one transaction, for the reason the original function exists
-- (ADR 0013) -- the Supabase JS client cannot express a transaction, and a race whose sails were
-- written and whose second sail change was not would be Testimony that is quietly half of what the
-- sailor said, over a Transcription that is immutable.
--
-- The signature changes, so the three-argument version is dropped rather than left standing beside
-- this one. An overload would resolve for any caller that still passed three arguments, and that
-- caller would write a race with no annotations and no complaint -- which is indistinguishable from
-- a race whose sails genuinely were not recorded (ADR 0010). The one thing worse than a failed save
-- is a save that silently drops what the sailor said.
--
-- Everything else is as it was: SECURITY INVOKER so the admin-only write policies are the
-- authorization (ADR 0019), an empty search_path with every name qualified, and the window's two
-- refusals left where they are.
--
-- The annotations arrive as JSONB arrays, in the same shape the wizard holds them:
--
--     p_sails     [{ "at": "2026-08-26 19:00:00", "reef": "full",
--                    "sail_ids": ["<uuid>", "<uuid>"] }, ...]
--     p_sea_state [{ "at": "2026-08-26 19:00:00", "sea_state": "calm" }, ...]
--
-- An empty array is the ordinary case and not a failure: it means that kind was not recorded. There
-- is no initial value beside a list of changes in either kind -- every entry is timestamped and the
-- first is not special (ADR 0010) -- which is why both are plain arrays with nothing alongside them.
--
-- Neither kind's `at` is bounded by the Race Window. The sails were set before the start, and
-- `race_sail_entries` deliberately has no CHECK against the window.

DROP FUNCTION IF EXISTS public.create_race_from_upload(JSONB, JSONB, JSONB);

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
    -- An absent array and an empty one are the same thing said two ways, and both mean "not
    -- recorded". Normalised once here so the two inserts below do not each have to decide.
    v_sails        JSONB := COALESCE(p_sails, '[]'::JSONB);
    v_sea_state    JSONB := COALESCE(p_sea_state, '[]'::JSONB);
    v_entry        JSONB;
    v_entry_id     UUID;
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
    -- races_window_intersects_rows at commit. Nothing restates them.
    INSERT INTO public.races (
        recording_id, boat_id, title, window_start, window_finish, created_by
    )
    VALUES (
        v_recording_id,
        v_boat_id,
        -- An untitled race is normal, and '' is not a title.
        NULLIF(TRIM(COALESCE(p_race->>'title', '')), ''),
        (p_race->>'window_start')::TIMESTAMP,
        (p_race->>'window_finish')::TIMESTAMP,
        auth.uid()
    )
    RETURNING id INTO v_race_id;

    -- One Sail Configuration at a time, because each one's set of sails needs the entry's own id.
    -- A loop rather than a CTE joined back on `at`: the join would be correct only because `at` is
    -- unique per race, which is a constraint this function should be able to violate loudly rather
    -- than quietly mis-assign sails to the wrong entry.
    --
    -- Order within the array is irrelevant -- the entries are timestamped, and `race_sail_entries`
    -- is read back ordered by `at` -- so nothing here preserves it.
    FOR v_entry IN SELECT value FROM jsonb_array_elements(v_sails) AS elements(value)
    LOOP
        INSERT INTO public.race_sail_entries (race_id, at, reef)
        VALUES (
            v_race_id,
            (v_entry->>'at')::TIMESTAMP,
            (v_entry->>'reef')::public.reef_state
        )
        RETURNING id INTO v_entry_id;

        -- A Sail Configuration is a set, so it is stored as one: the primary key on
        -- (entry_id, sail_id) refuses the same sail twice, and the deferred
        -- race_sail_entries_non_empty trigger refuses an entry that names none at commit. Neither
        -- is restated here.
        INSERT INTO public.race_sail_entry_sails (entry_id, sail_id)
        SELECT v_entry_id, sail_id::UUID
        FROM jsonb_array_elements_text(v_entry->'sail_ids') AS sails(sail_id);
    END LOOP;

    -- No child table, so one statement. `UNIQUE (race_id, at)` refuses two readings of the same
    -- moment, and the enum refuses anything that is not one of the four Sea States.
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
    'Writes a Recording, its Transcription, its Race and the sailor''s Testimony -- Sail Configurations and Sea State readings -- in one transaction, so a failure leaves the moved bytes orphaned rather than leaving a row with no bytes or Testimony that is half of what was said (ADR 0013, ADR 0010). Both annotation arrays may be empty, which means that kind was not recorded. SECURITY INVOKER: the admin-only write policies on all five tables are what refuse a viewer. Returns the new race id. Every refusal stays where it lives -- races_window_ordered, the deferred races_window_intersects_rows and race_sail_entries_non_empty triggers, UNIQUE (race_id, at) per annotation kind, and the foreign key on each sail.';

-- A guest must not reach the body at all, and two separate defaults would let one: Postgres
-- grants EXECUTE on a new function to PUBLIC, and Supabase's own default privileges for schema
-- `public` grant it to `anon` by name. Either way the GRANT below would be decoration.
--
-- A guest would still write nothing -- RLS refuses every insert inside, and `anon` cannot even
-- read the boats row -- but the refusal they got would be this function's internal complaint
-- about a missing boat rather than a plain "you may not", which is a worse answer and a
-- needlessly informative one. Verified by scripts/verify-race-upload-rpc.sql, where naming
-- PUBLIC alone was observed to leave `anon=X` standing in the ACL.
REVOKE ALL ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
-- Callable by any signed-in user; RLS is what decides whether the inserts inside it succeed.
GRANT EXECUTE ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

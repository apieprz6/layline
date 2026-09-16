-- ===========================================================================
-- create_race_from_upload -- a Sail Configuration now names a Sail Definition
-- ===========================================================================
-- Related: docs/adr/0023-one-sail-vocabulary-owned-by-the-crossover-chart.md
--          docs/adr/0013-orphaned-bytes-over-orphaned-rows.md
--          docs/adr/0010-what-a-race-is-made-of.md
--
-- The function's job is unchanged -- one transaction for the Recording, its Transcription, the
-- Race and the sailor's Testimony, because supabase-js cannot open one and a race whose second
-- sail change was lost would be Testimony that is quietly half of what was said. Two things
-- change with ADR 0023:
--
--   * `p_race` now carries `crossover_chart_version_id`, and this is the first thing in Layline
--     that writes it. It is the Version the sailor named their sails in, defaulting in the wizard
--     to the one current at the recording's start time. NULL is a legitimate answer -- not
--     recorded (ADR 0012) -- and a Race with NULL there simply has no Configurations.
--
--   * `p_sails` names Definitions rather than inventory ids, and each entry may carry a note
--     instead of, or beside, a Definition:
--
--         p_sails     [{ "at": "2026-08-26 19:00:00", "definition_number": 3,
--                        "note": null }, ...]
--         p_sea_state [{ "at": "2026-08-26 19:00:00", "sea_state": "calm" }, ...]
--
--     With the sail named on the entry itself there is no child table left, so the per-entry
--     loop collapses to one INSERT. That also removes the loop's own reason for existing: it
--     needed each entry's id to write its sails.
--
-- The signature is the same five JSONB arguments, so this is a replacement rather than a second
-- overload -- there is no shape of call that could reach the old body and write inventory ids
-- into a column that no longer exists.
--
-- Everything else is as it was: SECURITY INVOKER so the admin-only write policies are the
-- authorization (ADR 0019), an empty search_path with every name qualified, and every refusal
-- left where it lives.
--
-- Neither annotation kind's `at` is bounded by the Race Window. The sails were set before the
-- start, and `race_sail_entries` deliberately has no CHECK against the window.

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
    -- The vocabulary the sails were named in. NULL means the Race records no Crossover Chart
    -- Version, which is a legitimate answer and the reason this is read before the inserts.
    v_chart_id     UUID := (p_race->>'crossover_chart_version_id')::UUID;
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
    -- races_window_intersects_rows at commit. Nothing restates them. The chart Version's kind is
    -- the composite key's to check, and so is its existence.
    INSERT INTO public.races (
        recording_id, boat_id, title, window_start, window_finish,
        crossover_chart_version_id, created_by
    )
    VALUES (
        v_recording_id,
        v_boat_id,
        -- An untitled race is normal, and '' is not a title.
        NULLIF(TRIM(COALESCE(p_race->>'title', '')), ''),
        (p_race->>'window_start')::TIMESTAMP,
        (p_race->>'window_finish')::TIMESTAMP,
        v_chart_id,
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
    'Writes a Recording, its Transcription, its Race -- including the Crossover Chart Version its sails are named in -- and the sailor''s Testimony, in one transaction, so a failure leaves the moved bytes orphaned rather than leaving a row with no bytes or Testimony that is half of what was said (ADR 0013, ADR 0010, ADR 0023). Both annotation arrays may be empty, which means that kind was not recorded. A Sail Configuration names a Sail Definition number of that Version, a note, or both. SECURITY INVOKER: the admin-only write policies on all five tables are what refuse a viewer. Returns the new race id. Every refusal stays where it lives -- races_window_ordered, the deferred races_window_intersects_rows trigger, the two composite keys and the CHECK on race_sail_entries, and UNIQUE (race_id, at) per annotation kind.';

-- A guest must not reach the body at all, and two separate defaults would let one: Postgres
-- grants EXECUTE on a new function to PUBLIC, and Supabase's own default privileges for schema
-- `public` grant it to `anon` by name. Either way the GRANT below would be decoration. Re-issued
-- here rather than assumed: CREATE OR REPLACE keeps the existing ACL, and a migration that is
-- also the file somebody reads to learn who may call this should say so.
REVOKE ALL ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
-- Callable by any signed-in user; RLS is what decides whether the inserts inside it succeed.
GRANT EXECUTE ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

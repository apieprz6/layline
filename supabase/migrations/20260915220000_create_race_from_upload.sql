-- ===========================================================================
-- create_race_from_upload -- the whole of a race upload, in one transaction
-- ===========================================================================
-- LAY-110 requires the Recording, its Transcription and the Race to be written in one
-- transaction, after the bytes have moved: a failure must leave bytes and no row, never a
-- row and no bytes (ADR 0013). The Supabase JS client cannot express a transaction — each
-- `.insert()` is its own statement over HTTP — so three inserts through it would leave a
-- Recording with a partial Transcription and no Race whenever the second one failed, and
-- the Transcription is immutable, so there would be no repairing it.
--
-- Hence one function. The three inserts run in the single implicit transaction PostgREST
-- opens per RPC call, so any failure anywhere rolls all three back.
--
-- SECURITY INVOKER, and deliberately not DEFINER: the caller's own RLS policies apply, so
-- "only an admin may write a race" is enforced by the same policy that guards a direct
-- insert rather than by an is_admin() check restated here that could drift from it (ADR
-- 0019). A viewer calling this gets the row-level refusal, not a different one.
--
-- The rows are passed as JSONB rather than as arrays because a Transcription is 21 channels
-- wide and a positional signature of 21 arrays is a mis-ordering waiting to happen. Values
-- arrive as JSON strings and are cast explicitly, because Layline transcribes every channel
-- as text to survive the NUMERIC round trip byte for byte (see types/index.ts) and a JSON
-- string will not implicitly populate a NUMERIC column of a recordset.

CREATE OR REPLACE FUNCTION public.create_race_from_upload(
    p_recording JSONB,
    p_rows      JSONB,
    p_race      JSONB
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
BEGIN
    -- The one boat, by boats_singleton. Read here rather than passed in so a caller cannot
    -- file a race against a boat that does not exist, and so the day a second boat is real
    -- this is the line that fails loudly instead of picking one.
    SELECT id INTO v_boat_id FROM public.boats LIMIT 1;
    IF v_boat_id IS NULL THEN
        RAISE EXCEPTION 'no boat exists to file this race against';
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

    RETURN v_race_id;
END;
$$;

COMMENT ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB) IS
    'Writes a Recording, its Transcription and its Race in one transaction, so a failure leaves the moved bytes orphaned rather than leaving a row with no bytes (ADR 0013). SECURITY INVOKER: the admin-only write policies on all three tables are what refuse a viewer, rather than a check restated here. Returns the new race id. The Race Window''s two refusals stay where they are -- races_window_ordered and the deferred races_window_intersects_rows trigger.';

-- A guest must not reach the body at all, and two separate defaults would let one: Postgres
-- grants EXECUTE on a new function to PUBLIC, and Supabase's own default privileges for schema
-- `public` grant it to `anon` by name. Either way the GRANT below would be decoration.
--
-- A guest would still write nothing -- RLS refuses every insert inside, and `anon` cannot even
-- read the boats row -- but the refusal they got would be this function's internal complaint
-- about a missing boat rather than a plain "you may not", which is a worse answer and a
-- needlessly informative one. Verified by scripts/verify-race-upload-rpc.sql, where naming
-- PUBLIC alone was observed to leave `anon=X` standing in the ACL.
REVOKE ALL ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB) FROM PUBLIC, anon;
-- Callable by any signed-in user; RLS is what decides whether the inserts inside it succeed.
GRANT EXECUTE ON FUNCTION public.create_race_from_upload(JSONB, JSONB, JSONB) TO authenticated;

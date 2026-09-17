-- ===========================================================================
-- Amending a race: one call, one transaction, one save
-- ===========================================================================
-- Related: docs/adr/0010-testimony-over-an-immutable-transcription.md (Amendment 1)
--          docs/adr/0014-a-wizard-over-a-persistent-chart-stack.md
--          docs/adr/0009-two-refusals-and-everything-else-is-a-finding.md
--          docs/adr/0012-frozen-config-snapshots-per-race.md
--          docs/adr/0023-one-sail-vocabulary-owned-by-the-crossover-chart.md
--
-- No new columns, no new tables, no new constraints, and nothing dropped. Everything an amendment
-- writes has been writable since 20260910183000; what has been missing is a way to write it *all at
-- once*. `amend_race_boat_setup` moves the five Boat Setup answers and touches neither the title, nor
-- the window, nor either annotation table -- so correcting a race that was entered wrong took three
-- round trips through three surfaces, any two of which could succeed while the third failed.
--
-- ADR 0010 Amendment 1 says an amendment is one save with no Review gate and no step ordering. That
-- is a claim about the transaction before it is a claim about the screen: a sailor who moves the start
-- two minutes later and takes off the jib change that turns out to be on the wrong side of it has
-- corrected one thing, and a half-applied version of that correction is a race that never happened.
--
-- What this function may change, and it is the whole list: the title, the two window bounds, the five
-- Boat Setup answers, and both lists of Testimony. What it may not touch, and cannot:
--
--   * `recordings` -- not one column, including `filename` and `content_sha256`.
--   * `recording_rows` -- the Transcription. It is not read here and it is not written anywhere in
--     Layline after the upload that created it. An amendment is what the sailor said about a
--     recording; the recording is what the file said, and the two are not the same kind of thing
--     (ADR 0010). Row Quality and Gap Seconds are derived from those rows at read (ADR 0009), which
--     is why moving the window re-derives both with nothing here to recompute.
--   * The stored bytes under `races/`. This is SQL; it has no reach into Storage at all.
--
-- The order below is the only order that works, and each step is forced by the one before it:
--
--   1. Lock the Race. `SECURITY INVOKER` plus `SELECT ... FOR UPDATE` means the admin-only write
--      policy on `races` is what refuses a viewer, before anything is written.
--   2. Delete both annotation lists. The whole Testimony travels in every call and is re-inserted
--      below, so this is a replacement rather than a clearance -- and it is what makes step 3 legal:
--      `race_sail_entries_race_chart_fkey` is ON UPDATE RESTRICT, so the chart pointer cannot move
--      while a Sail Configuration still names the old Version.
--   3. `amend_race_boat_setup`, with a clearing count of 0. Zero is the true count: nothing stands
--      after step 2. It does mean this call does not get that argument's protection -- it exists so a
--      panel cannot clear Testimony the sailor was never warned about -- and the reason it is not
--      needed here is that no Testimony is being cleared: every entry the sailor left in the flow is
--      in `p_sails` and `p_sea_state` and goes back in at step 5. A caller that dropped entries from
--      those arrays would be a caller amending the Testimony, which is exactly what this is for.
--      Delegating also buys the five-key check, so a payload short of one answer is refused here too
--      rather than silently clearing a pointer.
--   4. The title and the window. `race_window_ordered` fires on this UPDATE; the deferred
--      `races_window_intersects_rows` fires at commit, after step 5, over the rows that were always
--      there. Both refusals are the database's own and neither is restated (ADR 0009).
--   5. Re-insert both lists, against whatever chart Version the Race now points at.
--
-- No change reason, and no history beyond `races.updated_at`. The step-4 UPDATE moves it through
-- `races_updated_at`, and the inserts and deletes in steps 2 and 5 move it through
-- `race_sail_entries_touch_race` and `race_sea_state_entries_touch_race` -- so an amendment that only
-- corrected the sea state still advances it. ADR 0010 reserves a reason for a new Version of an
-- artifact, not for a sailor correcting what they themselves said about their own race; a required
-- justification would make the archive harder to get right rather than more trustworthy.

CREATE OR REPLACE FUNCTION public.amend_race(
    p_race_id   UUID,
    p_race      JSONB,
    p_setup     JSONB,
    p_sails     JSONB,
    p_sea_state JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_locked    BOOLEAN;
    -- The vocabulary the sails are named in *after* this amendment, which is the Version the entries
    -- at step 5 are written against. Read from the payload rather than from the row, because the row
    -- is about to be moved onto it.
    v_chart_id  UUID := (p_setup->>'crossover_chart_version_id')::UUID;
    -- An absent array and an empty one are the same thing said two ways, and both mean "not
    -- recorded". Normalised once so neither insert has to decide.
    v_sails     JSONB := COALESCE(p_sails, '[]'::JSONB);
    v_sea_state JSONB := COALESCE(p_sea_state, '[]'::JSONB);
    v_key       TEXT;
BEGIN
    -- `->>` on an absent key answers NULL, and for the window that is not a legitimate answer the way
    -- it is for a Version pointer: NULL would reach a NOT NULL column as an error about a column
    -- rather than about a caller sending three of the four things a race is. The title is deliberately
    -- not in this list -- an absent title is the same as a blank one, and both mean untitled.
    FOREACH v_key IN ARRAY ARRAY['window_start', 'window_finish'] LOOP
        IF NOT (p_race ? v_key) THEN
            RAISE EXCEPTION 'p_race must state the window, and % is missing', v_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

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

    -- The lock is also the authorization: SECURITY INVOKER means the Race's admin-only write policy
    -- applies to this SELECT ... FOR UPDATE, so a viewer reaching the function directly finds no row
    -- and is refused before anything is deleted.
    SELECT TRUE INTO v_locked
      FROM public.races
     WHERE id = p_race_id
       FOR UPDATE;

    IF NOT COALESCE(v_locked, FALSE) THEN
        RAISE EXCEPTION 'no such Race, or it is not writable by this account'
            USING ERRCODE = '42501';
    END IF;

    -- race_sail_entries.crossover_chart_version_id is NOT NULL, so this is refused either way. Said
    -- here because the constraint's own message names a column, and what went wrong is a sailor
    -- naming sails against a Race that would record no chart Version (ADR 0023).
    IF v_chart_id IS NULL AND jsonb_array_length(v_sails) > 0 THEN
        RAISE EXCEPTION
            'a Sail Configuration is named in a Crossover Chart Version''s vocabulary, and this Race records none'
            USING ERRCODE = '22023';
    END IF;

    -- Step 2: out with the stored Testimony, both kinds. Nothing is lost that the caller did not send
    -- back -- see the header -- and this is what lets the chart pointer move below.
    DELETE FROM public.race_sail_entries WHERE race_id = p_race_id;
    DELETE FROM public.race_sea_state_entries WHERE race_id = p_race_id;

    -- Step 3: the five Boat Setup answers, including a Crossover Chart repoint if there is one. Zero
    -- is the count actually standing, because of the DELETE above.
    PERFORM public.amend_race_boat_setup(p_race_id, p_setup, 0);

    -- Step 4: the title and the window. Both refusals stay where they live.
    UPDATE public.races
       SET title         = NULLIF(TRIM(COALESCE(p_race->>'title', '')), ''),
           window_start  = (p_race->>'window_start')::TIMESTAMP,
           window_finish = (p_race->>'window_finish')::TIMESTAMP
     WHERE id = p_race_id;

    -- Step 5: the Testimony as the sailor now tells it. The Version written on every entry is the
    -- Race's own, not a per-entry value: a sailor names sails in one vocabulary, and
    -- race_sail_entries_race_chart_fkey would refuse anything else. Order within the array is
    -- irrelevant -- entries are timestamped and read back ordered by `at` -- so nothing preserves it.
    INSERT INTO public.race_sail_entries (
        race_id, crossover_chart_version_id, at, definition_number, note
    )
    SELECT
        p_race_id,
        v_chart_id,
        (entry->>'at')::TIMESTAMP,
        (entry->>'definition_number')::INTEGER,
        -- A note the sailor left blank is no note, and sail_entry_note_non_empty would refuse the
        -- empty string outright.
        NULLIF(BTRIM(COALESCE(entry->>'note', '')), '')
    FROM jsonb_array_elements(v_sails) AS entries(entry);

    INSERT INTO public.race_sea_state_entries (race_id, at, sea_state)
    SELECT
        p_race_id,
        (entry->>'at')::TIMESTAMP,
        (entry->>'sea_state')::public.sea_state
    FROM jsonb_array_elements(v_sea_state) AS entries(entry);
END;
$$;

COMMENT ON FUNCTION public.amend_race(UUID, JSONB, JSONB, JSONB, JSONB) IS
    'Amend a Race in one transaction: its title, its Race Window, all five Boat Setup answers, and both lists of Testimony (ADR 0010 Amendment 1). One call because an amendment is one save with no Review gate and no step ordering -- a sailor moving the window and the sail change that sits inside it is correcting one thing, and a half-applied correction is a race that never happened. Both annotation lists are sent whole and replace what is stored, which is also what lets the Crossover Chart pointer move: race_sail_entries_race_chart_fkey is ON UPDATE RESTRICT, so the entries go first, and the delegated amend_race_boat_setup is then called with a clearing count of 0 because nothing is standing. Touches neither recordings nor recording_rows: the Transcription is immutable and no path in Layline writes one after upload, so Row Quality, Coverage and Gap Seconds simply re-derive at read from an amended window (ADR 0009). No change reason and no per-field history: races.updated_at is the whole record, moved by races_updated_at and by the touch triggers on both annotation tables, so an amendment that only corrected the sea state still advances it. SECURITY INVOKER: the admin-only write policies are what refuse a viewer, applied by the SELECT ... FOR UPDATE before anything is deleted. Every refusal stays where it lives -- race_window_ordered, the deferred races_window_intersects_rows, the four kind-tagged Version keys, the (rig_tune_version_id, rig_tune_band_id) key, band_requires_rig_tune, race_sail_entries_definition_fkey, sail_entry_says_something, sail_entry_note_non_empty, and UNIQUE (race_id, at) per annotation kind.';

-- A guest has no race screens at all (ADR 0015), and a REVOKE names a signature -- so this new one
-- starts out with Postgres's grant to PUBLIC and Supabase's default grant to `anon` by name,
-- regardless of what was revoked from any other function in this archive.
REVOKE ALL ON FUNCTION public.amend_race(UUID, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
-- Callable by any signed-in user; RLS is what decides whether the writes inside it succeed.
GRANT EXECUTE ON FUNCTION public.amend_race(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;

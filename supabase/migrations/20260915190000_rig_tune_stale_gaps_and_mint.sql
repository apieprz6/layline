-- A Wind Band can say its Turnbuckle Gaps have gone stale, and a whole Rig Tune Version is
-- minted in one transaction.
--
-- Related: docs/adr/0007-what-a-rig-tune-records.md
--          docs/adr/0011-one-versions-table-and-jsonb-payloads.md
--          docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md
--
-- Two things LAY-101's schema left the form with no way to say (LAY-107):
--
--   * Re-measuring the Base Tune makes every other band's *Gaps* wrong, because those
--     millimetres were measured from a rig that no longer exists. ADR 0007 forbids
--     recomputing them -- no thread pitch is recorded, so there is no honest arithmetic from
--     turns back to millimetres -- so the fact has to be *stored*, and there was no column
--     for it. Deriving it later by walking the Version chain is not an option either: it
--     would have to match bands across Versions by low_kt, which breaks the first time the
--     bands are re-cut.
--   * A Version is the whole table. Its three writes -- the Version row, its bands, the
--     artifact's current pointer -- are one act, and supabase-js cannot open a transaction,
--     so a failure halfway through PostgREST calls would leave a Version with half its bands
--     or a pointer at nothing. The function below is that transaction.
--
-- Verification: scripts/verify-race-archive-schema.sql, section "rig tune staleness and
-- minting". Run on 2026-09-15 against the local stack.

-- ---------------------------------------------------------------------------
-- gaps_stale
-- ---------------------------------------------------------------------------
-- FALSE by default, which is the truth for every band written so far: nothing has minted a
-- second Version, so no base has been re-measured under one.
--
-- The Turns are deliberately not covered by this flag. They are counted off the base wherever
-- the base now sits, so re-measuring the base leaves them meaning exactly what they meant.

ALTER TABLE public.rig_tune_bands
    ADD COLUMN IF NOT EXISTS gaps_stale BOOLEAN NOT NULL DEFAULT FALSE;

-- The Base Tune is what the other bands are stale *against*, so it cannot be stale itself.
-- Marking it so would leave the Version with no band whose millimetres are trusted, and
-- nothing to re-measure the others from.
ALTER TABLE public.rig_tune_bands
    DROP CONSTRAINT IF EXISTS base_band_gaps_never_stale;
ALTER TABLE public.rig_tune_bands
    ADD CONSTRAINT base_band_gaps_never_stale CHECK (NOT (is_base AND gaps_stale));

COMMENT ON COLUMN public.rig_tune_bands.gaps_stale IS
    'The Gaps no longer describe the rig, because the Base Tune was re-measured and this band was not. Decided by the app when the Version is minted and then immutable like the rest of the row -- never recomputed from the base, which would need the thread pitch ADR 0007 deliberately does not store. The Turns are unaffected. Never true of the Base Tune (base_band_gaps_never_stale).';

-- ---------------------------------------------------------------------------
-- Minting a Version
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, so every RLS policy on the three tables applies exactly as it would to
-- the same statements sent one at a time: a viewer is refused by the write policies and no
-- privilege is smuggled in behind a SECURITY DEFINER (ADR 0019). The Server Action checks the
-- Role too; this is the boundary that holds when something forgets to.
--
-- version_number is allocated in here rather than read by the client and sent back, which
-- would be a read-then-write race across two round trips. The artifact row is locked first,
-- so two admins minting at the same moment queue instead of colliding on
-- boat_setup_versions_artifact_id_version_number_key.
--
-- The Base Tune *is* checked here. rig_tune_bands already carries a partial unique index that
-- stops a Version having two, and this function is where the other half of "exactly one per
-- Version" lives: a table with no base would leave every Turns figure counted from nothing,
-- and a row-at-a-time constraint cannot see the absence of a row.
--
-- Contiguity of the bands is *not* checked here. It needs the whole table in view *and* the
-- vocabulary to say which band is at fault, which is lib/boat/rigTune.ts's job (see the
-- comment on rig_tune_bands). What this function does guarantee is that either the entire
-- table lands or none of it does.

CREATE OR REPLACE FUNCTION public.mint_rig_tune_version(
    p_effective_from DATE,
    p_note           TEXT,
    p_bands          JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_artifact_id UUID;
    v_version_id  UUID;
    v_next        INTEGER;
    v_bases       INTEGER;
BEGIN
    IF p_bands IS NULL
       OR jsonb_typeof(p_bands) <> 'array'
       OR jsonb_array_length(p_bands) = 0 THEN
        RAISE EXCEPTION 'a Rig Tune Version needs at least one Wind Band'
            USING ERRCODE = '22023';
    END IF;

    -- Exactly one, counted before anything is written. The unique index refuses the second
    -- base; nothing but this refuses the zeroth, and a Version whose Turns are counted from no
    -- band at all is a table of figures that mean nothing (ADR 0007).
    SELECT count(*) INTO v_bases
      FROM jsonb_array_elements(p_bands) AS band
     WHERE COALESCE((band ->> 'is_base')::BOOLEAN, FALSE);

    IF v_bases <> 1 THEN
        RAISE EXCEPTION 'a Rig Tune Version has exactly one Base Tune band, not %', v_bases
            USING ERRCODE = '22023';
    END IF;

    -- FOR UPDATE also applies the artifact's write policy, so a viewer reaching this function
    -- directly gets no row here and is refused rather than part-way through.
    --
    -- STRICT, because this function names the artifact by kind alone. Layline is one boat
    -- today; the day a second one arrives, the honest outcome is this call failing loudly
    -- rather than a Version landing on whichever row the planner happened to reach first.
    BEGIN
        SELECT id INTO STRICT v_artifact_id
          FROM public.boat_setup_artifacts
         WHERE kind = 'rig_tune'
           FOR UPDATE;
    EXCEPTION
        WHEN no_data_found THEN
            RAISE EXCEPTION 'the Rig Tune artifact is not writable by this account'
                USING ERRCODE = '42501';
        WHEN too_many_rows THEN
            RAISE EXCEPTION
                'more than one Rig Tune artifact is visible, so which boat to write is unclear'
                USING ERRCODE = '21000';
    END;

    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
      FROM public.boat_setup_versions
     WHERE artifact_id = v_artifact_id;

    INSERT INTO public.boat_setup_versions
        (artifact_id, kind, version_number, effective_from, note, created_by, payload)
    VALUES
        (v_artifact_id, 'rig_tune', v_next, p_effective_from, p_note, auth.uid(), '{}'::JSONB)
    RETURNING id INTO v_version_id;

    -- No COALESCE on low_kt or shrouds: a band missing either is a bug in the caller, and the
    -- NOT NULL constraints say so louder than a fabricated default would.
    INSERT INTO public.rig_tune_bands
        (version_id, low_kt, high_kt, is_base, label, note, gaps_stale, shrouds)
    SELECT v_version_id,
           (band ->> 'low_kt')::NUMERIC,
           (band ->> 'high_kt')::NUMERIC,   -- JSON null and an absent key both give NULL: the open top
           COALESCE((band ->> 'is_base')::BOOLEAN, FALSE),
           NULLIF(BTRIM(COALESCE(band ->> 'label', '')), ''),
           NULLIF(BTRIM(COALESCE(band ->> 'note', '')), ''),
           COALESCE((band ->> 'gaps_stale')::BOOLEAN, FALSE),
           band -> 'shrouds'
      FROM jsonb_array_elements(p_bands) AS band;

    UPDATE public.boat_setup_artifacts
       SET current_version_id = v_version_id
     WHERE id = v_artifact_id;

    RETURN v_version_id;
END;
$$;

COMMENT ON FUNCTION public.mint_rig_tune_version(DATE, TEXT, JSONB) IS
    'Writes a whole Rig Tune Version -- the Version row, all of its Wind Bands, and the artifact''s current pointer -- in one transaction, allocating version_number under a lock on the artifact. SECURITY INVOKER, so RLS refuses a viewer exactly as it would the individual statements. Refuses a table that does not carry exactly one Base Tune band, and refuses to guess when more than one Rig Tune artifact is visible. Returns the new Version''s id. Band contiguity is the application''s to enforce (ADR 0007).';

-- anon is a guest, and ADR 0015 gives a guest no boat screens at all. The grant to
-- authenticated is not a permission to write: SECURITY INVOKER means the write policies still
-- decide, and they ask is_admin().
REVOKE EXECUTE ON FUNCTION public.mint_rig_tune_version(DATE, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mint_rig_tune_version(DATE, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.mint_rig_tune_version(DATE, TEXT, JSONB) TO authenticated;

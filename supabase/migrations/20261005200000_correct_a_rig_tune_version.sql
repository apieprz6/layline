-- A Rig Tune Version can be corrected in place for a recording mistake, through one function,
-- and its Wind Bands cannot be changed any other way.
--
-- Related: docs/adr/0031-a-rig-tune-version-is-correctable-in-place-for-a-recording-mistake.md
--          docs/adr/0007-what-a-rig-tune-records.md
--          docs/adr/0005-instrument-calibration-as-versioned-artifact-plus-event-log.md
--          docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md
--
-- LAY-151. ADR 0007 refused Rig Tune the correction ADR 0005 gave calibration, and the mistake
-- that actually happened was a Wind Band the owner tuned for and never entered. Superseding it
-- fixes the future only: every Race sailed under that Version keeps pointing at it, and keeps
-- reporting against a table that was never the boat's. ADR 0031 opens the exception, and this
-- migration is where it is opened -- deliberately, in three parts:
--
--   * enforce_version_immutability() lets a rig_tune Version change its note and its
--     effective_from, and nothing else. Its payload stays '{}': the content is the bands.
--   * rig_tune_bands gets a guard. Until now the claim that bands are immutable lived only in
--     a column comment -- RLS is FOR ALL for admins and no trigger stopped an UPDATE -- so an
--     admin with the anon key could rewrite a past table one row at a time. Now a band is
--     written only inside mint_rig_tune_version or correct_rig_tune_version, which say so with
--     a transaction-local setting the guard reads.
--   * correct_rig_tune_version() writes the Version row and its whole band table in one
--     transaction, keeping each kept band's id so every Race pointing at it still does.
--
-- Verification: scripts/verify-race-archive-schema.sql, section "Correcting a Rig Tune
-- Version". Run on 2026-10-05 against the local stack.

-- ---------------------------------------------------------------------------
-- Immutability, with two exceptions
-- ---------------------------------------------------------------------------
-- The columns refused for calibration stay refused for both kinds. What differs is the content:
-- a calibration's is its payload, which a correction rewrites; a Rig Tune's is rig_tune_bands,
-- so its payload is held at what it was, and the bands are corrected through the function
-- below. recorded_at keeps meaning when the Version was first entered, for both.

CREATE OR REPLACE FUNCTION public.enforce_version_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.kind NOT IN ('instrument_calibration', 'rig_tune') THEN
        RAISE EXCEPTION
            'a % Version is immutable; mint a new Version instead', OLD.kind;
    END IF;

    IF NEW.id            <> OLD.id
    OR NEW.artifact_id   <> OLD.artifact_id
    OR NEW.kind          <> OLD.kind
    OR NEW.version_number<> OLD.version_number
    OR NEW.created_by    <> OLD.created_by
    OR NEW.recorded_at   <> OLD.recorded_at
    OR NEW.filename      IS DISTINCT FROM OLD.filename
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
        RAISE EXCEPTION
            'only the content, note and effective_from of this % Version may be corrected',
            OLD.kind;
    END IF;

    IF OLD.kind = 'rig_tune' AND NEW.payload IS DISTINCT FROM OLD.payload THEN
        RAISE EXCEPTION
            'a rig_tune Version''s payload stays empty; its bands are corrected through '
            'correct_rig_tune_version';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_version_immutability() IS
    'Refuses any UPDATE of a Boat Setup Version except a correction in place: an instrument_calibration Version''s payload, note or effective_from (ADR 0005), or a rig_tune Version''s note or effective_from, whose bands are corrected through correct_rig_tune_version (ADR 0031). Polar and Crossover Chart Versions are never updated.';

-- ---------------------------------------------------------------------------
-- The band guard
-- ---------------------------------------------------------------------------
-- A transaction-local setting rather than a role or a SECURITY DEFINER: the functions stay
-- SECURITY INVOKER, so RLS still decides *who* may write, and the guard decides only *how*.
-- set_config lives in pg_catalog, which PostgREST does not expose, so a client cannot raise
-- the setting itself; only a function in public that does so on its own behalf can.
--
-- One exception: a band whose Version has already gone is let go with it. That is a cascade
-- from boat_setup_versions (itself reached only from a cascade off boat_setup_artifacts, since
-- no policy deletes a Version), and refusing it would make an artifact undeletable by the very
-- path the RLS comment on boat_setup_versions says still works.

CREATE OR REPLACE FUNCTION public.enforce_rig_tune_band_write_path()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF COALESCE(current_setting('layline.rig_tune_band_write', TRUE), '') = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM public.boat_setup_versions WHERE id = OLD.version_id
    ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'Wind Bands are written only by mint_rig_tune_version or correct_rig_tune_version'
        USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.enforce_rig_tune_band_write_path() IS
    'Refuses any INSERT, UPDATE or DELETE on rig_tune_bands made outside mint_rig_tune_version or correct_rig_tune_version, which set the transaction-local layline.rig_tune_band_write for the length of their own writes. A band whose Version has already been deleted is let go, so a cascade still works (ADR 0031).';

DROP TRIGGER IF EXISTS rig_tune_bands_write_path ON public.rig_tune_bands;
CREATE TRIGGER rig_tune_bands_write_path
    BEFORE INSERT OR UPDATE OR DELETE ON public.rig_tune_bands
    FOR EACH ROW EXECUTE FUNCTION public.enforce_rig_tune_band_write_path();

COMMENT ON TABLE public.rig_tune_bands IS
    'The Wind Bands of a Rig Tune Version. Rows rather than JSONB because a Race points at one of them (ADR 0007, ADR 0011). Written only through mint_rig_tune_version and correct_rig_tune_version (rig_tune_bands_write_path): a band is never edited on its own, because a Version is the whole table. A correction keeps each kept band''s id, so a Race''s rig_tune_band_id still names it (ADR 0031). Contiguity -- every wind speed falling in exactly one band -- stays application-level: expressing it in SQL needs a window function over siblings, which a CHECK cannot do and a trigger can only do awkwardly.';

COMMENT ON COLUMN public.rig_tune_bands.gaps_stale IS
    'The Gaps no longer describe the rig, because the Base Tune was re-measured and this band was not. Decided by the app when the Version is minted -- never recomputed from the base, which would need the thread pitch ADR 0007 deliberately does not store -- and changed afterwards only by the sailor, in a correction of this Version (ADR 0031); a correction never recomputes it, here or on any other Version. The Turns are unaffected. Never true of the Base Tune (base_band_gaps_never_stale).';

-- ---------------------------------------------------------------------------
-- Minting, now through the guard
-- ---------------------------------------------------------------------------
-- Unchanged but for the two set_config calls around the band insert: the guard would otherwise
-- refuse the one write path the Rig Tune form has always had.

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

    SELECT count(*) INTO v_bases
      FROM jsonb_array_elements(p_bands) AS band
     WHERE COALESCE((band ->> 'is_base')::BOOLEAN, FALSE);

    IF v_bases <> 1 THEN
        RAISE EXCEPTION 'a Rig Tune Version has exactly one Base Tune band, not %', v_bases
            USING ERRCODE = '22023';
    END IF;

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

    PERFORM set_config('layline.rig_tune_band_write', 'on', TRUE);

    INSERT INTO public.rig_tune_bands
        (version_id, low_kt, high_kt, is_base, label, note, gaps_stale, shrouds)
    SELECT v_version_id,
           (band ->> 'low_kt')::NUMERIC,
           (band ->> 'high_kt')::NUMERIC,
           COALESCE((band ->> 'is_base')::BOOLEAN, FALSE),
           NULLIF(BTRIM(COALESCE(band ->> 'label', '')), ''),
           NULLIF(BTRIM(COALESCE(band ->> 'note', '')), ''),
           COALESCE((band ->> 'gaps_stale')::BOOLEAN, FALSE),
           band -> 'shrouds'
      FROM jsonb_array_elements(p_bands) AS band;

    -- Closed again at once, so nothing else in a caller's transaction inherits the opening.
    PERFORM set_config('layline.rig_tune_band_write', '', TRUE);

    UPDATE public.boat_setup_artifacts
       SET current_version_id = v_version_id
     WHERE id = v_artifact_id;

    RETURN v_version_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Correcting a Version
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER for the reason mint is: RLS refuses a viewer exactly as it would the
-- statements sent one at a time. The Version row is locked FOR UPDATE first, which applies the
-- UPDATE policy, so a viewer gets no row and is refused before anything is written.
--
-- p_bands is the whole corrected table. A band carrying an "id" is one of this Version's own and
-- is updated in place, keeping that id; a band with none is inserted; a band of this Version
-- that the array does not name is deleted. A Race pointing at a deleted band is refused by
-- races' ON DELETE RESTRICT key -- the Server Action names those Races before it gets here.
--
-- Kept bands are written in two passes. Every one is first parked on a placeholder edge far
-- above any wind (and off the base and off the open top), and only then moved to where it is
-- going. A single pass would trip rig_tune_bands_one_base, rig_tune_bands_one_open_top or
-- UNIQUE (version_id, low_kt) half-way through any correction that moves the base or slides an
-- edge past another band's -- none of which can be deferred, the first two being partial
-- indexes. The table that results is the same; the placeholder exists only inside this call.
--
-- What it checks, and what it leaves to lib/boat/rigTune.ts, are mint's: exactly one Base Tune
-- here, contiguity in the app. It also refuses an effective_from that crosses a neighbouring
-- Version's, because which Version is in force on a date is answered by date (versionInForceOn),
-- and an out-of-order pair would make that answer depend on which one is looked at first.
-- gaps_stale is stored as sent: a correction is the sailor's statement about staleness, and is
-- never recomputed here or on any other Version (ADR 0031).
--
-- It never touches boat_setup_artifacts.current_version_id: a correction changes what a Version
-- says, not which one the boat is set to.

CREATE OR REPLACE FUNCTION public.correct_rig_tune_version(
    p_version_id     UUID,
    p_effective_from DATE,
    p_note           TEXT,
    p_bands          JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_artifact_id UUID;
    v_number      INTEGER;
    v_bases       INTEGER;
    v_previous    RECORD;
    v_next        RECORD;
    v_foreign     INTEGER;
    v_repeated    INTEGER;
BEGIN
    IF p_bands IS NULL
       OR jsonb_typeof(p_bands) <> 'array'
       OR jsonb_array_length(p_bands) = 0 THEN
        RAISE EXCEPTION 'a Rig Tune Version needs at least one Wind Band'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_bases
      FROM jsonb_array_elements(p_bands) AS band
     WHERE COALESCE((band ->> 'is_base')::BOOLEAN, FALSE);

    IF v_bases <> 1 THEN
        RAISE EXCEPTION 'a Rig Tune Version has exactly one Base Tune band, not %', v_bases
            USING ERRCODE = '22023';
    END IF;

    -- Filtered on kind as well as id, so a caller-supplied id cannot reach a Version of any
    -- other kind -- and the lock is what applies the admin-only UPDATE policy.
    SELECT artifact_id, version_number INTO v_artifact_id, v_number
      FROM public.boat_setup_versions
     WHERE id = p_version_id AND kind = 'rig_tune'
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no Rig Tune Version % is correctable by this account', p_version_id
            USING ERRCODE = '42501';
    END IF;

    SELECT version_number, effective_from INTO v_previous
      FROM public.boat_setup_versions
     WHERE artifact_id = v_artifact_id AND version_number < v_number
     ORDER BY version_number DESC
     LIMIT 1;

    IF FOUND AND p_effective_from < v_previous.effective_from THEN
        RAISE EXCEPTION 'v% cannot take effect before v%, which took effect on %',
            v_number, v_previous.version_number, v_previous.effective_from
            USING ERRCODE = '22023';
    END IF;

    SELECT version_number, effective_from INTO v_next
      FROM public.boat_setup_versions
     WHERE artifact_id = v_artifact_id AND version_number > v_number
     ORDER BY version_number ASC
     LIMIT 1;

    IF FOUND AND p_effective_from > v_next.effective_from THEN
        RAISE EXCEPTION 'v% cannot take effect after v%, which took effect on %',
            v_number, v_next.version_number, v_next.effective_from
            USING ERRCODE = '22023';
    END IF;

    -- A kept band must be one of this Version's own, and named once: an id from another
    -- Version would otherwise be silently ignored by the UPDATE below rather than refused.
    SELECT count(*) INTO v_foreign
      FROM jsonb_array_elements(p_bands) AS band
     WHERE band ->> 'id' IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.rig_tune_bands b
            WHERE b.id = (band ->> 'id')::UUID AND b.version_id = p_version_id
       );

    IF v_foreign > 0 THEN
        RAISE EXCEPTION 'a corrected band names an id that is not one of v%''s bands', v_number
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*) - count(DISTINCT band ->> 'id') INTO v_repeated
      FROM jsonb_array_elements(p_bands) AS band
     WHERE band ->> 'id' IS NOT NULL;

    IF v_repeated > 0 THEN
        RAISE EXCEPTION 'a corrected table names the same band twice'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.boat_setup_versions
       SET note = p_note,
           effective_from = p_effective_from
     WHERE id = p_version_id;

    PERFORM set_config('layline.rig_tune_band_write', 'on', TRUE);

    -- Removed first, so neither pass below collides with a band that is on its way out.
    DELETE FROM public.rig_tune_bands b
     WHERE b.version_id = p_version_id
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_bands) AS band
            WHERE (band ->> 'id')::UUID = b.id
       );

    -- Pass one: park every kept band off the base, off the open top, on an edge of its own.
    UPDATE public.rig_tune_bands b
       SET is_base = FALSE,
           gaps_stale = FALSE,
           low_kt = 1000000 + parked.n,
           high_kt = 1000000 + parked.n + 0.5
      FROM (
          SELECT (band ->> 'id')::UUID AS id, row_number() OVER () AS n
            FROM jsonb_array_elements(p_bands) AS band
           WHERE band ->> 'id' IS NOT NULL
      ) AS parked
     WHERE b.id = parked.id;

    -- Pass two: every kept band where it is going.
    UPDATE public.rig_tune_bands b
       SET low_kt = (band ->> 'low_kt')::NUMERIC,
           high_kt = (band ->> 'high_kt')::NUMERIC,
           is_base = COALESCE((band ->> 'is_base')::BOOLEAN, FALSE),
           label = NULLIF(BTRIM(COALESCE(band ->> 'label', '')), ''),
           note = NULLIF(BTRIM(COALESCE(band ->> 'note', '')), ''),
           gaps_stale = COALESCE((band ->> 'gaps_stale')::BOOLEAN, FALSE),
           shrouds = band -> 'shrouds'
      FROM jsonb_array_elements(p_bands) AS band
     WHERE band ->> 'id' IS NOT NULL
       AND b.id = (band ->> 'id')::UUID;

    INSERT INTO public.rig_tune_bands
        (version_id, low_kt, high_kt, is_base, label, note, gaps_stale, shrouds)
    SELECT p_version_id,
           (band ->> 'low_kt')::NUMERIC,
           (band ->> 'high_kt')::NUMERIC,
           COALESCE((band ->> 'is_base')::BOOLEAN, FALSE),
           NULLIF(BTRIM(COALESCE(band ->> 'label', '')), ''),
           NULLIF(BTRIM(COALESCE(band ->> 'note', '')), ''),
           COALESCE((band ->> 'gaps_stale')::BOOLEAN, FALSE),
           band -> 'shrouds'
      FROM jsonb_array_elements(p_bands) AS band
     WHERE band ->> 'id' IS NULL;

    PERFORM set_config('layline.rig_tune_band_write', '', TRUE);
END;
$$;

COMMENT ON FUNCTION public.correct_rig_tune_version(UUID, DATE, TEXT, JSONB) IS
    'Corrects a Rig Tune Version in place for a recording mistake (ADR 0031): its note, its effective_from and its whole band table, in one transaction. Bands carrying an id are updated and keep it, bands without one are inserted, and bands the table no longer names are deleted -- which a Race pointing at one refuses (ON DELETE RESTRICT). Refuses a table without exactly one Base Tune, an id that is not one of this Version''s bands, and an effective_from before the previous Version''s or after the next one''s. Stores gaps_stale as sent and never recomputes it. Never moves the current pointer, and never moves a Race''s pointers. SECURITY INVOKER, so RLS refuses a viewer.';

REVOKE EXECUTE ON FUNCTION public.correct_rig_tune_version(UUID, DATE, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.correct_rig_tune_version(UUID, DATE, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.correct_rig_tune_version(UUID, DATE, TEXT, JSONB) TO authenticated;

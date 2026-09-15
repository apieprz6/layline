-- Minting a Boat Setup Version, and moving the artifact's current pointer to it, in one
-- transaction.
--
-- Related: docs/adr/0011-one-versions-table-with-jsonb-payloads.md,
--          docs/adr/0013-orphaned-bytes-over-orphaned-rows.md,
--          docs/adr/0018-the-server-owns-the-account.md,
--          docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md,
--          docs/design-docs/race-archive-schema.md
--
-- Why a function at all: the two writes cannot be two requests. The pointer's foreign key is
-- DEFERRABLE INITIALLY DEFERRED and boat_setup_artifacts_forward_only_current is a deferred
-- constraint trigger, both so that inserting a Version and pointing the artifact at it can be
-- one transaction -- and supabase-js has no way to open one. Two separate requests would leave
-- an artifact whose Version exists but which nothing points at, on any failure between them.
--
-- SECURITY INVOKER, deliberately: this function is convenience, not authority. Every statement
-- in it runs as the caller and under the same RLS policies as a direct write, so the admin
-- check stays exactly where the rest of the app's writes have it (ADR 0019) and a signed-in
-- non-admin calling this gets the same refusal as a signed-in non-admin inserting a row.
--
-- The version id is the caller's, not a DEFAULT: the permanent Storage path contains it, and
-- the bytes move to that path before this transaction commits (ADR 0013). Same reasoning as
-- recordings.id having no DEFAULT.

CREATE OR REPLACE FUNCTION public.mint_boat_setup_version(
    p_version_id     UUID,
    p_kind           public.boat_setup_kind,
    p_effective_from DATE,
    p_payload        JSONB,
    p_note           TEXT DEFAULT NULL,
    p_filename       TEXT DEFAULT NULL,
    p_content_sha256 TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_artifact_id UUID;
    v_number      INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'a Version needs an author; nobody is signed in';
    END IF;

    -- One boat (boats_singleton), and UNIQUE (boat_id, kind) on the artifacts, so the kind
    -- names the artifact on its own. STRICT: a missing artifact means the seed did not run,
    -- which is a broken invariant and not a state to write around.
    SELECT id INTO STRICT v_artifact_id
    FROM public.boat_setup_artifacts
    WHERE kind = p_kind;

    -- The next number, read under the caller's own RLS. A concurrent second upload can read
    -- the same MAX; UNIQUE (artifact_id, version_number) is what settles it, and the loser is
    -- told to try again rather than quietly overwriting the winner.
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number
    FROM public.boat_setup_versions
    WHERE artifact_id = v_artifact_id;

    INSERT INTO public.boat_setup_versions (
        id, artifact_id, kind, version_number, effective_from,
        note, created_by, filename, content_sha256, payload
    ) VALUES (
        p_version_id, v_artifact_id, p_kind, v_number, p_effective_from,
        -- A note the sailor left blank is no note. Stored as NULL rather than as an empty
        -- string, so "there is no note" has one spelling.
        NULLIF(BTRIM(COALESCE(p_note, '')), ''),
        -- The author is the session's, never the caller's to state (ADR 0018).
        auth.uid(),
        p_filename, p_content_sha256, p_payload
    );

    UPDATE public.boat_setup_artifacts
    SET current_version_id = p_version_id,
        updated_at = NOW()
    WHERE id = v_artifact_id;

    -- A pointer that would move backwards is refused by the deferred constraint trigger at
    -- commit, not here: this function does not re-implement that check, so there is one
    -- place it lives.

    RETURN v_number;
END;
$$;

COMMENT ON FUNCTION public.mint_boat_setup_version(UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT) IS
    'Insert the next Version of one Boat Setup artifact and move its current pointer to it, in one transaction. Returns the version_number minted. SECURITY INVOKER: RLS decides who may, exactly as it does for a direct insert.';

REVOKE EXECUTE ON FUNCTION public.mint_boat_setup_version(UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_boat_setup_version(UUID, public.boat_setup_kind, DATE, JSONB, TEXT, TEXT, TEXT) TO authenticated;

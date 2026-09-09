-- Storage bucket for Recordings and the file-backed Boat Setup Versions.
--
-- Related: docs/adr/0008-provenance-not-rawness-for-instrument-data.md,
--          docs/adr/0010-a-race-is-testimony-over-an-immutable-transcription.md
--
-- Access: any signed-in user may read, only a profile with role = 'admin' may write.
-- Guests keep the weather dashboard, which holds no boat data, so they get nothing here.

-- ---------------------------------------------------------------------------
-- Admin predicate
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because a policy on storage.objects would otherwise read
-- public.profiles under that table's own RLS, which coincidentally permits it today
-- (a user may read their own row) but would break the moment profiles' policies change.
-- The boat-side table policies reuse this function rather than re-deriving the check.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.user_id = auth.uid()
          AND profiles.role = 'admin'
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS
    'True when the calling user''s profile carries role = ''admin''. SECURITY DEFINER so a storage policy can read profiles without depending on that table''s RLS.';

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Private: every read goes through a signed URL or an authenticated client.
--
-- file_size_limit is 10 MB against a largest-file-today of 178 KB. A 40-60 hour
-- Race to Mackinac recording projects to well under 1 MB at the archive's observed
-- rows-per-hour, so this is generous headroom that still refuses a mis-dropped file.
-- It also sits under the Free plan's own 50 MB per-file ceiling, which cannot be
-- raised without leaving the plan, so this bucket limit is the one that binds.
--
-- allowed_mime_types is deliberately NULL. A browser reports .csv as any of text/csv,
-- application/vnd.ms-excel or nothing at all, and .pol / .sailselect / .saildesc are
-- extensions no browser knows, so a MIME allowlist would reject good files and admit
-- bad ones. ADR 0009 already makes parsing the gate; MIME would be theatre.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('boat', 'boat', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Path convention
-- ---------------------------------------------------------------------------
-- An invariant the schema depends on:
--
--   recordings/{recording_id}/{filename}         one qtVlm VDR export, as one Recording
--   boat-setup/{kind}/{version_id}/{filename}    one file-backed Boat Setup Version
--   tmp/{user_id}/{upload_id}/{filename}         an upload wizard not yet submitted
--
-- Keyed on recording_id and never on race_id: one export file may back several
-- Recordings, because a regatta day is uploaded once per race, and a Recording is
-- never shared between Races (ADR 0010).
--
-- Only three of the five Boat Setup artifacts are file-backed -- Polar, Crossover
-- Chart, Sail Definitions. A Rig Tune and an Instrument Calibration are entered by
-- hand and never reach Storage at all, so neither has a path here.
--
-- {filename} is the sailor's own filename, sanitised only as far as a Storage key
-- requires. The verbatim original is a column on the row, so nothing ever parses a
-- path to recover it.
--
-- tmp/ exists because nothing is written to Postgres until wizard submit (ADR 0010):
-- bytes land under tmp/ and move to their permanent path in the same operation that
-- writes the Recording, so an abandoned wizard leaves no row. user_id and upload_id
-- are there for cleanup attribution, not enforcement -- the write policy is admin-only
-- and reads neither.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Deliberately NO "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY" here.
-- Supabase enabled it in the storage schema's own migration 0002, the table is owned
-- by supabase_storage_admin, and since 2025-04-21 the postgres role no longer holds
-- that membership -- so the statement fails 42501 on a hosted project. Because a
-- migration is one transaction, the abort would surface as an error on the *next*
-- statement, making a CREATE POLICY below look like the culprit. CREATE POLICY itself
-- is permitted without ownership, via supautils' policy_grants allowlist.
--
-- The admin check is wrapped as (SELECT public.is_admin()) so the planner hoists it
-- into an initPlan and evaluates it once per statement instead of once per row.
--
-- UPDATE is granted because that is what a move needs -- an upload wizard moves its
-- bytes from tmp/ to their permanent path on submit.
--
-- The SELECT policy permits listing the bucket as well as reading objects, both being
-- SQL SELECT. That is intended: the archive is browsable to anyone signed in. If it
-- ever should not be, the tightening is storage.allow_any_operation(...), not a
-- narrower bucket_id test.

CREATE POLICY "Signed-in users can read boat objects"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'boat');

CREATE POLICY "Admins can upload boat objects"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'boat' AND (SELECT public.is_admin()));

CREATE POLICY "Admins can move or replace boat objects"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'boat' AND (SELECT public.is_admin()))
    WITH CHECK (bucket_id = 'boat' AND (SELECT public.is_admin()));

CREATE POLICY "Admins can delete boat objects"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'boat' AND (SELECT public.is_admin()));

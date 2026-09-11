-- A Profile exists for every account, and a Role can only be set from outside the app.
--
-- Related: docs/adr/0017-a-trigger-makes-the-profile-and-a-role-is-never-null.md
--          docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md
--          docs/adr/0020-google-is-the-only-door.md
--
-- Before this migration nothing created a `profiles` row — the only trigger on the table
-- fires BEFORE UPDATE — and `role` was bare TEXT with no default and no constraint, which
-- let any signed-in account write `role = 'admin'` on its own row (LAY-117).
--
-- Verification against the local stack: docs/testing/profile-trigger-and-role-lock.md

-- ---------------------------------------------------------------------------
-- A Role is never null, and is one of exactly two values
-- ---------------------------------------------------------------------------
-- The CHECK matters more here than it would elsewhere, because the SQL console *is* the
-- role-assignment UI (ADR 0017): a mistyped role should fail loudly at the console rather
-- than read later as an account TypeScript believes is well-typed.

UPDATE public.profiles SET role = 'viewer' WHERE role IS NULL;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'viewer'));

COMMENT ON COLUMN public.profiles.role IS
    'Flat permission level governing writes only: admin writes Races and Boat Setup, viewer writes neither. Never null. Granted by hand through the SQL console or the service role — never writable by the account that holds it. See docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md.';

-- ---------------------------------------------------------------------------
-- Where a Display Name comes from
-- ---------------------------------------------------------------------------
-- Google is the only door (ADR 0020), so Google's profile metadata is the only source of a
-- name. It writes both keys; LAY-115 found `name` is the one to prefer. An account that
-- granted no `profile` scope supplies neither, and then there is no name: null is stored as
-- null and never synthesised from the email address (AGENTS.md, ADR 0021).

CREATE OR REPLACE FUNCTION public.display_name_from_metadata(metadata JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        NULLIF(TRIM(metadata ->> 'name'), ''),
        NULLIF(TRIM(metadata ->> 'full_name'), '')
    );
$$;

COMMENT ON FUNCTION public.display_name_from_metadata(JSONB) IS
    'The Display Name carried by an auth.users row''s raw_user_meta_data, preferring ''name'' over ''full_name'', or NULL when the source carries neither. Never derived from the email address.';

-- Only the trigger functions below call this, and they run as the table owner, so no client
-- role needs EXECUTE. Revoking from PUBLIC alone would change nothing: Supabase's default
-- privileges grant EXECUTE to anon and authenticated by name, and a PUBLIC revoke does not
-- reach a named grant — the same trap as the column revoke at the foot of this file.

REVOKE EXECUTE ON FUNCTION public.display_name_from_metadata(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.display_name_from_metadata(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.display_name_from_metadata(JSONB) FROM authenticated;

-- ---------------------------------------------------------------------------
-- A trigger makes the Profile
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the insert runs as the table owner rather than as the auth service's
-- role, and AFTER INSERT on auth.users so it lands in the same transaction as the account:
-- a Profile cannot fail to exist. The owner creates every account by hand in Supabase
-- Studio (ADR 0020), where no application code runs, which is why this lives in the
-- database rather than in the Auth Sheet.
--
-- `role` is left to its DEFAULT, so every account starts as a viewer.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, user_id, display_name)
    VALUES (NEW.id, NEW.id, public.display_name_from_metadata(NEW.raw_user_meta_data))
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Creates the Profile for a new account in the same transaction, with role defaulting to viewer. See docs/adr/0017-a-trigger-makes-the-profile-and-a-role-is-never-null.md.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- The accounts that already exist get one too
-- ---------------------------------------------------------------------------
-- The trigger above fires on INSERT, so it never runs for an account created before this
-- migration — and nothing has ever inserted a `profiles` row, so every existing account is
-- Profile-less, including the owner's own. Without this the promise that a Profile exists for
-- every account would hold only for accounts made from now on.
--
-- These land as viewers like everybody else. The owner's `admin` is granted by hand
-- afterwards, in the SQL console: `UPDATE public.profiles SET role = 'admin' WHERE user_id =
-- '<the owner''s uuid>';`. Nothing here guesses which account that is.

INSERT INTO public.profiles (id, user_id, display_name)
SELECT users.id, users.id, public.display_name_from_metadata(users.raw_user_meta_data)
  FROM auth.users
 ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- A later sign-in refreshes the Display Name
-- ---------------------------------------------------------------------------
-- Not decoration: a hand-created account carries no name at all, because Studio's "Create
-- new user" modal has no name field. The name arrives later, when the sailor first signs in
-- with Google and that identity is linked onto the row — which updates raw_user_meta_data.
-- Without this trigger, display_name would be null for every account that exists.
--
-- A Google-sourced overwrite of an existing name is accepted (LAY-125), since nothing in
-- the app edits the name and so there is no sailor's edit to protect. What it will not do is
-- overwrite a name with nothing: metadata carrying no name leaves the stored name alone,
-- rather than destroying a value a source did give us (AGENTS.md).

CREATE OR REPLACE FUNCTION public.handle_user_metadata_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    incoming TEXT;
BEGIN
    incoming := public.display_name_from_metadata(NEW.raw_user_meta_data);

    IF incoming IS NOT NULL THEN
        UPDATE public.profiles
           SET display_name = incoming
         WHERE public.profiles.id = NEW.id
           AND public.profiles.display_name IS DISTINCT FROM incoming;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_user_metadata_change() IS
    'Refreshes a Profile''s display_name when an account''s raw_user_meta_data changes, which is how a hand-created account first gets a name — at the sailor''s first Google sign-in. Never clears a name that metadata no longer carries.';

DROP TRIGGER IF EXISTS on_auth_user_metadata_changed ON auth.users;
CREATE TRIGGER on_auth_user_metadata_changed
    AFTER UPDATE OF raw_user_meta_data ON auth.users
    FOR EACH ROW
    WHEN (NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data)
    EXECUTE FUNCTION public.handle_user_metadata_change();

-- ---------------------------------------------------------------------------
-- A Role is not writable by the account that holds it
-- ---------------------------------------------------------------------------
-- The own-row UPDATE policy in 20260501215158_create_profiles_table.sql:61-65 restricts no
-- column, so any signed-in account could run `.update({ role: 'admin' })` on itself and
-- become the admin that every boat-write policy checks (LAY-117). The policy cannot simply
-- be dropped: display_name and preferences live in the same row and a sailor writes both.
--
-- So the raise keys on the caller's JWT role. `auth.role()` reads request.jwt.claims, which
-- PostgREST sets per request from the end-user's token, and which is absent for the SQL
-- console and the service role — the one path ADR 0017 designated for assigning a Role.
--
-- Admins are deliberately not exempt: there is no role-assignment UI and none is planned,
-- so an admin acting through the app has no business changing a role either.

-- It covers INSERT as well as UPDATE. The own-row INSERT policy from
-- 20260501215158_create_profiles_table.sql:68-71 is the same hole by another verb, and while
-- the Profile trigger above means a self-insert now collides with the primary key, resting the
-- boundary on a collision would be resting it on an accident.

CREATE OR REPLACE FUNCTION public.enforce_role_not_self_written()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    refused BOOLEAN;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- There is no OLD row to compare against, and a client may create nothing but a
        -- viewer, which is what the DEFAULT gives it.
        refused := NEW.role IS DISTINCT FROM 'viewer';
    ELSE
        refused := NEW.role IS DISTINCT FROM OLD.role;
    END IF;

    IF refused THEN
        RAISE EXCEPTION 'A Role may not be written by the account that holds it'
            USING ERRCODE = '42501',
                  HINT = 'Set profiles.role from the SQL console or the service role. See docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md.';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_role_not_self_written() IS
    'Raises when a write carrying an end-user JWT changes profiles.role, or inserts anything other than a viewer. Not exempt for admins. See docs/adr/0019-a-closed-front-door-and-a-role-the-account-cannot-write.md.';

DROP TRIGGER IF EXISTS enforce_profiles_role_not_self_written ON public.profiles;
CREATE TRIGGER enforce_profiles_role_not_self_written
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_role_not_self_written();

-- The second lock: column privileges are checked independently of RLS, so an authenticated
-- client should not hold UPDATE or INSERT on `role` at all. This is not the primary
-- mechanism — a later `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`, a common
-- Supabase idiom, silently undoes a column revoke, whereas the trigger above survives it
-- (ADR 0019).
--
-- The table-level grant has to come off first. Postgres does not decompose a table-level
-- privilege into columns, so `REVOKE UPDATE (role)` against a role holding table-wide
-- UPDATE succeeds and changes nothing — verified against the local stack. Every column
-- except `role` is then granted back, leaving the client exactly where it was otherwise.
--
-- Because that list is written out, a column added to `profiles` later is unwritable by an
-- authenticated client until its migration grants it. That is the cost of the revoke, and
-- the note to whoever adds one.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (id, user_id, display_name, preferences, created_at, updated_at)
    ON public.profiles TO authenticated;
REVOKE UPDATE (role) ON public.profiles FROM authenticated;

REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, user_id, display_name, preferences, created_at, updated_at)
    ON public.profiles TO authenticated;
REVOKE INSERT (role) ON public.profiles FROM authenticated;

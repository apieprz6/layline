# Profile Trigger and Role Lock — Local Verification

Verification record and re-run guide for
`supabase/migrations/20260911213000_profile_trigger_and_role_lock.sql` (LAY-125).

The behaviour this migration adds is SQL, so no Jest test can reach it: it needs a live
database. ADR 0019 says as much — the trigger "may not be reported as working on an agent's
word". This is the record of running it, and the recipe for running it again.

**Run on 2026-09-11 against the local stack** (Supabase CLI containers, DB on
`127.0.0.1:54322`, API on `127.0.0.1:54321`): **29 of 29 checks passed**. What is *not*
covered here is the Google OAuth round trip itself and the hosted project's behaviour;
neither is reachable from this environment.

## Prerequisites

```bash
supabase start
supabase db reset          # applies every migration in order
supabase status            # note the anon and service_role keys
```

Accounts are created the way the owner creates them — through the Auth admin API, which is
what Studio's "Create new user" modal calls (ADR 0020). Substitute your local keys and
connection string:

```bash
export SERVICE_KEY='<service_role key from supabase status>'
export ANON_KEY='<anon key from supabase status>'
export DB='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
```

## 1. The schema owns the Role

```bash
psql "$DB" -c "\d public.profiles"
```

**Expected**: `role text NOT NULL DEFAULT 'viewer'::text`, plus

```
"profiles_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'viewer'::text]))
```

An authenticated client must hold neither `UPDATE` nor `INSERT` on the column:

```sql
SELECT privilege_type, column_name
  FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND grantee = 'authenticated' AND privilege_type IN ('UPDATE', 'INSERT')
 ORDER BY privilege_type, column_name;
```

**Observed**, for both verbs: `created_at, display_name, id, preferences, updated_at,
user_id` — every column except `role`.

> A bare `REVOKE UPDATE (role)` is not enough on its own, and this is where that was
> established: run it alone against a role that holds table-wide `UPDATE` and Postgres
> reports success while `role` stays in the list above, because a table-level privilege is
> not decomposed into columns. The migration therefore revokes at the table level and grants
> the other columns back.

The same trap, checked on the display-name helper, which no client should be able to call:

```sql
SELECT has_function_privilege('authenticated',
                              'public.display_name_from_metadata(jsonb)', 'EXECUTE');
```

**Observed**: `false` for both `anon` and `authenticated` — which needs the named revokes,
because Supabase's default privileges grant those two roles `EXECUTE` explicitly and a
`REVOKE … FROM PUBLIC` leaves a named grant standing.

## 2. A hand-created account gets a Profile

```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"crew@example.test","password":"studio-modal-requires-one","email_confirm":true}'
```

```sql
SELECT id, user_id, display_name, role, preferences FROM public.profiles;
```

**Observed**: one row, `role = 'viewer'`, `display_name = NULL`, `preferences = {}`, and the
account's UUID in both `id` and `user_id`.

The null `display_name` is the point, not an omission: Studio's modal has no name field, so
the source supplied no name, and a Display Name is never synthesised from the address
(AGENTS.md, ADR 0021).

## 3. A name comes from metadata, preferring `name`

Create with `"user_metadata": {"name":"Aria Sandoval","full_name":"Aria R. Sandoval"}`.

**Observed**: `display_name = 'Aria Sandoval'`. With `full_name` alone, `display_name` takes
`full_name`. This is the order LAY-115 found and ADR 0020 recorded.

## 4. A later sign-in fills the name in

The Google name arrives *after* the account exists — a hand-created row has none until the
sailor's first Google sign-in links that identity and updates `raw_user_meta_data`. Simulate
that update:

```bash
curl -s -X PUT "http://127.0.0.1:54321/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"user_metadata":{"name":"Kestrel Okonkwo"}}'
```

**Observed**, in order:

| Metadata written | `display_name` after |
| --- | --- |
| `{"name":"Kestrel Okonkwo"}` onto a null name | `Kestrel Okonkwo` |
| `{"name":"Kestrel O."}` onto an existing name | `Kestrel O.` — the accepted Google overwrite |
| `{"picture":"…"}`, carrying no name | `Kestrel O.` — unchanged, not cleared |

The last row is the data-integrity rule: metadata with no name does not destroy a name a
source did give us.

## 5. The accounts that already existed get one too

The trigger fires on INSERT, so it cannot reach an account created before the migration —
and nothing ever inserted a `profiles` row, so *every* account that exists today is
Profile-less, the owner's included. To reproduce that state, delete a Profile and re-run the
migration's backfill statement:

```sql
DELETE FROM public.profiles WHERE id = '<user uuid>';        -- the pre-migration state

INSERT INTO public.profiles (id, user_id, display_name)
SELECT users.id, users.id, public.display_name_from_metadata(users.raw_user_meta_data)
  FROM auth.users
 ON CONFLICT (id) DO NOTHING;
```

**Observed**: the Profile comes back with `role = 'viewer'` and the name from the account's
metadata, and every other Profile is untouched (the statement is safe to re-run).

> **Operational consequence, on the hosted project as much as here**: those backfilled
> accounts are **viewers**, including the owner's. Nothing in the migration guesses which
> account is the admin. After deploying, grant it in the SQL console:
>
> ```sql
> UPDATE public.profiles SET role = 'admin' WHERE user_id = '<the owner''s uuid>';
> ```
>
> Until that runs, `public.is_admin()` is false for everyone and no boat write is permitted.

## 6. An authenticated client cannot write its own Role

With a signed-in account's access token as `$USER_TOKEN`:

```bash
curl -s -o /dev/stdout -w ' HTTP %{http_code}\n' \
  -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$USER_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' -d '{"role":"admin"}'
```

**Observed**:

```
{"code":"42501","details":null,"hint":null,"message":"permission denied for table profiles"} HTTP 403
```

and the row still reads `role = 'viewer'`. This is the escalation LAY-117 found in the
unrestricted own-row `UPDATE` policy, now refused.

The same client, same token, writing the two fields it legitimately owns:

```bash
curl -s -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$USER_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"Aria Sandoval","preferences":{"dataSources":{}}}'
```

**Observed**: `HTTP 200`. The lock is on `role`, not on the row.

## 7. Nor through the INSERT verb

The own-row INSERT policy from `20260501215158_create_profiles_table.sql:68-71` is the same
hole by another verb, and it is reachable exactly when a Profile is missing. Delete one
first, then, as that account:

```bash
curl -s -o /dev/stdout -w ' HTTP %{http_code}\n' -X POST 'http://127.0.0.1:54321/rest/v1/profiles' \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$USER_ID\",\"user_id\":\"$USER_ID\",\"role\":\"admin\"}"
```

**Observed**: `42501 permission denied for table profiles`, `HTTP 403`, and no Profile
created by the attempt.

## 8. Both locks, and the trigger alone

ADR 0019's reason for keeping the trigger *and* the revoke, demonstrated. In a transaction
that is rolled back afterwards, hand the column privileges back the way a careless later
migration would:

```sql
BEGIN;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;   -- undoes the column revokes
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', '<user uuid>', 'role', 'authenticated')::text, true);

UPDATE public.profiles SET role = 'admin' WHERE id = '<user uuid>';               -- refused
INSERT INTO public.profiles (id, user_id, role) VALUES (…, …, 'admin');           -- refused
INSERT INTO public.profiles (id, user_id) VALUES (…, …);                          -- allowed
ROLLBACK;
```

**Observed**, for both refusals:

```
ERROR:  42501: A Role may not be written by the account that holds it
HINT:  Set profiles.role from the SQL console or the service role. See docs/adr/0019-…
```

The third statement succeeds: a client may still create its own viewer row, which is all the
INSERT policy was ever for.

## 9. The console can still grant admin, and a typo fails loudly

Run as `postgres`, with no `request.jwt.claims` set — the SQL console's context, which is
the role-assignment UI (ADR 0017):

```sql
UPDATE public.profiles SET role = 'admin'   WHERE id = '<user uuid>';  -- succeeds
UPDATE public.profiles SET role = 'skipper' WHERE id = '<user uuid>';  -- 23514 check constraint
UPDATE public.profiles SET role = NULL      WHERE id = '<user uuid>';  -- 23502 not-null
```

**Observed**: exactly that — `admin` lands, and both bad values are refused by name.

## 10. Deleting the account removes the Profile

```bash
curl -s -X DELETE "http://127.0.0.1:54321/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

**Observed**: the `profiles` row goes with it, through the existing
`ON DELETE CASCADE` — so the test accounts above leave nothing behind.

## Not covered

- **The Google OAuth round trip.** No browser and no Google client in this environment. That
  a linked sign-in updates `raw_user_meta_data` is Supabase's behaviour, researched under
  LAY-115 and ADR 0020; step 4 verifies only what our trigger does when it changes.
- **The hosted project.** Every observation above is the local stack — including step 5's
  backfill, which on the hosted project will meet real accounts rather than a deleted row.

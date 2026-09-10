# ADR 0017: A Trigger Makes the Profile, and a Role Is Never Null

## Status

Accepted

## Context

LAY-53 says `display_name` is "populated from the sign-up form (email/password flow) or
`raw_user_meta_data.full_name` (Google OAuth flow)" and never says *by what*. The answer turns out to
be nothing: no code writes to `profiles` anywhere in the repo, and the only trigger on the table is
`update_profiles_updated_at`, which fires `BEFORE UPDATE` and so never runs for a row that was never
inserted. A sailor who signs up today gets an `auth.users` row and no **Profile** — nowhere for a
display name, a role, or preferences to land.

Three further facts came out of charting the account map:

- **`role` is bare `TEXT`** (`20260501215158_create_profiles_table.sql:8`), with no `CHECK`, no enum and
  no default, still commented "future use for crew/skipper permissions". `'admin' | 'user'` is enforced
  only in `types/index.ts`; nothing stops the column holding `'skipper'`.
- **ADR 0004 leaves `role` null at sign-up**, "assigned later" — and names no surface that assigns it.
  A signed-in sailor with a null role is a third state no screen was designed for.
- **`'user'` names nothing.** Every account is a user; the distinction ADR 0004 was reaching for is
  what the account may *do*.

## Decision

### A Postgres trigger creates the Profile

A `SECURITY DEFINER` function on `AFTER INSERT ON auth.users` inserts the **Profile**, taking the
display name from `NEW.raw_user_meta_data`. It runs in the same transaction as the account, so a
**Profile** cannot fail to exist.

The alternative — the **Auth Sheet** inserting the row itself after `signUp` — was rejected on the
strength of how this app is actually administered. **Admin is granted by hand** (below), so accounts
made and edited directly in Supabase are a first-class path, not an edge case, and application code
never runs for them. It would also have to be written twice, once in the sheet and once in the OAuth
callback, and it can half-succeed: an account with no **Profile** is precisely the broken state the
database is in today, and app-side creation makes it reachable at runtime rather than only historically.

The cost is real and accepted: the logic is SQL, invisible from TypeScript and outside the
component-boundary tests LAY-53 specifies. It also puts a requirement on the sign-up form, which must
pass the name through `signUp({ options: { data: … } })` for it to reach `raw_user_meta_data` at all.

### `viewer`, not `user`

A **Role** is `admin` or `viewer`. `types/index.ts:121` is renamed and ADR 0004 amended. Cheap now: the
type is referenced only by an unused `User` interface, and no auth UI exists to update.

### A Role is never null

`role` is `NOT NULL DEFAULT 'viewer'` with a `CHECK` constraint, existing rows backfilled in the same
migration. Every account starts as a viewer, which collapses the null state out of existence rather
than leaving each screen to invent a reading for it.

The `CHECK` matters more here than it would in most schemas, because the SQL console *is* the
role-assignment UI. A mistyped role should fail at the console, loudly, rather than read later as an
account TypeScript believes is well-typed.

### Admin is granted by hand

There is no role-assignment UI and none is planned. Admin is set directly through Supabase. For a
single-boat app whose owner is the only admin, a UI to grant a role to nobody else is not worth
building.

## Consequences

- **This amends ADR 0004 on three points**: `'user'` becomes `viewer`, `role` is no longer null at
  sign-up, and the Profile's creation mechanism is now specified rather than implied.
- **`CONTEXT.md`'s **Role** and **Profile** entries are corrected**, having repeated the null-role model
  and "created on first sign-up" as vocabulary.
- **The migration itself is not written here.** It belongs to the build the account map hands off, and
  carries the trigger, the role constraint and the backfill together.
- **`lib/supabase/service.ts:8-15` uses the anon key, not a service-role key.** No elevated write path
  exists, which is fine while roles are granted through Supabase directly, and a loose end the moment
  anything in the app needs to write another user's Profile.
- **`profiles.id` and `profiles.user_id` both reference `auth.users(id)`**, one as primary key and one as
  a unique column, so every row holds the same UUID twice and the RLS policies key off the second. Noted
  and deliberately left alone: untangling it touches every policy and buys nothing this effort needs.

## Alternatives considered

- **Insert the Profile from application code after `signUp`.** Rejected above: invisible to hand-made
  accounts, duplicated across the sheet and the OAuth callback, and able to half-fail. Its real
  advantage — being typed and testable behind the mocked Supabase client — was not enough to outweigh
  an account that can exist without a Profile.
- **Keep `role` nullable and assign it later.** Rejected: it is a third state with no screen behind it,
  and ADR 0004 never named the surface that would do the assigning.
- **Keep `'user'` for continuity with ADR 0004.** Rejected: nothing is built on it yet, so continuity
  costs nothing to break, and `'user'` fails to distinguish the thing it exists to distinguish.
- **A `CHECK` in TypeScript only, leaving `role` as `TEXT`.** Rejected: the type cannot see a hand-typed
  value in the SQL console, which is the only place roles are ever set.

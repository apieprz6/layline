# ADR 0019: A Closed Front Door, and a Role the Account Cannot Write

## Status

Accepted

## Context

LAY-117 asked what a `viewer` is granted and where that boundary is enforced. Most of the question
turned out to be answered already, somewhere other than an ADR — and underneath it was a hole.

**The read tier was already settled, and never given a decision record.** ADR 0015:12-14 states it in
passing, as a finding attributed to LAY-93:

> LAY-93 settled that there are exactly two reading tiers — guest and signed-in — and that `role`
> governs writes only.

Every ADR since treats `admin` purely as the writer (0010:33, 0010:61, 0011:94, 0012:110), never as a
read gate. The one RLS file in the repo implements it — `SELECT TO authenticated USING (bucket_id =
'boat')` in `20260909190000_create_boat_storage_bucket.sql:107-112` — and
`docs/design-docs/race-archive-schema.md:762-800` extends the same pattern per-table for the boat
schema LAY-101 is building now.

**Which puts the whole boundary on one predicate that its own subjects can rewrite.** ADR 0018:58-60
calls `public.is_admin()` "the only server-side authorization predicate the repo has". It reads
`profiles.role`. And `20260501215158_create_profiles_table.sql:64-68` permits an own-row `UPDATE` with
no column restriction:

```sql
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
```

So any signed-in account can run `.from('profiles').update({ role: 'admin' })` on itself and become an
admin. Every admin-write policy in the boat schema reduces to `authenticated`. The policy cannot simply
be dropped: `display_name` and `preferences` live in the same row and a sailor legitimately writes both.

**And if reads are flat, whoever can get an account reads the archive.** `supabase/config.toml:171` has
`enable_signup = true` locally; the hosted project's setting is not in the repo. A **Polar** and a
**Rig Tune** are the boat's target speeds and mast setup — the most competitively sensitive thing it
holds.

## Decision

### The read tier is ratified, not reopened

A signed-in **Account** reads every boat table and every stored byte; a **Guest** reads none; **Role**
governs writes only. This confirms LAY-93 and ADR 0015 rather than amending them, which is the point of
recording it: the finding was load-bearing for two ADRs and a shipped migration while living in a
subordinate clause.

Two read tiers — the boat but not the archive — was the real alternative and was rejected because
`viewer` has exactly one occupant: crew. Crew need target speeds *and* what the boat did last
Wednesday. Splitting them would leave a viewer reading performance charts measured against a **Boat
Setup** they cannot see, which is the one combination that makes the data unreadable.

This also closes a seam the corpus left open. ADR 0004 grants a viewer "boat performance" — one surface
— while ADR 0015/0016 lock **two**. Under a flat tier a viewer reads **both Boat management and Boat
performance**. ADR 0004's wording was narrow, not a boundary.

Because the tier is unchanged, **ADR 0015 and ADR 0016 need no amendment**: "the padlocks come off" and
"the order is stable across sign-in" both stand, and the drawer's gate stays session-based rather than
role-based.

### A Role is not writable by the account that holds it

A `BEFORE UPDATE` trigger on `profiles` raises when `NEW.role` differs from `OLD.role` and the caller's
JWT role is `authenticated`. Role changes are therefore reachable only from a context with no end-user
JWT — the SQL console and the service role — which is precisely the path ADR 0017 designated when it
made the console the role-assignment UI.

**Admins are deliberately not exempt.** ADR 0017 says there is no role-assignment UI and none is
planned, so an admin acting through the app has no business changing a role either. Exempting them
would widen the surface and reintroduce a bootstrap question for no gain.

`REVOKE UPDATE (role) ON public.profiles FROM authenticated` goes in alongside as a second lock, since
column privileges are checked independently of RLS. It is not the primary mechanism: a later
`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` — a common Supabase idiom — silently undoes
a column revoke, whereas a trigger survives it.

Both ride in the migration ADR 0017 deferred to this map's handoff, alongside the Profile trigger, the
`NOT NULL DEFAULT 'viewer'` and the `CHECK`. They are one concern: a role that exists for every account
and can be set from exactly one place.

The consequence worth naming: the boundary is Postgres, and the UI merely reflects it. A refused write
returns a database error, not a silent success. That only holds while admin writes go through the
sailor's own client — `app/api/buoys/poll-purdue/route.ts:27` shows the repo already has a
`SUPABASE_SERVICE_ROLE_KEY` path (gated by `CRON_SECRET`, and touching only buoy readings). **No boat
write may be routed through a service client**, or RLS stops being the boundary.

### Sign-up is closed

`enable_signup = false`. The owner creates crew accounts by hand in Supabase, which is already how
`admin` is granted.

With reads flat, sign-up *is* the access boundary — RLS cannot be the control, because RLS's answer is
"any authenticated user". A self-service door onto the boat's tuning guide is the one thing the flat
tier cannot absorb, and for a single-boat app with one owner and a handful of crew, a Sign up tab is a
door for nobody.

**This amends ADR 0004**: the **Auth Sheet** has **two** modes, not three — Sign in and Forgot password.
Google OAuth remains, as sign-*in* only, because `enable_signup = false` blocks new OAuth users too: a
stranger tapping "Continue with Google" is refused by Supabase rather than onboarded.

An allowlist — a `before_user_created` auth hook — would have kept the Sign up tab honest for invited
crew, and was rejected because it builds a mechanism to manage a list that the Supabase user table
already is.

## Consequences

- **ADR 0004 is amended twice.** The Sign up mode is removed, and the viewer grant widens from "boat
  performance" to both boat surfaces. `CONTEXT.md`'s **Role** and **Auth Sheet** entries are corrected
  to match.
- **LAY-118 is reframed, not answered.** "Does sign-up confirm by email" no longer describes a sheet
  state, because there is no Sign up tab — but the question survives as *how a hand-created account
  first gets in*, and LAY-115's hazard (an unconfirmed email+password account that then signs in with
  Google has its password nulled) now bites owner-created accounts instead of self-registered ones.
- **LAY-120 gains a checklist item**: set `enable_signup = false` on the hosted project, and confirm it
  against `config.toml:171` locally.
- **A locked-out crew member has no self-service door.** With no Sign up tab, a forgotten password must
  go through Forgot password, which requires the address on the account to be right — so whatever
  creates these accounts has to get the email right the first time.
- **Neither Boat management nor Boat performance has a glossary entry**, which is why the ADR 0004 /
  ADR 0015 seam above went unnoticed: both terms appear only as bolded prose inside other definitions.
  Noted and left to the boat map, which owns those surfaces.
- **Per-table RLS on the boat tables is not this decision's.** It is
  `docs/design-docs/race-archive-schema.md:762-800`, being built by LAY-101 under the boat map. That
  design is correct and unaffected — but its stated rationale is stale: it justifies the read tier with
  "`role` is `NULL` by default at sign-up", which ADR 0017 abolished. Same for LAY-101's acceptance
  criteria. The policies stand; the reasoning is now this ADR's first section.
- **Two things cannot be verified in the agent environment**: the hosted `enable_signup` setting, and
  the trigger itself, which needs a live database. Neither may be reported as working on an agent's
  word.
- **`types/index.ts:121` still reads `'admin' | 'user'`**. ADR 0017 already ordered that rename; noted
  again because `is_admin()` compares against the literal `'admin'` and a `CHECK` will now enforce the
  pair in SQL.

## Alternatives considered

- **Move `role` to its own `user_roles` table** with no write policy for `authenticated` — the
  Supabase-recommended shape, correct by construction. Rejected: it rewrites `public.is_admin()`, ADR
  0017's Profile trigger and ADR 0018's Account query to reach a state the trigger reaches now, and all
  three were settled this week.
- **Narrow the UPDATE policy's `WITH CHECK`.** Does not work: `WITH CHECK` sees only the new row, so
  comparing against the old `role` requires a subquery on `profiles` under its own RLS.
- **The column `REVOKE` alone.** Rejected as the primary mechanism: silently undone by a later
  `GRANT ALL`. Kept as a second lock.
- **Leave sign-up open and accept public reads.** Rejected. ADR 0004's "auth is additive, not
  gate-keeping" was written when an account granted preference sync; it now grants the archive.
- **A UI-only gate, with the database permissive.** Rejected: the anon key ships to the browser, so
  anyone can call the REST API directly. A UI gate is decoration.

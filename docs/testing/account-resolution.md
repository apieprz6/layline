# Account Resolution — Local Verification

Verification record and re-run guide for `lib/account/resolveAccount.ts` (LAY-126), the one
place the **Account** is resolved (ADR 0018).

Its Jest suite mocks Supabase, so it proves the *branching* — three `getClaims()` shapes, a
missing **Profile**, a null **Display Name** — and nothing about whether those shapes are
what a real Supabase returns. That is the third kind of test this folder exists for. The
`profiles` *writes* and the trigger were verified in
[`profile-trigger-and-role-lock.md`](./profile-trigger-and-role-lock.md); what is here is the
**read** the resolve makes, and `getClaims()` against a token a real server signed.

**Run on 2026-09-11 against the local stack** (API on `127.0.0.1:54321`, DB on
`127.0.0.1:54322`): everything below observed as written. What is **not** covered is the
Google OAuth round trip — no browser here, and Google blocks automated ones — so nothing on
this page came through the front door. The sessions were minted with the password grant,
which is the same access token from `resolveAccount()`'s point of view and is not a door the
app offers (ADR 0020).

## Prerequisites

Two accounts, made the way the owner makes them — through the Auth admin API, which is what
Studio's "Create new user" modal calls. One carries a `name` in its metadata and keeps the
default **Role**; the other carries none and is promoted with the service key, because a
sailor cannot promote themselves.

```bash
export ANON='<anon key from supabase status>'
export SERVICE_KEY='<service_role key from supabase status>'
export API='http://127.0.0.1:54321'

# A viewer with a name
curl -s -X POST "$API/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"lay126-resolve@example.com","password":"lay126-verification",
       "email_confirm":true,"user_metadata":{"name":"Alex Pieprzycki"}}'

# An admin whose grant carried no name
curl -s -X POST "$API/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"lay126-owner@example.com","password":"lay126-verification","email_confirm":true}'

curl -s -X PATCH "$API/rest/v1/profiles?user_id=eq.<owner uuid>" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'Content-Type: application/json' -d '{"role":"admin"}'

# A session each
curl -s -X POST "$API/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"lay126-resolve@example.com","password":"lay126-verification"}'
```

Then run the checks below through `@supabase/supabase-js` **from the repo root**, so Node
resolves the SDK the app itself uses.

## 1. The access token knows the address, and says nothing about the Role

```
{"iss":"http://127.0.0.1:54321/auth/v1","sub":"9c11001d-…","aud":"authenticated",
 "email":"lay126-resolve@example.com",
 "user_metadata":{"email_verified":true,"name":"Alex Pieprzycki"},
 "role":"authenticated","aal":"aal1","amr":[{"method":"password",…}],"session_id":"…"}
```

`role` is there and it is **`authenticated`** — Postgres's role, which rides in every access
token. This is the confusion ADR 0018 named, observed: a Layline **Role** is a different
thing in a different place, and the sailor above is a `viewer`. Reading `claims.role` would
have given every signed-in sailor the same word.

The address arrives as a top-level `email` claim, which is what `resolveAccount()` requires
before it will call anything an Account.

## 2. All three shapes `getClaims()` returns, from a real server

| Called with | Observed |
|---|---|
| a valid access token | `{ data: { claims }, error: null }` — `sub`, `email` and `role: 'authenticated'` as above |
| a token with four bytes of its signature replaced | `{ data: null, error: 'Invalid JWT signature' }` |
| no session at all | `{ data: null, error: null }` |

The third row is the one worth having: **not signed in is not an error**, and it arrives as a
pair of nulls rather than as a thrown exception or an error object. `resolveAccount()` treats
it as a **Guest** silently and logs nothing, which is only correct because of this.

> **`getClaims()` did not verify locally here, and ADR 0018's phrasing needs the caveat.**
> `auth-js` only verifies in-process when the token's `alg` is asymmetric and carries a
> `kid`; for `HS256` it sets `signingKey = null` and falls back to a `getUser(token)` call
> over the network (`GoTrueClient.getClaims`). The local stack signs with the legacy shared
> HS256 secret, so every check above was a round trip to `/auth/v1/user`. Local verification
> is real, and it is conditional on the project having moved to an asymmetric signing key —
> which is a Supabase dashboard setting on the hosted project, not something in this repo.
> Either way `getClaims()` is the right call: it is never *worse* than `getUser()`.

## 3. The select `resolveAccount()` makes, as the sailor

```js
supabase.from('profiles').select('display_name, role').eq('user_id', userId).maybeSingle()
```

| Signed in as | Observed |
|---|---|
| the viewer with a name | `{"display_name":"Alex Pieprzycki","role":"viewer"}` |
| the admin with no name | `{"display_name":null,"role":"admin"}` |

Both **Roles** come back from the row, and a null **Display Name** arrives as `null` rather
than as an empty string — so the drawer's "no initials, address on the name line" case is a
real state a real account reaches, not a defensive branch.

## 4. A sailor sees exactly one row

With two accounts in the table:

```js
supabase.from('profiles').select('user_id, display_name, role')
// [{"user_id":"9c11001d-…","display_name":"Alex Pieprzycki","role":"viewer"}]
```

And asking for the other sailor's row by `user_id` returns **`null` with no error**.

> This is the finding to remember: **a row RLS hides is indistinguishable from a row that
> does not exist.** `maybeSingle()` gives `{ data: null, error: null }` for both, which is
> the same shape `resolveAccount()` reports as "the Profile the trigger promises is missing"
> and turns into a **Guest** with a `console.error`. So that log line means *either* a
> missing Profile *or* a policy that stopped looking — worth knowing before debugging one as
> the other.

## 5. A Guest reads nothing

The same select with the anon key and no session: `null`, no error. The weather half of the
app needs no Profile, and cannot see one.

## Cleanup

```bash
curl -s -X DELETE "$API/auth/v1/admin/users/<uuid>" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
```

Deleting the account removes the Profile with it (verified in the LAY-125 record, §10). Both
verification accounts were deleted after this run; `profiles` was left empty, as it was
found.

## Not covered

- **The Google round trip.** No browser here, and Google blocks automated ones. Whether the
  `name` claim actually arrives from a Google grant — and therefore whether a real
  **Display Name** is ever null — is the owner's to confirm.
- **The cookie plumbing.** These checks call the SDK with a bearer token; the app reaches the
  same place through `@supabase/ssr` and the request cookies. What that path adds is Next's,
  not Supabase's, and the reason `/auth/callback` completes the exchange in the browser is
  written up in ADR 0021's LAY-126 amendment.
- **The hosted project**, including whether its JWT signing key is asymmetric, which decides
  whether §2 is a network call in production.
